import "server-only";
import { sql, type Kysely, type RawBuilder } from "kysely";
import { PAGEVIEW, type AggregateResult, type BreakdownRow, type Dimension, type Filter, type Granularity, type Period, type StatsQuery, type TimeseriesPoint } from "@/analytics/types";
import { dbDriver, getDb } from "./db";
import type { Database } from "./db/schema";
import { getSiteGoals, type GoalRecord } from "./goals";
import { AI_SOURCES } from "./sources";
import { addDays, buckets, bucketLabelOfDay, daysBetween, localDay, previousRange, resolvePeriod as resolveDates, utcBounds, type ResolvedPeriod } from "./stats-dates";

/**
 * The stats engine behind the dashboard, shared dashboards, the Stats API, email
 * reports and traffic alerts. Every query works on MySQL/MariaDB and SQLite: plain
 * SQL with COUNT(DISTINCT …), SUM(CASE …), MIN/MAX and LIKE … ESCAPE only.
 *
 * Definitions
 * - visitors: distinct `session_hash`. The hash rotates every day, so over several
 *   days this is the sum of daily unique visitors (like Plausible's "unique visitors").
 * - visits: distinct `visit_id` (a visit ends after 30 minutes of inactivity).
 * - pageviews: events named "pageview"; events: every other (custom) event.
 * - bounce rate: visits made of exactly one pageview and nothing else, ÷ visits.
 * - visit duration: average over visits of (last event − first event), computed as
 *   the sum of `gap_sec` of the visit's non-entry events.
 * - entry page: the page of the event that started the visit (`is_entry = 1`);
 *   exit page: the last pageview of the visit.
 * - conversion rate: visitors who completed the goal ÷ visitors.
 *
 * Filters: page / hostname / event / goal match single events; every other dimension
 * (entry page, exit page, source, channel, UTM, location, device…) selects whole visits,
 * judged by the visit's first event.
 *
 * Old days: raw events older than the plan's retention are deleted after they are
 * summarised into `rollup_daily` (src/lib/rollups.ts). Days before the oldest raw event are
 * read from there (dimension "total" for totals and charts, the dimension itself for
 * breakdowns). Rollups can't combine filters, so with filters other than a single "is"
 * those days are skipped and results carry `approximate: true`. A single "is" filter is
 * exact for totals, charts and the breakdown of its own dimension; breakdowns of other
 * dimensions and goal conversions leave those days out (also `approximate`). The
 * "AI assistants" tab (sources with channel = ai) reads the source rollups of the known AI
 * sources. Custom event properties are not rolled up: property breakdowns only cover days
 * that still have raw events. Unfiltered ranges of three months or more also read finished
 * days from the rollups, for speed.
 *
 * Event names are case-sensitive everywhere (MySQL compares them in binary, like SQLite).
 */

type Db = Kysely<Database>;
type Expr = RawBuilder<unknown>;

export type { ResolvedPeriod } from "./stats-dates";

export const MAX_BREAKDOWN_LIMIT = 100;

/** Dimensions that describe one event (the rest describe the visit). */
const EVENT_LEVEL = new Set<Dimension>(["page", "hostname", "event", "goal"]);

const COLUMN: Record<Exclude<Dimension, "goal">, string> = {
  page: "pathname",
  entry_page: "pathname",
  exit_page: "pathname",
  hostname: "hostname",
  channel: "channel",
  source: "source",
  referrer: "referrer_host",
  utm_source: "utm_source",
  utm_medium: "utm_medium",
  utm_campaign: "utm_campaign",
  utm_term: "utm_term",
  utm_content: "utm_content",
  country: "country",
  region: "region",
  city: "city",
  browser: "browser",
  os: "os",
  device: "device",
  screen: "screen",
  lang: "lang",
  event: "name",
};

// ── Small SQL helpers (aliases and column names are code constants, never user input) ──

const col = (alias: string, column: string): Expr => sql.raw(`${alias}.${column}`);
const TRUE: Expr = sql`1 = 1`;
const FALSE: Expr = sql`1 = 0`;
const and = (parts: Expr[]): Expr => (parts.length ? sql`(${sql.join(parts, sql` AND `)})` : TRUE);
const or = (parts: Expr[]): Expr => (parts.length ? sql`(${sql.join(parts, sql` OR `)})` : FALSE);
const n = (v: unknown): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

/** LIKE pattern with "!" as the escape character (works the same on MySQL and SQLite). */
function likeEscape(value: string): string {
  return value.replace(/[!%_]/g, (c) => `!${c}`);
}

/** Goal path pattern with * wildcards → LIKE pattern. */
export function globToLike(pattern: string): string {
  return likeEscape(pattern).replace(/\*/g, "%");
}

/** The same match in memory (case-insensitive like LIKE). */
function globMatch(pattern: string, value: string): boolean {
  const re = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`, "i");
  return re.test(value);
}

/**
 * Case-sensitive equality. MySQL's default collations ignore case, so it also compares the
 * bytes there (the plain `=` keeps the index usable); SQLite's `=` is already exact.
 */
function exactEq(column: Expr, value: string): Expr {
  if (dbDriver() === "mysql") return sql`(${column} = ${value} AND CAST(${column} AS BINARY) = CAST(${value} AS BINARY))`;
  return sql`${column} = ${value}`;
}

/** `exact`: "is" / "is not" are case-sensitive (event names). */
function match(column: Expr, op: Filter["op"], value: string, exact = false): Expr {
  if (op === "is") return exact ? exactEq(column, value) : sql`${column} = ${value}`;
  if (op === "is_not") return exact ? sql`NOT ${exactEq(column, value)}` : sql`${column} <> ${value}`;
  return sql`${column} LIKE ${`%${likeEscape(value)}%`} ESCAPE '!'`;
}

// ── Query context ──

interface Ctx {
  siteId: number;
  fromIso: string;
  toIso: string;
  filters: Filter[];
  goals: GoalRecord[];
}

function inRange(alias: string, ctx: Ctx): Expr {
  return sql`${col(alias, "site_id")} = ${ctx.siteId} AND ${col(alias, "ts")} >= ${ctx.fromIso} AND ${col(alias, "ts")} < ${ctx.toIso}`;
}

function goalMatch(alias: string, goal: Pick<GoalRecord, "type" | "value">): Expr {
  if (goal.type === "event") return exactEq(col(alias, "name"), goal.value);
  return sql`(${col(alias, "name")} = ${PAGEVIEW} AND ${col(alias, "pathname")} LIKE ${globToLike(goal.value)} ESCAPE '!')`;
}

function goalsFor(f: Filter, goals: GoalRecord[]): GoalRecord[] {
  const v = f.value.toLowerCase();
  return goals.filter((g) => (f.op === "contains" ? g.name.toLowerCase().includes(v) : g.name.toLowerCase() === v));
}

/** Visits (in range) that have an event matching `cond` (written for alias "f"). */
function visitsWhere(ctx: Ctx, cond: Expr): Expr {
  return sql`SELECT f.visit_id FROM events f WHERE ${inRange("f", ctx)} AND ${cond}`;
}

/** Visits whose last pageview matches `cond` (written for alias "x"). */
function visitsByExit(ctx: Ctx, cond: Expr): Expr {
  return sql`SELECT x.visit_id FROM events x INNER JOIN (${lastPageviews(ctx)}) lp ON lp.vid = x.visit_id AND lp.mts = x.ts WHERE ${inRange("x", ctx)} AND x.name = ${PAGEVIEW} AND ${cond}`;
}

function lastPageviews(ctx: Ctx): Expr {
  return sql`SELECT l.visit_id AS vid, MAX(l.ts) AS mts FROM events l WHERE ${inRange("l", ctx)} AND l.name = ${PAGEVIEW} GROUP BY l.visit_id`;
}

/**
 * One filter as a condition on alias `a`.
 * mode "row": event-level filters keep matching events only (pageviews of that page…);
 * mode "visit": every filter keeps whole visits (used for visits, bounce rate, duration).
 */
function filterCond(a: string, f: Filter, ctx: Ctx, mode: "row" | "visit"): Expr {
  const negate = f.op === "is_not";
  const visitId = col(a, "visit_id");
  if (f.dimension === "goal") {
    const matched = goalsFor(f, ctx.goals);
    const cond = (alias: string) => or(matched.map((g) => goalMatch(alias, g)));
    if (mode === "row") return negate ? sql`NOT ${cond(a)}` : cond(a);
    return negate ? sql`${visitId} NOT IN (${visitsWhere(ctx, cond("f"))})` : sql`${visitId} IN (${visitsWhere(ctx, cond("f"))})`;
  }
  const column = COLUMN[f.dimension];
  const exact = f.dimension === "event";
  if (EVENT_LEVEL.has(f.dimension)) {
    if (mode === "row") return match(col(a, column), f.op, f.value, exact);
    if (negate) return sql`${visitId} NOT IN (${visitsWhere(ctx, match(col("f", column), "is", f.value, exact))})`;
    return sql`${visitId} IN (${visitsWhere(ctx, match(col("f", column), f.op, f.value, exact))})`;
  }
  if (f.dimension === "exit_page") return sql`${visitId} IN (${visitsByExit(ctx, match(col("x", column), f.op, f.value))})`;
  return sql`${visitId} IN (${visitsWhere(ctx, sql`f.is_entry = 1 AND ${match(col("f", column), f.op, f.value)}`)})`;
}

function scope(a: string, ctx: Ctx, mode: "row" | "visit"): Expr {
  return and([inRange(a, ctx), ...ctx.filters.map((f) => filterCond(a, f, ctx, mode))]);
}

/** Per-visit numbers (alias v: visit_id, n, pv, dur, vstart) for visits matching the filters. */
function visitStats(ctx: Ctx): Expr {
  return sql`SELECT e.visit_id AS visit_id, COUNT(*) AS n, SUM(CASE WHEN e.name = ${PAGEVIEW} THEN 1 ELSE 0 END) AS pv, SUM(CASE WHEN e.is_entry = 0 THEN e.gap_sec ELSE 0 END) AS dur, MIN(e.ts) AS vstart FROM events e WHERE ${scope("e", ctx, "visit")} GROUP BY e.visit_id`;
}

const BOUNCE = sql`CASE WHEN v.n = 1 AND v.pv = 1 THEN 1 ELSE 0 END`;

// ── Raw vs rollup days ──

interface Split {
  /** Local days read from rollup_daily. */
  rollup: { from: string; to: string } | null;
  /** Local days read from raw events. */
  raw: { from: string; to: string } | null;
}

interface Boundary {
  /** First local day fully covered by raw events (null = no raw events at all). */
  rawFrom: string | null;
  /** Last day before `rawFrom` whose rollup has data (null = nothing was purged). */
  lastRolled: string | null;
  /** Last day summarised at all (rollups are built for every finished day). */
  rolledUntil: string | null;
  at: number;
}

const boundaryCache = new Map<string, Boundary>();

async function rawBoundary(db: Db, siteId: number, tz: string): Promise<Boundary> {
  const key = `${siteId}|${tz}`;
  const hit = boundaryCache.get(key);
  if (hit && Date.now() - hit.at < 15_000) return hit;
  const first = await db.selectFrom("events").select(sql<string | null>`MIN(ts)`.as("ts")).where("site_id", "=", siteId).executeTakeFirst();
  let rawFrom = first?.ts ? localDay(new Date(first.ts), tz) : null;
  if (rawFrom) {
    // Retention deletes events by time, so the oldest raw day may be cut in half: when its
    // rollup counted more events than are left, read that day from the rollup instead.
    const rolled = await db
      .selectFrom("rollup_daily")
      .select(["pageviews", "events"])
      .where("site_id", "=", siteId)
      .where("day", "=", rawFrom)
      .where("dimension", "=", "total")
      .executeTakeFirst();
    if (rolled && n(rolled.pageviews) + n(rolled.events) > 0) {
      const { fromIso, toIso } = utcBounds(rawFrom, rawFrom, tz);
      const left = await db.selectFrom("events").select(sql<number>`COUNT(*)`.as("c")).where("site_id", "=", siteId).where("ts", ">=", fromIso).where("ts", "<", toIso).executeTakeFirst();
      if (n(left?.c) < n(rolled.pageviews) + n(rolled.events)) rawFrom = addDays(rawFrom, 1);
    }
  }
  // Days with rolled-up data and no raw events left (zero rows only mark a day as done).
  const last = await db
    .selectFrom("rollup_daily")
    .select(sql<string | null>`MAX(day)`.as("day"))
    .where("site_id", "=", siteId)
    .where("dimension", "=", "total")
    .where((eb) => eb.or([eb("pageviews", ">", 0), eb("events", ">", 0)]))
    .$if(Boolean(rawFrom), (qb) => qb.where("day", "<", rawFrom!))
    .executeTakeFirst();
  const until = await db.selectFrom("rollup_daily").select(sql<string | null>`MAX(day)`.as("day")).where("site_id", "=", siteId).where("dimension", "=", "total").executeTakeFirst();
  const value = { rawFrom, lastRolled: last?.day ?? null, rolledUntil: until?.day ?? null, at: Date.now() };
  boundaryCache.set(key, value);
  if (boundaryCache.size > 5000) boundaryCache.clear();
  return value;
}

/** Unfiltered ranges longer than this read finished days from the rollups (much faster, same definitions). */
const ROLLUP_PREFERRED_DAYS = 92;

async function splitRange(db: Db, q: StatsQuery): Promise<Split> {
  const b = await rawBoundary(db, q.siteId, q.timezone);
  if (b.rolledUntil && b.rolledUntil >= q.from && !q.filters.length && daysBetween(q.from, q.to) >= ROLLUP_PREFERRED_DAYS) {
    const until = b.rolledUntil < q.to ? b.rolledUntil : q.to;
    return { rollup: { from: q.from, to: until }, raw: until < q.to ? { from: addDays(until, 1), to: q.to } : null };
  }
  if (!b.lastRolled || q.from > b.lastRolled) return { rollup: null, raw: { from: q.from, to: q.to } };
  if (!b.rawFrom || q.to < b.rawFrom) return { rollup: { from: q.from, to: q.to }, raw: null };
  return { rollup: { from: q.from, to: addDays(b.rawFrom, -1) }, raw: { from: b.rawFrom, to: q.to } };
}

/** True when part of a range starting on local day `from` is read from daily rollups (raw events purged). */
export async function rangeUsesRollups(siteId: number, from: string, timezone = "UTC"): Promise<boolean> {
  const db = await getDb();
  const b = await rawBoundary(db, siteId, timezone);
  return Boolean(b.lastRolled) && from <= b.lastRolled!;
}

/** Rollups answer "no filter" and a single "is" filter exactly (not goals); anything else is skipped. */
function rollupFilter(filters: Filter[]): { dimension: string; value: string } | null | false {
  if (!filters.length) return null;
  if (filters.length === 1 && filters[0].op === "is" && filters[0].dimension !== "goal") return { dimension: filters[0].dimension, value: filters[0].value };
  return false;
}

export interface QueryInfo {
  /** Some days come from daily rollups. */
  usesRollups: boolean;
  /** Filters could not be applied to the rolled-up days, which were left out (everywhere). */
  approximate: boolean;
  /**
   * Also true for a single "is" filter: totals and the chart include the rolled-up days, but
   * breakdowns of other dimensions and goal conversions leave them out.
   */
  breakdownsApproximate: boolean;
}

export async function getQueryInfo(q: StatsQuery): Promise<QueryInfo> {
  const db = await getDb();
  const split = await splitRange(db, q);
  const rf = split.rollup ? rollupFilter(q.filters) : null;
  return { usesRollups: Boolean(split.rollup), approximate: rf === false, breakdownsApproximate: rf !== null };
}

/** Rolled-up values that answer "channel is X" for a source breakdown: the AI assistants are known by name. */
function rollupValuesForFilter(rf: { dimension: string; value: string }, dimension: Dimension): string[] | null {
  if (dimension === "source" && rf.dimension === "channel" && rf.value === "ai") return [...AI_SOURCES];
  return null;
}

async function makeCtx(q: StatsQuery, days: { from: string; to: string }): Promise<Ctx> {
  const { fromIso, toIso } = utcBounds(days.from, days.to, q.timezone);
  const goals = q.filters.some((f) => f.dimension === "goal") ? await getSiteGoals(q.siteId) : [];
  return { siteId: q.siteId, fromIso, toIso, filters: q.filters, goals };
}

// ── Aggregate ──

interface Totals {
  visitors: number;
  visits: number;
  pageviews: number;
  events: number;
  bounces: number;
  duration: number;
  revenueCents: number;
}

const ZERO: Totals = { visitors: 0, visits: 0, pageviews: 0, events: 0, bounces: 0, duration: 0, revenueCents: 0 };

function addTotals(a: Totals, b: Totals): Totals {
  return {
    visitors: a.visitors + b.visitors,
    visits: a.visits + b.visits,
    pageviews: a.pageviews + b.pageviews,
    events: a.events + b.events,
    bounces: a.bounces + b.bounces,
    duration: a.duration + b.duration,
    revenueCents: a.revenueCents + b.revenueCents,
  };
}

const round = (v: number, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

function finish(t: Totals): AggregateResult {
  return {
    visitors: t.visitors,
    visits: t.visits,
    pageviews: t.pageviews,
    viewsPerVisit: t.visits ? round(t.pageviews / t.visits, 2) : 0,
    bounceRate: t.visits ? round((t.bounces / t.visits) * 100) : 0,
    visitDuration: t.visits ? round(t.duration / t.visits) : 0,
    events: t.events,
    revenueCents: t.revenueCents,
  };
}

async function rawTotals(db: Db, ctx: Ctx): Promise<Totals> {
  const [base, visits] = await Promise.all([
    sql<Record<string, unknown>>`SELECT COUNT(DISTINCT e.session_hash) AS visitors, SUM(CASE WHEN e.name = ${PAGEVIEW} THEN 1 ELSE 0 END) AS pageviews, SUM(CASE WHEN e.name <> ${PAGEVIEW} THEN 1 ELSE 0 END) AS events, SUM(COALESCE(e.revenue_cents, 0)) AS revenue FROM events e WHERE ${scope("e", ctx, "row")}`.execute(db),
    sql<Record<string, unknown>>`SELECT COUNT(*) AS visits, SUM(${BOUNCE}) AS bounces, SUM(v.dur) AS duration FROM (${visitStats(ctx)}) v`.execute(db),
  ]);
  const b = base.rows[0] ?? {};
  const v = visits.rows[0] ?? {};
  return {
    visitors: n(b.visitors),
    pageviews: n(b.pageviews),
    events: n(b.events),
    revenueCents: n(b.revenue),
    visits: n(v.visits),
    bounces: n(v.bounces),
    duration: n(v.duration),
  };
}

async function rollupTotals(db: Db, siteId: number, days: { from: string; to: string }, filter: { dimension: string; value: string } | null): Promise<Totals> {
  const row = await db
    .selectFrom("rollup_daily")
    .select([
      sql<number>`SUM(visitors)`.as("visitors"),
      sql<number>`SUM(visits)`.as("visits"),
      sql<number>`SUM(pageviews)`.as("pageviews"),
      sql<number>`SUM(events)`.as("events"),
      sql<number>`SUM(bounces)`.as("bounces"),
      sql<number>`SUM(duration_sec)`.as("duration"),
      sql<number>`SUM(revenue_cents)`.as("revenue"),
    ])
    .where("site_id", "=", siteId)
    .where("day", ">=", days.from)
    .where("day", "<=", days.to)
    .where("dimension", "=", filter ? filter.dimension : "total")
    .$if(Boolean(filter), (qb) => qb.where("value", "=", filter!.value))
    .executeTakeFirst();
  return {
    visitors: n(row?.visitors),
    visits: n(row?.visits),
    pageviews: n(row?.pageviews),
    events: n(row?.events),
    bounces: n(row?.bounces),
    duration: n(row?.duration),
    revenueCents: n(row?.revenue),
  };
}

export type StatsAggregate = AggregateResult & { approximate: boolean };

async function totalsFor(q: StatsQuery): Promise<{ totals: Totals; approximate: boolean }> {
  const db = await getDb();
  const split = await splitRange(db, q);
  let totals = ZERO;
  let approximate = false;
  if (split.raw) totals = addTotals(totals, await rawTotals(db, await makeCtx(q, split.raw)));
  if (split.rollup) {
    const rf = rollupFilter(q.filters);
    if (rf === false) approximate = true;
    else totals = addTotals(totals, await rollupTotals(db, q.siteId, split.rollup, rf));
  }
  return { totals, approximate };
}

export async function getAggregate(q: StatsQuery): Promise<StatsAggregate> {
  const { totals, approximate } = await totalsFor(q);
  return { ...finish(totals), approximate };
}

export type MetricChanges = Record<"visitors" | "visits" | "pageviews" | "viewsPerVisit" | "bounceRate" | "visitDuration" | "events" | "revenueCents", number | null>;

/** % change from `prev` to `cur` (null when there is nothing to compare with). Bounce rate: percentage points. */
export function metricChanges(cur: AggregateResult, prev: AggregateResult): MetricChanges {
  const pct = (a: number, b: number) => (b ? round(((a - b) / b) * 100) : a ? null : 0);
  return {
    visitors: pct(cur.visitors, prev.visitors),
    visits: pct(cur.visits, prev.visits),
    pageviews: pct(cur.pageviews, prev.pageviews),
    viewsPerVisit: pct(cur.viewsPerVisit, prev.viewsPerVisit),
    bounceRate: prev.visits ? cur.bounceRate - prev.bounceRate : null,
    visitDuration: pct(cur.visitDuration, prev.visitDuration),
    events: pct(cur.events, prev.events),
    revenueCents: pct(cur.revenueCents, prev.revenueCents),
  };
}

/** The query's numbers and those of the same-length period just before it. */
export async function compareAggregate(q: StatsQuery): Promise<{ current: StatsAggregate; previous: StatsAggregate; change: MetricChanges; previousRange: { from: string; to: string } }> {
  const prevRange = previousRange(q.from, q.to);
  const [current, previous] = await Promise.all([getAggregate(q), getAggregate({ ...q, ...prevRange })]);
  return { current, previous, change: metricChanges(current, previous), previousRange: prevRange };
}

// ── Timeseries ──

export interface StatsPoint extends TimeseriesPoint {
  visits: number;
  viewsPerVisit: number;
  bounceRate: number;
  visitDuration: number;
}

function bucketCase(column: string, starts: string[]): Expr {
  if (starts.length <= 1) return sql`0`;
  const whens = starts.slice(1).map((s, i) => sql`WHEN ${sql.raw(column)} < ${s} THEN ${i}`);
  return sql`CASE ${sql.join(whens, sql` `)} ELSE ${starts.length - 1} END`;
}

/**
 * Zero-filled buckets in the site's local time. `withVisits: false` skips the visit
 * query (visits, bounce rate and duration stay 0) — enough for sparklines.
 */
export async function getTimeseries(q: StatsQuery, granularity: Granularity, options: { withVisits?: boolean } = {}): Promise<StatsPoint[]> {
  const db = await getDb();
  const split = await splitRange(db, q);
  const { list } = buckets(q.from, q.to, granularity, q.timezone);
  const acc = list.map(() => ({ ...ZERO }));

  if (split.raw) {
    const ctx = await makeCtx(q, split.raw);
    const starts = list.map((b) => b.startIso);
    const bucket = bucketCase("e.ts", starts);
    const base = await sql<Record<string, unknown>>`SELECT ${bucket} AS bucket, COUNT(DISTINCT e.session_hash) AS visitors, SUM(CASE WHEN e.name = ${PAGEVIEW} THEN 1 ELSE 0 END) AS pageviews FROM events e WHERE ${scope("e", ctx, "row")} GROUP BY bucket`.execute(db);
    for (const r of base.rows) {
      const i = n(r.bucket);
      if (!acc[i]) continue;
      acc[i].visitors += n(r.visitors);
      acc[i].pageviews += n(r.pageviews);
    }
    if (options.withVisits !== false) {
      const vb = bucketCase("v.vstart", starts);
      const visits = await sql<Record<string, unknown>>`SELECT ${vb} AS bucket, COUNT(*) AS visits, SUM(${BOUNCE}) AS bounces, SUM(v.dur) AS duration FROM (${visitStats(ctx)}) v GROUP BY bucket`.execute(db);
      for (const r of visits.rows) {
        const i = n(r.bucket);
        if (!acc[i]) continue;
        acc[i].visits += n(r.visits);
        acc[i].bounces += n(r.bounces);
        acc[i].duration += n(r.duration);
      }
    }
  }

  if (split.rollup && granularity !== "hour") {
    const rf = rollupFilter(q.filters);
    if (rf !== false) {
      const rows = await db
        .selectFrom("rollup_daily")
        .select(["day", "visitors", "visits", "pageviews", "bounces", "duration_sec"])
        .where("site_id", "=", q.siteId)
        .where("day", ">=", split.rollup.from)
        .where("day", "<=", split.rollup.to)
        .where("dimension", "=", rf ? rf.dimension : "total")
        .$if(Boolean(rf), (qb) => qb.where("value", "=", rf ? rf.value : ""))
        .execute();
      const index = new Map(list.map((b, i) => [b.label, i]));
      for (const r of rows) {
        const i = index.get(bucketLabelOfDay(r.day, granularity));
        if (i === undefined) continue;
        acc[i].visitors += n(r.visitors);
        acc[i].visits += n(r.visits);
        acc[i].pageviews += n(r.pageviews);
        acc[i].bounces += n(r.bounces);
        acc[i].duration += n(r.duration_sec);
      }
    }
  }

  return list.map((b, i) => {
    const f = finish(acc[i]);
    return { date: b.label, visitors: f.visitors, pageviews: f.pageviews, visits: f.visits, viewsPerVisit: f.viewsPerVisit, bounceRate: f.bounceRate, visitDuration: f.visitDuration };
  });
}

// ── Breakdowns ──

export interface BreakdownItem extends BreakdownRow {
  /** Visits (visit-level dimensions, entry and exit pages). */
  visits?: number;
}

export interface BreakdownOptions {
  limit?: number;
  offset?: number;
  /** Case-insensitive "contains" on the value. */
  search?: string;
}

function visitRow(r: Record<string, unknown>): BreakdownItem {
  const visits = n(r.visits);
  return {
    value: String(r.dim ?? ""),
    visitors: n(r.visitors),
    visits,
    pageviews: n(r.pageviews),
    bounceRate: visits ? round((n(r.bounces) / visits) * 100) : 0,
    visitDuration: visits ? round(n(r.duration) / visits) : 0,
  };
}

async function rawBreakdown(db: Db, ctx: Ctx, dimension: Exclude<Dimension, "goal">, limit: number, offset: number, search: string): Promise<BreakdownItem[]> {
  const column = COLUMN[dimension];
  const searchCond = (alias: string) => (search ? match(col(alias, column), "contains", search) : TRUE);
  const page = sql`LIMIT ${limit} OFFSET ${offset}`;

  if (dimension === "page" || dimension === "hostname") {
    const res = await sql<Record<string, unknown>>`SELECT e.${sql.raw(column)} AS dim, COUNT(DISTINCT e.session_hash) AS visitors, COUNT(*) AS pageviews FROM events e WHERE ${scope("e", ctx, "row")} AND e.name = ${PAGEVIEW} AND ${searchCond("e")} GROUP BY e.${sql.raw(column)} ORDER BY visitors DESC, pageviews DESC, dim ASC ${page}`.execute(db);
    return res.rows.map((r) => ({ value: String(r.dim ?? ""), visitors: n(r.visitors), pageviews: n(r.pageviews) }));
  }

  if (dimension === "event") {
    // Event names are case-sensitive: on MySQL group by the bytes ("Signup" and "signup" stay apart).
    const groupBy = dbDriver() === "mysql" ? sql`CAST(e.name AS BINARY)` : sql`e.name`;
    const res = await sql<Record<string, unknown>>`SELECT MIN(e.name) AS dim, COUNT(DISTINCT e.session_hash) AS visitors, COUNT(*) AS events, SUM(COALESCE(e.revenue_cents, 0)) AS revenue FROM events e WHERE ${scope("e", ctx, "row")} AND e.name <> ${PAGEVIEW} AND ${searchCond("e")} GROUP BY ${groupBy} ORDER BY visitors DESC, events DESC, dim ASC ${page}`.execute(db);
    return res.rows.map((r) => ({ value: String(r.dim ?? ""), visitors: n(r.visitors), pageviews: 0, events: n(r.events), revenueCents: n(r.revenue) }));
  }

  if (dimension === "exit_page") {
    const res = await sql<Record<string, unknown>>`SELECT x.pathname AS dim, COUNT(DISTINCT x.session_hash) AS visitors, COUNT(DISTINCT x.visit_id) AS visits, SUM(v.pv) AS pageviews, SUM(${BOUNCE}) AS bounces, SUM(v.dur) AS duration FROM events x INNER JOIN (${lastPageviews(ctx)}) lp ON lp.vid = x.visit_id AND lp.mts = x.ts INNER JOIN (${visitStats(ctx)}) v ON v.visit_id = x.visit_id WHERE ${inRange("x", ctx)} AND x.name = ${PAGEVIEW} AND ${searchCond("x")} GROUP BY x.pathname ORDER BY visitors DESC, visits DESC, dim ASC ${page}`.execute(db);
    return res.rows.map(visitRow);
  }

  // Entry page and every visit-level dimension: one row per visit (its entry event).
  const nonEmpty = sql`ent.${sql.raw(column)} <> ''`;
  const res = await sql<Record<string, unknown>>`SELECT ent.${sql.raw(column)} AS dim, COUNT(DISTINCT ent.session_hash) AS visitors, COUNT(*) AS visits, SUM(v.pv) AS pageviews, SUM(${BOUNCE}) AS bounces, SUM(v.dur) AS duration FROM events ent INNER JOIN (${visitStats(ctx)}) v ON v.visit_id = ent.visit_id WHERE ${inRange("ent", ctx)} AND ent.is_entry = 1 AND ${nonEmpty} AND ${searchCond("ent")} GROUP BY ent.${sql.raw(column)} ORDER BY visitors DESC, visits DESC, dim ASC ${page}`.execute(db);
  return res.rows.map(visitRow);
}

async function rollupBreakdown(db: Db, siteId: number, days: { from: string; to: string }, dimension: Dimension, limit: number, offset: number, search: string, values?: string[]): Promise<BreakdownItem[]> {
  if (values && !values.length) return [];
  const rows = await db
    .selectFrom("rollup_daily")
    .select([
      "value",
      sql<number>`SUM(visitors)`.as("visitors"),
      sql<number>`SUM(visits)`.as("visits"),
      sql<number>`SUM(pageviews)`.as("pageviews"),
      sql<number>`SUM(events)`.as("events"),
      sql<number>`SUM(bounces)`.as("bounces"),
      sql<number>`SUM(duration_sec)`.as("duration"),
      sql<number>`SUM(revenue_cents)`.as("revenue"),
    ])
    .where("site_id", "=", siteId)
    .where("dimension", "=", dimension)
    .where("day", ">=", days.from)
    .where("day", "<=", days.to)
    .where("value", "<>", "")
    .$if(Boolean(values), (qb) => qb.where("value", "in", values!))
    .$if(Boolean(search), (qb) => qb.where(sql<boolean>`value LIKE ${`%${likeEscape(search)}%`} ESCAPE '!'`))
    .groupBy("value")
    .orderBy(sql`SUM(visitors) DESC, value ASC`)
    .limit(limit)
    .offset(offset)
    .execute();
  return rows.map((r) => ({
    value: r.value,
    visitors: n(r.visitors),
    visits: n(r.visits),
    pageviews: n(r.pageviews),
    events: n(r.events),
    revenueCents: n(r.revenue),
    bounces: n(r.bounces),
    duration: n(r.duration),
  })).map(({ bounces, duration, ...row }) => ({
    ...row,
    ...(row.visits ? { bounceRate: round((bounces / row.visits) * 100), visitDuration: round(duration / row.visits) } : {}),
  }));
}

function mergeRows(a: BreakdownItem[], b: BreakdownItem[]): BreakdownItem[] {
  const map = new Map<string, BreakdownItem & { _b: number; _d: number }>();
  for (const r of [...a, ...b]) {
    const visits = r.visits ?? 0;
    const bounces = ((r.bounceRate ?? 0) / 100) * visits;
    const duration = (r.visitDuration ?? 0) * visits;
    const cur = map.get(r.value);
    if (!cur) {
      map.set(r.value, { ...r, _b: bounces, _d: duration });
      continue;
    }
    cur.visitors += r.visitors;
    cur.pageviews += r.pageviews;
    if (r.visits !== undefined) cur.visits = (cur.visits ?? 0) + visits;
    if (r.events !== undefined) cur.events = (cur.events ?? 0) + r.events;
    if (r.revenueCents !== undefined) cur.revenueCents = (cur.revenueCents ?? 0) + r.revenueCents;
    cur._b += bounces;
    cur._d += duration;
  }
  return [...map.values()]
    .map(({ _b, _d, ...r }) => (r.visits ? { ...r, bounceRate: round((_b / r.visits) * 100), visitDuration: round(_d / r.visits) } : r))
    .sort((x, y) => y.visitors - x.visitors || (y.visits ?? y.pageviews) - (x.visits ?? x.pageviews) || x.value.localeCompare(y.value));
}

/** Top values of a dimension, sorted by visitors (at most 100 per call). */
export async function getBreakdown(q: StatsQuery, dimension: Dimension, options: BreakdownOptions = {}): Promise<BreakdownItem[]> {
  return (await getBreakdownResult(q, dimension, options)).rows;
}

/** getBreakdown plus `approximate`: rolled-up days were left out because of the filters. */
export async function getBreakdownResult(q: StatsQuery, dimension: Dimension, options: BreakdownOptions = {}): Promise<{ rows: BreakdownItem[]; approximate: boolean }> {
  const limit = Math.min(MAX_BREAKDOWN_LIMIT, Math.max(1, Math.floor(options.limit ?? 10)));
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const search = (options.search ?? "").trim().slice(0, 200);

  if (dimension === "goal") {
    const { goals, approximate } = await goalConversions(q);
    const s = search.toLowerCase();
    return { rows: goals.filter((g) => !s || g.value.toLowerCase().includes(s)).slice(offset, offset + limit), approximate };
  }

  const db = await getDb();
  const split = await splitRange(db, q);
  const rf = split.rollup ? rollupFilter(q.filters) : null;
  // Which rolled-up rows answer this breakdown: all of them (no filter), the filtered value
  // (filter on this dimension), a known list of values (AI sources), or none: those days
  // are left out and the result is approximate.
  let rollupValues: string[] | undefined;
  let useRollup = Boolean(split.rollup) && rf !== false;
  if (useRollup && rf) {
    const values = rf.dimension === dimension ? [rf.value] : rollupValuesForFilter(rf, dimension);
    if (values) rollupValues = values;
    else useRollup = false;
  }
  const approximate = Boolean(split.rollup) && !useRollup;
  const mixed = Boolean(split.raw) && useRollup;
  // In a mixed range the two halves are merged in memory, so read extra rows from each.
  const fetchLimit = mixed ? offset + limit + 200 : limit;
  const fetchOffset = mixed ? 0 : offset;

  const parts: BreakdownItem[][] = [];
  if (split.raw) parts.push(await rawBreakdown(db, await makeCtx(q, split.raw), dimension, fetchLimit, fetchOffset, search));
  if (useRollup && split.rollup) parts.push(await rollupBreakdown(db, q.siteId, split.rollup, dimension, fetchLimit, fetchOffset, search, rollupValues));
  if (!mixed) return { rows: parts[0] ?? [], approximate };
  return { rows: mergeRows(parts[0] ?? [], parts[1] ?? []).slice(offset, offset + limit), approximate };
}

// ── Goals ──

export interface GoalConversion extends BreakdownItem {
  goalId: number;
  type: "pageview" | "event";
  /** Path pattern or event name. */
  pattern: string;
  events: number;
  conversionRate: number;
  revenueCents: number;
}

/** Every goal of the site with unique conversions, completions, conversion rate and revenue. */
export async function getGoalConversions(q: StatsQuery): Promise<GoalConversion[]> {
  return (await goalConversions(q)).goals;
}

async function goalConversions(q: StatsQuery): Promise<{ goals: GoalConversion[]; approximate: boolean }> {
  const goals = await getSiteGoals(q.siteId);
  if (!goals.length) return { goals: [], approximate: false };
  const db = await getDb();
  const split = await splitRange(db, q);
  // Rolled-up days can only answer goal conversions without filters.
  const approximate = Boolean(split.rollup) && q.filters.length > 0;
  const acc = goals.map(() => ({ visitors: 0, events: 0, revenue: 0 }));

  if (split.raw) {
    const ctx = await makeCtx(q, split.raw);
    const selects = goals.map((g, i) => {
      const cond = goalMatch("e", g);
      return sql`COUNT(DISTINCT CASE WHEN ${cond} THEN e.session_hash END) AS v${sql.raw(String(i))}, SUM(CASE WHEN ${cond} THEN 1 ELSE 0 END) AS c${sql.raw(String(i))}, SUM(CASE WHEN ${cond} THEN COALESCE(e.revenue_cents, 0) ELSE 0 END) AS r${sql.raw(String(i))}`;
    });
    const res = await sql<Record<string, unknown>>`SELECT ${sql.join(selects, sql`, `)} FROM events e WHERE ${scope("e", ctx, "row")} AND ${or(goals.map((g) => goalMatch("e", g)))}`.execute(db);
    const row = res.rows[0] ?? {};
    goals.forEach((_, i) => {
      acc[i].visitors += n(row[`v${i}`]);
      acc[i].events += n(row[`c${i}`]);
      acc[i].revenue += n(row[`r${i}`]);
    });
  }
  if (split.rollup) {
    const rf = rollupFilter(q.filters);
    if (rf === null) {
      // Event goals come from the "event" rollups; pageview goals from the matching "page"
      // rollups (a visitor who saw two matching pages on one day is counted twice there).
      const rows = await db
        .selectFrom("rollup_daily")
        .select(["dimension", "value", sql<number>`SUM(visitors)`.as("visitors"), sql<number>`SUM(pageviews)`.as("pageviews"), sql<number>`SUM(events)`.as("events"), sql<number>`SUM(revenue_cents)`.as("revenue")])
        .where("site_id", "=", q.siteId)
        .where("dimension", "in", ["event", "page"])
        .where("day", ">=", split.rollup.from)
        .where("day", "<=", split.rollup.to)
        .groupBy(["dimension", "value"])
        .execute();
      goals.forEach((g, i) => {
        for (const r of rows) {
          if (g.type === "event" ? r.dimension === "event" && r.value === g.value : r.dimension === "page" && globMatch(g.value, r.value)) {
            acc[i].visitors += n(r.visitors);
            acc[i].events += g.type === "event" ? n(r.events) : n(r.pageviews);
            // Page rollups also hold the custom events sent on that page; raw pageviews carry no revenue.
            if (g.type === "event") acc[i].revenue += n(r.revenue);
          }
        }
      });
    }
  }

  const total = (await totalsFor(q)).totals.visitors;
  const rows = goals
    .map((g, i) => ({
      goalId: g.id,
      type: g.type,
      pattern: g.value,
      value: g.name,
      visitors: acc[i].visitors,
      pageviews: 0,
      events: acc[i].events,
      revenueCents: acc[i].revenue,
      conversionRate: total ? round((acc[i].visitors / total) * 100, 1) : 0,
    }))
    .sort((a, b) => b.visitors - a.visitors || b.events - a.events || a.value.localeCompare(b.value));
  return { goals: rows, approximate };
}

// ── Custom event properties ──

/** Raw events read at most when properties are counted in memory (property names). */
export const PROPS_SCAN_CAP = 100_000;

/** Property names that can be used in a JSON path ($."name") on MySQL and SQLite. */
const PATH_SAFE_KEY = /^[^"\\\x00-\x1F]{1,40}$/;

export interface PropertyBreakdown {
  /** Property names (without `prop`) or the values of `prop`, sorted by visitors. */
  rows: BreakdownItem[];
  /** Days without raw events (summarised and deleted) are in the range: properties aren't summarised. */
  approximate: boolean;
  /** Only the latest PROPS_SCAN_CAP matching events were read. */
  truncated: boolean;
}

/**
 * Properties of one custom event (`props`, e.g. the `url` of Outbound Link / File Download).
 * Without `propKey`: the property names sent with the event; with it: that property's values.
 * Each row: value, visitors (distinct visitors), events (completions), revenueCents.
 * The view's filters apply (like the Events tab). Properties are not summarised, so only
 * days that still have raw events are counted.
 */
export async function getPropertyBreakdown(q: StatsQuery, eventName: string, propKey?: string | null, options: BreakdownOptions = {}): Promise<PropertyBreakdown> {
  const limit = Math.min(MAX_BREAKDOWN_LIMIT, Math.max(1, Math.floor(options.limit ?? 10)));
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const search = (options.search ?? "").trim().slice(0, 200);
  const db = await getDb();
  const b = await rawBoundary(db, q.siteId, q.timezone);
  const approximate = Boolean(b.lastRolled) && q.from <= b.lastRolled!;
  const ctx = await makeCtx(q, { from: q.from, to: q.to });
  const where = sql`${scope("e", ctx, "row")} AND ${exactEq(sql.raw("e.name"), eventName)} AND e.props IS NOT NULL`;
  const key = propKey ?? "";

  if (key && PATH_SAFE_KEY.test(key)) {
    // Exact counts in SQL. Values are stored as JSON strings.
    const path = `$."${key}"`;
    const value = dbDriver() === "mysql" ? sql`JSON_UNQUOTE(JSON_EXTRACT(e.props, ${path}))` : sql`json_extract(e.props, ${path})`;
    const searchCond = search ? sql`p.v LIKE ${`%${likeEscape(search)}%`} ESCAPE '!'` : TRUE;
    const res = await sql<Record<string, unknown>>`SELECT p.v AS dim, COUNT(DISTINCT p.sh) AS visitors, COUNT(*) AS events, SUM(COALESCE(p.rc, 0)) AS revenue FROM (SELECT ${value} AS v, e.session_hash AS sh, e.revenue_cents AS rc FROM events e WHERE ${where}) p WHERE p.v IS NOT NULL AND ${searchCond} GROUP BY p.v ORDER BY visitors DESC, events DESC, dim ASC LIMIT ${limit} OFFSET ${offset}`.execute(db);
    return {
      rows: res.rows.map((r) => ({ value: String(r.dim ?? ""), visitors: n(r.visitors), pageviews: 0, events: n(r.events), revenueCents: n(r.revenue) })),
      approximate,
      truncated: false,
    };
  }

  // Property names (or a name that can't be used in a JSON path): read the latest matching
  // events and count in memory.
  const res = await sql<{ props: string | null; sh: string; rc: number | string | null }>`SELECT e.props AS props, e.session_hash AS sh, e.revenue_cents AS rc FROM events e WHERE ${where} ORDER BY e.ts DESC LIMIT ${PROPS_SCAN_CAP}`.execute(db);
  const acc = new Map<string, { visitors: Set<string>; events: number; revenue: number }>();
  for (const row of res.rows) {
    let props: unknown;
    try {
      props = JSON.parse(row.props ?? "");
    } catch {
      continue;
    }
    if (!props || typeof props !== "object" || Array.isArray(props)) continue;
    const entries = Object.entries(props as Record<string, unknown>);
    const names = key ? entries.filter(([k, v]) => k === key && typeof v === "string").map(([, v]) => v as string) : entries.map(([k]) => k);
    for (const name of names) {
      let a = acc.get(name);
      if (!a) acc.set(name, (a = { visitors: new Set(), events: 0, revenue: 0 }));
      a.visitors.add(row.sh);
      a.events += 1;
      a.revenue += n(row.rc);
    }
  }
  const s = search.toLowerCase();
  const rows = [...acc.entries()]
    .filter(([name]) => !s || name.toLowerCase().includes(s))
    .map(([name, a]) => ({ value: name, visitors: a.visitors.size, pageviews: 0, events: a.events, revenueCents: a.revenue }))
    // Property names: reserved ones ($currency) after the website's own properties.
    .sort((x, y) => (key ? 0 : Number(x.value.startsWith("$")) - Number(y.value.startsWith("$"))) || y.visitors - x.visitors || y.events - x.events || (x.value < y.value ? -1 : x.value > y.value ? 1 : 0));
  return { rows: rows.slice(offset, offset + limit), approximate, truncated: res.rows.length >= PROPS_SCAN_CAP };
}

// ── Periods ──

/** First local day with any data (raw or rolled up), for the "All time" period. */
export async function getDataStart(siteId: number, timezone: string): Promise<string | null> {
  const db = await getDb();
  const [raw, rolled] = await Promise.all([
    db.selectFrom("events").select(sql<string | null>`MIN(ts)`.as("ts")).where("site_id", "=", siteId).executeTakeFirst(),
    db.selectFrom("rollup_daily").select(sql<string | null>`MIN(day)`.as("day")).where("site_id", "=", siteId).executeTakeFirst(),
  ]);
  const days = [raw?.ts ? localDay(new Date(raw.ts), timezone) : null, rolled?.day ?? null].filter((d): d is string => Boolean(d));
  return days.length ? days.sort()[0] : null;
}

/**
 * Inclusive local dates and granularity for a period (see stats-dates.ts).
 * Pass `since` (getDataStart) for "all".
 */
export function resolvePeriod(
  period: Period,
  options: { from?: string | null; to?: string | null; timezone: string; since?: string | null; locale?: string; now?: Date },
): ResolvedPeriod {
  return resolveDates(period, options);
}
