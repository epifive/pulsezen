import "server-only";
import crypto from "node:crypto";
import { BlockList, isIP } from "node:net";
import type { Insertable } from "kysely";
import { after } from "next/server";
import { isbot } from "isbot";
import { hostMatches, matchesPattern, normalizeEventName } from "@/analytics/normalize";
import { PAGEVIEW, SCREEN_BUCKETS, VISIT_TIMEOUT_SEC, type SiteSettings } from "@/analytics/types";
import { getDb, now } from "./db";
import type { EventsTable } from "./db/schema";
import { lookupGeo } from "./geoip";
import { getEntitlements } from "./plans";
import { BodyTooLargeError, isRecord, parseJsonText, readBodyText } from "./public-api";
import { clientIp, rateLimit } from "./rate-limit";
import { getDailySalt, saltDay, visitorHash } from "./salts";
import { getSettings } from "./settings";
import { getSiteByKey, type SiteRecord } from "./sites";
import { attribute, parseReferrer, readUtm } from "./sources";
import { parseUserAgent } from "./useragent";

/**
 * Event collection: POST /api/event (see src/app/api/event/route.ts).
 *
 * Validates the tracker payload (TrackPayload, src/analytics/types.ts), drops bots and
 * excluded traffic, enriches the event (source, channel, UTM, browser, OS, device,
 * screen, language, location), assigns the anonymous daily visitor hash and the visit,
 * and queues the row. The queue is written in multi-row inserts every 2 seconds or
 * 200 rows, and after every response via `after()` so serverless hosts persist the
 * rows before the function is frozen. No cookies, no IP addresses are stored.
 */

export const MAX_EVENT_BYTES = 2048;
const FLUSH_MS = 2000;
const FLUSH_ROWS = 200;
/** Rows kept in memory while the database is unavailable. */
const MAX_QUEUE = 50_000;
const SITE_TTL_MS = 10_000;
const QUOTA_TTL_MS = 60_000;
/** Events are dropped once an account is this far over its monthly limit. */
const QUOTA_GRACE = 1.1;
/** Events per minute per visitor IP and site. */
const RATE_LIMIT_PER_MIN = Math.max(1, Number(process.env.EVENT_RATE_LIMIT_PER_MIN) || 120);
/**
 * Events per minute per connecting IP and site for forwarded (proxied) events. A first-party
 * proxy sends for all its visitors, but X-Forwarded-For can also be forged to look like many
 * visitors, so this cap is kept moderate; raise it for very busy proxied websites.
 */
const PROXY_RATE_LIMIT_PER_MIN = Math.max(1, Number(process.env.EVENT_PROXY_RATE_LIMIT_PER_MIN) || 600);
const SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY || process.env.PULSEZEN_SERVERLESS);

export const EVENT_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "no-store",
};

type EventRow = Insertable<EventsTable>;

interface UsageDelta {
  userId: number;
  month: string;
  pageviews: number;
  events: number;
}

interface Quota {
  allowed: boolean;
  limit: number;
  used: number;
  month: string;
  at: number;
}

interface IngestState {
  rows: EventRow[];
  usage: Map<string, UsageDelta>;
  verify: Set<number>;
  verified: Set<number>;
  timer: ReturnType<typeof setTimeout> | null;
  flushing: Promise<void> | null;
  waiters: Array<() => void>;
  visits: Map<string, { visitId: string; last: number }>;
  locks: Map<string, Promise<unknown>>;
  sites: Map<string, { site: SiteRecord | null; at: number }>;
  quotas: Map<number, Promise<Quota>>;
  blockLists: Map<string, BlockList | null>;
}

// Survives hot reloads in development (one queue per process).
const globalForIngest = globalThis as unknown as { __pulsezenIngest?: IngestState };
const state: IngestState = (globalForIngest.__pulsezenIngest ??= {
  rows: [],
  usage: new Map(),
  verify: new Set(),
  verified: new Set(),
  timer: null,
  flushing: null,
  waiters: [],
  visits: new Map(),
  locks: new Map(),
  sites: new Map(),
  quotas: new Map(),
  blockLists: new Map(),
});

// ── Responses ──

function reply(status: number, error?: string, extra: Record<string, string> = {}): Response {
  if (!error) return new Response(null, { status, headers: { ...EVENT_CORS_HEADERS, ...extra } });
  return Response.json({ error }, { status, headers: { ...EVENT_CORS_HEADERS, ...extra } });
}

/** 202 for accepted and for silently dropped events (bots, exclusions, quota) alike. */
const accepted = () => reply(202);

export function preflightResponse(): Response {
  return new Response(null, { status: 204, headers: EVENT_CORS_HEADERS });
}

// ── Payload ──

interface Payload {
  name: string;
  url: URL;
  key: string;
  referrer: string;
  width: number;
  props: Record<string, string>;
  revenue: { cents: number; currency: string } | null;
}

function readPayload(body: unknown): Payload | string {
  if (!isRecord(body)) return "Invalid payload.";
  const name = normalizeEventName(body.n);
  if (!name) return "Missing or invalid event name (n).";
  if (typeof body.d !== "string" || !/^[A-Za-z0-9]{8,32}$/.test(body.d)) return "Missing or invalid site key (d).";
  if (typeof body.u !== "string" || body.u.length > 2000) return "Missing or invalid page URL (u).";
  let url: URL;
  try {
    url = new URL(body.u);
  } catch {
    return "Missing or invalid page URL (u).";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "Missing or invalid page URL (u).";
  if (body.r !== undefined && body.r !== null && typeof body.r !== "string") return "Invalid referrer (r).";
  if (body.w !== undefined && body.w !== null && typeof body.w !== "number") return "Invalid screen width (w).";
  if (body.p !== undefined && body.p !== null && !isRecord(body.p)) return "Invalid properties (p).";

  const props: Record<string, string> = {};
  if (isRecord(body.p)) {
    let count = 0;
    for (const [k, v] of Object.entries(body.p)) {
      if (count >= 20) break;
      const key = k.replace(/[\x00-\x1F\x7F]/g, "").trim().slice(0, 40);
      if (!key || key.startsWith("$")) continue;
      if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") continue;
      props[key] = String(v).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").slice(0, 200);
      count += 1;
    }
  }

  // Revenue: amount in major units and an optional ISO 4217 currency ("" = not given).
  let revenue: Payload["revenue"] = null;
  if (isRecord(body.$) && name !== PAGEVIEW) {
    const amount = typeof body.$.amount === "string" ? Number(body.$.amount) : body.$.amount;
    const currency = typeof body.$.currency === "string" ? body.$.currency.trim().toUpperCase() : "";
    if (typeof amount === "number" && Number.isFinite(amount) && Math.abs(amount) < 1e10 && (!currency || /^[A-Z]{3}$/.test(currency))) {
      revenue = { cents: Math.round(amount * 100), currency };
      if (currency) props.$currency = currency;
    }
  }

  return {
    name,
    url,
    key: body.d,
    referrer: typeof body.r === "string" ? body.r.slice(0, 2000) : "",
    width: typeof body.w === "number" && Number.isFinite(body.w) ? Math.max(0, Math.round(body.w)) : 0,
    props,
    revenue,
  };
}

// ── Sites, hosts and exclusions ──

async function siteForKey(key: string): Promise<SiteRecord | null> {
  const hit = state.sites.get(key);
  if (hit && Date.now() - hit.at < SITE_TTL_MS) return hit.site;
  const site = (await getSiteByKey(key)) ?? null;
  if (state.sites.size > 5000) state.sites.clear();
  state.sites.set(key, { site, at: Date.now() });
  return site;
}

/** Forget cached site data (call after changing a site's domain or settings). */
export function forgetSite(publicKey?: string): void {
  if (publicKey) state.sites.delete(publicKey);
  else state.sites.clear();
}

function cleanHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

function isLocalHost(host: string): boolean {
  return host === "localhost" || host.endsWith(".localhost") || host === "[::1]" || host === "0.0.0.0" || /^127\.\d+\.\d+\.\d+$/.test(host);
}

/** The site's own hostnames: its domain, subdomains and extra domains. */
function isSiteHost(host: string, site: SiteRecord): boolean {
  const h = cleanHost(host);
  return hostMatches(h, site.domain) || site.settings.extraDomains.some((d) => hostMatches(h, d));
}

function hostAllowed(host: string, site: SiteRecord): boolean {
  const h = cleanHost(host);
  if (isLocalHost(h)) return site.settings.allowLocalhost || site.domain === "localhost";
  return isSiteHost(h, site);
}

function originAllowed(request: Request, site: SiteRecord): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return true;
  try {
    return hostAllowed(new URL(origin).hostname, site);
  } catch {
    return false;
  }
}

/** Page path: no query string, decoded, no trailing slash ("/" stays), hash route kept when enabled. */
export function pagePath(url: URL, settings: Pick<SiteSettings, "hashRouting">): string {
  const decode = (s: string) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  let path = decode(url.pathname).replace(/[\x00-\x1F\x7F]/g, "");
  if (path.length > 1) path = path.replace(/\/+$/, "") || "/";
  const hash = url.hash.split("?")[0];
  if (hash.length > 1 && (settings.hashRouting || /^#!?\//.test(hash))) path += decode(hash).replace(/[\x00-\x1F\x7F]/g, "");
  return path.slice(0, 500) || "/";
}

function blockListFor(entries: string[]): BlockList | null {
  if (!entries.length) return null;
  const cacheKey = entries.join(",");
  if (state.blockLists.has(cacheKey)) return state.blockLists.get(cacheKey)!;
  const list = new BlockList();
  for (const entry of entries) {
    try {
      const [addr, prefix] = entry.split("/");
      const type = isIP(addr);
      if (!type) continue;
      const family = type === 4 ? "ipv4" : "ipv6";
      if (prefix !== undefined) list.addSubnet(addr, Number(prefix), family);
      else list.addAddress(addr, family);
    } catch {
      // ignore invalid entries
    }
  }
  if (state.blockLists.size > 1000) state.blockLists.clear();
  state.blockLists.set(cacheKey, list);
  return list;
}

function normalizeIp(ip: string): string {
  const v = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? mapped[1] : v;
}

/**
 * The visitor's IP for the anonymous hash, location and IP exclusions: the first valid
 * address in X-Forwarded-For (the original client, also behind a first-party proxy such
 * as /stats/api/event on the customer's site), else the connecting address. A forged
 * header only changes the sender's own anonymous statistics; rate limits also use the
 * trusted connecting address (EVENT_PROXY_RATE_LIMIT_PER_MIN). Like every web analytics
 * collector, the endpoint is public and accepts made-up events within these limits.
 */
function visitorIp(h: Headers, connecting: string): string {
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    for (const part of forwarded.split(",")) {
      const ip = normalizeIp(part);
      if (isIP(ip)) return ip;
    }
  }
  return connecting;
}

function ipExcluded(ip: string, entries: string[]): boolean {
  const list = blockListFor(entries);
  if (!list) return false;
  const type = isIP(ip);
  if (!type) return false;
  try {
    return list.check(ip, type === 4 ? "ipv4" : "ipv6");
  } catch {
    return false;
  }
}

// ── Bots ──

let botPatternsRaw: string | null = null;
let botPatterns: string[] = [];

async function isBotRequest(h: Headers, ua: string): Promise<boolean> {
  if (!ua || ua.length < 10) return true;
  const purpose = `${h.get("purpose") ?? ""} ${h.get("sec-purpose") ?? ""} ${h.get("x-purpose") ?? ""} ${h.get("x-moz") ?? ""}`.toLowerCase();
  if (/prefetch|preview/.test(purpose)) return true;
  if (isbot(ua)) return true;
  const raw = (await getSettings()).bot_patterns ?? "";
  if (raw !== botPatternsRaw) {
    botPatternsRaw = raw;
    botPatterns = raw
      .split(/\r?\n/)
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean);
  }
  if (botPatterns.length) {
    const lower = ua.toLowerCase();
    if (botPatterns.some((p) => lower.includes(p))) return true;
  }
  return false;
}

// ── Enrichment ──

export function screenBucket(width: number): string {
  if (!width) return "";
  const [xs, sm, md, lg, xl, xxl] = SCREEN_BUCKETS;
  if (width < 576) return xs;
  if (width < 768) return sm;
  if (width < 992) return md;
  if (width < 1280) return lg;
  if (width < 1920) return xl;
  return xxl;
}

/** Primary language subtag of the first Accept-Language entry ("en-US,en;q=0.9" → "en"). */
export function primaryLanguage(header: string | null): string {
  const tag = (header ?? "").split(",")[0].split(";")[0].trim().split(/[-_]/)[0].toLowerCase();
  return /^[a-z]{2,3}$/.test(tag) ? tag : "";
}

// ── Quota ──

const currentMonth = () => new Date().toISOString().slice(0, 7);

function pendingUsage(userId: number, month: string): number {
  const u = state.usage.get(`${userId}:${month}`);
  return u ? u.pageviews + u.events : 0;
}

async function loadQuota(userId: number): Promise<Quota> {
  const month = currentMonth();
  const db = await getDb();
  const user = await db.selectFrom("users").select(["id", "role", "status", "plan_id", "plan_expires_at"]).where("id", "=", userId).executeTakeFirst();
  if (!user || user.status !== "active") return { allowed: false, limit: 0, used: 0, month, at: Date.now() };
  const entitlements = await getEntitlements(user);
  const row = await db.selectFrom("usage_monthly").select(["pageviews", "events"]).where("user_id", "=", userId).where("month", "=", month).executeTakeFirst();
  const used = Number(row?.pageviews ?? 0) + Number(row?.events ?? 0) + pendingUsage(userId, month);
  return { allowed: true, limit: entitlements.maxMonthlyPageviews, used, month, at: Date.now() };
}

/** Reserves one event for the site owner. False when the account is banned/deleted or over its limit (+10 %). */
async function takeQuota(userId: number): Promise<boolean> {
  let pending = state.quotas.get(userId);
  if (pending) {
    const q = await pending;
    if (Date.now() - q.at > QUOTA_TTL_MS || q.month !== currentMonth()) pending = undefined;
  }
  if (!pending) {
    pending = loadQuota(userId);
    pending.catch(() => state.quotas.delete(userId));
    if (state.quotas.size > 10_000) state.quotas.clear();
    state.quotas.set(userId, pending);
  }
  const q = await pending;
  if (!q.allowed) return false;
  if (q.limit > 0 && q.used >= Math.floor(q.limit * QUOTA_GRACE)) return false;
  q.used += 1;
  return true;
}

/** Forget cached plan limits for a user (e.g. right after an upgrade). */
export function forgetQuota(userId?: number): void {
  if (userId === undefined) state.quotas.clear();
  else state.quotas.delete(userId);
}

// ── Visits ──

function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = state.locks.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  state.locks.set(key, tail);
  void tail.then(() => {
    if (state.locks.get(key) === tail) state.locks.delete(key);
  });
  return run;
}

const newVisitId = () => crypto.randomBytes(12).toString("base64url").slice(0, 16);

/** Same visit when the visitor's previous event is less than 30 minutes old; otherwise a new one. */
function resolveVisit(siteId: number, sessionHash: string, at: number): Promise<{ visit_id: string; gap_sec: number; is_entry: number }> {
  const key = `${siteId}:${sessionHash}`;
  return withLock(key, async () => {
    const timeoutMs = VISIT_TIMEOUT_SEC * 1000;
    let last = state.visits.get(key);
    if (!last) {
      const db = await getDb();
      const row = await db
        .selectFrom("events")
        .select(["visit_id", "ts"])
        .where("site_id", "=", siteId)
        .where("session_hash", "=", sessionHash)
        .where("ts", ">=", new Date(at - timeoutMs).toISOString())
        .orderBy("ts", "desc")
        .limit(1)
        .executeTakeFirst();
      if (row?.visit_id) last = { visitId: row.visit_id, last: Date.parse(row.ts) };
    }
    let result;
    if (last && at - last.last < timeoutMs) {
      result = { visit_id: last.visitId, gap_sec: Math.max(0, Math.round((at - last.last) / 1000)), is_entry: 0 };
    } else {
      result = { visit_id: newVisitId(), gap_sec: 0, is_entry: 1 };
    }
    // LRU: re-insert so the most recent visitors stay in memory.
    state.visits.delete(key);
    state.visits.set(key, { visitId: result.visit_id, last: Math.max(at, last?.last ?? 0) });
    if (state.visits.size > 100_000) {
      const cutoff = Date.now() - timeoutMs;
      for (const [k, v] of state.visits) {
        if (state.visits.size <= 80_000 && v.last >= cutoff) break;
        state.visits.delete(k);
      }
    }
    return result;
  });
}

// ── Queue ──

function enqueue(row: EventRow, userId: number, isPageview: boolean, site: SiteRecord): void {
  if (state.rows.length >= MAX_QUEUE) {
    state.rows.splice(0, state.rows.length - MAX_QUEUE + 1);
    console.error(`[pulsezen] event queue full (${MAX_QUEUE} rows): the database is not accepting writes, oldest events dropped.`);
  }
  state.rows.push(row);
  const month = row.ts.slice(0, 7);
  const key = `${userId}:${month}`;
  const usage = state.usage.get(key) ?? { userId, month, pageviews: 0, events: 0 };
  if (isPageview) usage.pageviews += 1;
  else usage.events += 1;
  state.usage.set(key, usage);
  if (!site.verifiedAt && !state.verified.has(site.id)) state.verify.add(site.id);

  if (state.rows.length >= FLUSH_ROWS) void flushEvents();
  else scheduleFlush(FLUSH_MS);
}

function scheduleFlush(ms: number): void {
  if (state.timer) return;
  state.timer = setTimeout(() => {
    state.timer = null;
    void flushEvents();
  }, ms);
  state.timer.unref?.();
}

async function writeBatch(rows: EventRow[], usage: UsageDelta[], verify: number[]): Promise<void> {
  const db = await getDb();
  await db.transaction().execute(async (trx) => {
    for (let i = 0; i < rows.length; i += FLUSH_ROWS) {
      await trx.insertInto("events").values(rows.slice(i, i + FLUSH_ROWS)).execute();
    }
    // Portable upsert: update, insert when missing, update again if another process inserted first.
    for (const u of usage) {
      const increment = () =>
        trx
          .updateTable("usage_monthly")
          .set((eb) => ({ pageviews: eb("pageviews", "+", u.pageviews), events: eb("events", "+", u.events) }))
          .where("user_id", "=", u.userId)
          .where("month", "=", u.month)
          .executeTakeFirst();
      const updated = await increment();
      if (Number(updated.numUpdatedRows) > 0) continue;
      try {
        await trx.insertInto("usage_monthly").values({ user_id: u.userId, month: u.month, pageviews: u.pageviews, events: u.events }).execute();
      } catch {
        await increment();
      }
    }
  });
  if (verify.length) {
    await db.updateTable("sites").set({ verified_at: now() }).where("id", "in", verify).where("verified_at", "is", null).execute();
  }
}

async function runFlush(): Promise<void> {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  const rows = state.rows.splice(0, state.rows.length);
  const usage = [...state.usage.values()];
  state.usage.clear();
  const verify = [...state.verify];
  state.verify.clear();
  const waiters = state.waiters.splice(0, state.waiters.length);
  try {
    if (rows.length || usage.length || verify.length) await writeBatch(rows, usage, verify);
    for (const id of verify) state.verified.add(id);
  } catch (err) {
    // Keep everything for the next attempt; nothing is lost while the process runs.
    state.rows.unshift(...rows);
    if (state.rows.length > MAX_QUEUE) state.rows.splice(0, state.rows.length - MAX_QUEUE);
    for (const u of usage) {
      const key = `${u.userId}:${u.month}`;
      const cur = state.usage.get(key);
      if (cur) {
        cur.pageviews += u.pageviews;
        cur.events += u.events;
      } else state.usage.set(key, u);
    }
    for (const id of verify) state.verify.add(id);
    console.error(`[pulsezen] could not save ${rows.length} events, retrying in 5 s:`, err instanceof Error ? err.message : err);
    scheduleFlush(5000);
  } finally {
    for (const done of waiters) done();
  }
}

/** Writes all queued events now. Concurrent calls wait for the running write, then flush what is left. */
export async function flushEvents(): Promise<void> {
  while (state.flushing) await state.flushing;
  if (!state.rows.length && !state.usage.size && !state.verify.size) return;
  state.flushing = runFlush().finally(() => {
    state.flushing = null;
  });
  await state.flushing;
}

/** Resolves when the rows queued so far have been written (or the write failed and was rescheduled). */
function untilFlushed(): Promise<void> {
  if (!state.rows.length) return Promise.resolve();
  return new Promise((resolve) => state.waiters.push(resolve));
}

/** Rows waiting to be written (for realtime counts). */
export function pendingEvents(siteId: number, sinceIso: string): EventRow[] {
  return state.rows.filter((r) => r.site_id === siteId && r.ts >= sinceIso);
}

// ── Handler ──

export async function handleEvent(request: Request): Promise<Response> {
  const type = (request.headers.get("content-type") ?? "text/plain").toLowerCase();
  if (!type.startsWith("text/plain") && !type.startsWith("application/json")) return reply(415, "Send the event as text/plain or application/json.");

  let text: string;
  try {
    text = await readBodyText(request, MAX_EVENT_BYTES);
  } catch (err) {
    if (err instanceof BodyTooLargeError) return reply(413, `The event is larger than ${MAX_EVENT_BYTES} bytes.`);
    return reply(400, "Could not read the request body.");
  }
  const body = parseJsonText(text);
  if (body === undefined) return reply(400, "The body must be JSON.");
  const payload = readPayload(body);
  if (typeof payload === "string") return reply(400, payload);

  const connecting = normalizeIp(await clientIp());
  const ip = visitorIp(request.headers, connecting);
  // Both limits apply to forwarded events: per visitor, and per connecting address (so a
  // sender forging X-Forwarded-For can't multiply the per-visitor limit without bound).
  const proxied = ip !== connecting;
  if (!rateLimit(`ev:${ip}:${payload.key}`, RATE_LIMIT_PER_MIN, 60_000) || (proxied && !rateLimit(`evp:${connecting}:${payload.key}`, PROXY_RATE_LIMIT_PER_MIN, 60_000))) {
    return reply(429, "Too many events.", { "Retry-After": "60" });
  }

  const site = await siteForKey(payload.key);
  if (!site) return reply(404, "Unknown site.");
  if (!hostAllowed(payload.url.hostname, site) || !originAllowed(request, site)) {
    return reply(403, "This hostname is not allowed to send events for this site.");
  }

  const h = request.headers;
  const ua = (h.get("user-agent") ?? "").slice(0, 1000);
  if (await isBotRequest(h, ua)) return accepted();

  const settings = site.settings;
  const pathname = pagePath(payload.url, settings);
  if (settings.excludePaths.some((p) => matchesPattern(p, pathname))) return accepted();
  if (settings.excludeIps.length && ipExcluded(ip, settings.excludeIps)) return accepted();
  if (!(await takeQuota(site.userId))) return accepted();

  const at = Date.now();
  const ts = new Date(at).toISOString();
  const salt = await getDailySalt(saltDay(new Date(at)));
  const sessionHash = visitorHash(salt, ip, ua, site.id);
  const visit = await resolveVisit(site.id, sessionHash, at);

  // Revenue is counted only in the platform currency (or without a currency): amounts in
  // other currencies are not added up (no conversion); their `$currency` property is kept.
  const platformCurrency = ((await getSettings()).currency || "USD").trim().toUpperCase();
  const revenueCents = payload.revenue && (!payload.revenue.currency || payload.revenue.currency === platformCurrency) ? payload.revenue.cents : null;

  const params = payload.url.searchParams;
  const utm = readUtm(params);
  const referrer = parseReferrer(payload.referrer, (host) => isSiteHost(host, site));
  const { source, channel } = attribute(referrer, utm, params);
  const agent = parseUserAgent(ua);
  // Behind a first-party proxy the platform's geo headers describe the proxy: use the GeoIP file only.
  const geo = await lookupGeo(h, ip, (await getSettings()).geoip_db_path ?? "", { proxied });

  const row: EventRow = {
    site_id: site.id,
    ts,
    session_hash: sessionHash,
    name: payload.name,
    pathname,
    hostname: cleanHost(payload.url.hostname).slice(0, 255),
    referrer_host: referrer.host,
    referrer_path: referrer.path,
    source,
    channel,
    ...utm,
    country: geo.country,
    region: geo.region,
    city: geo.city,
    browser: agent.browser,
    browser_version: agent.browserVersion,
    os: agent.os,
    device: agent.device,
    screen: screenBucket(payload.width),
    lang: primaryLanguage(h.get("accept-language")),
    props: Object.keys(payload.props).length ? JSON.stringify(payload.props) : null,
    revenue_cents: revenueCents,
    visit_id: visit.visit_id,
    gap_sec: visit.gap_sec,
    is_entry: visit.is_entry,
  };
  enqueue(row, site.userId, payload.name === PAGEVIEW, site);

  // Serverless: write before the function freezes. Long-running servers: the request's
  // lifecycle ends when its batch (2 s / 200 rows) has been written.
  try {
    after(() => (SERVERLESS ? flushEvents() : untilFlushed()));
  } catch {
    // Not inside a request scope (e.g. called from a script): the timer flushes.
  }
  return accepted();
}
