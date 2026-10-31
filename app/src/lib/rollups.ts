import "server-only";
import { sql } from "kysely";
import { dbDriver, getDb } from "./db";
import type { RollupDailyTable } from "./db/schema";
import { addDays, chunk, dayBoundsIso, dayStartMs, localDay, writeKey } from "./jobs/shared";
import { safeTimezone } from "./sites";

/**
 * Daily summaries (table rollup_daily). One row per (site, local day, dimension, value);
 * the day is a calendar day in the site's time zone. Raw events can be deleted after a day
 * is rolled up (plan retention) while charts and breakdowns keep working: the stats engine
 * (src/lib/query.ts) reads days before the oldest raw event from here, so every number
 * follows its definitions exactly.
 *
 * Columns (dimension "total" has value ""):
 *   visitors      distinct session_hash
 *   visits        distinct visit_id
 *   pageviews     events named "pageview"
 *   events        every other (custom) event
 *   bounces       visits made of exactly one event, a pageview
 *   duration_sec  sum of visit durations (gap_sec of the visit's non-entry events)
 *   revenue_cents sum of revenue_cents
 *
 * Visit-level dimensions (entry_page, source, channel, referrer = referrer_host, utm_*,
 * country, region, city, browser, os, device, screen, lang) group whole visits by the
 * visit's entry event (is_entry = 1); exit_page by the visit's last pageview.
 * Event-level dimensions (page, hostname, event) count the matching events (visitors,
 * pageviews, events, revenue) plus the whole visits that contain one (visits, bounces,
 * duration) — the same as the dashboard's "page is …" filter.
 * Values are cut to 255 characters.
 */

const VISIT_COLUMNS = {
  entry_page: "pathname",
  source: "source",
  channel: "channel",
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
} as const;
type EntryDimension = keyof typeof VISIT_COLUMNS;
const ENTRY_DIMENSIONS = Object.keys(VISIT_COLUMNS) as EntryDimension[];
const EVENT_DIMENSIONS = ["page", "hostname", "event"] as const;
type EventDimension = (typeof EVENT_DIMENSIONS)[number];

/** Every dimension stored in rollup_daily ("total" plus the breakdowns). */
export const ROLLUP_DIMENSIONS = ["total", ...EVENT_DIMENSIONS, "exit_page", ...ENTRY_DIMENSIONS] as const;

const PAGEVIEW = "pageview";
const BATCH = 5_000;
const INSERT_BATCH = 80;

/** settings row with the last local day rolled up for a site. */
export const rolledUpKey = (siteId: number) => `rollup_until:${siteId}`;

interface Row {
  id: number;
  ts: string;
  session_hash: string;
  visit_id: string;
  is_entry: number;
  gap_sec: number;
  name: string;
  pathname: string;
  hostname: string;
  referrer_host: string;
  source: string;
  channel: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_term: string;
  utm_content: string;
  country: string;
  region: string;
  city: string;
  browser: string;
  os: string;
  device: string;
  screen: string;
  lang: string;
  revenue_cents: number | string | null;
}

interface Visit {
  sh: string;
  /** Attributes of the entry event (null when the visit started before this day). */
  entry: Record<EntryDimension, string> | null;
  /** Events in the day. */
  n: number;
  pageviews: number;
  events: number;
  duration: number;
  revenue: number;
  /** Path of the last pageview (exit page). */
  exitPage: string | null;
  /** Event-level keys this visit contains. */
  keys: Record<EventDimension, Set<string>>;
}

interface Agg {
  visitors: Set<string>;
  visits: number;
  pageviews: number;
  events: number;
  bounces: number;
  duration: number;
  revenue: number;
}

const cut = (v: string | null | undefined) => (v ?? "").slice(0, 255);
const newAgg = (): Agg => ({ visitors: new Set(), visits: 0, pageviews: 0, events: 0, bounces: 0, duration: 0, revenue: 0 });

function get(map: Map<string, Agg>, key: string): Agg {
  let a = map.get(key);
  if (!a) map.set(key, (a = newAgg()));
  return a;
}

/**
 * (Re)build the rollup rows of one local day of a site from its raw events: the day's rows
 * are deleted and inserted again in one transaction, so running it twice gives the same result.
 * A day without events still gets a zero "total" row (it marks the day as rolled up).
 */
export async function buildRollupsForDay(siteId: number, day: string, timezone?: string): Promise<{ rows: number; events: number }> {
  const db = await getDb();
  let tz = timezone;
  if (!tz) {
    const site = await db.selectFrom("sites").select("timezone").where("id", "=", siteId).executeTakeFirst();
    if (!site) return { rows: 0, events: 0 };
    tz = site.timezone;
  }
  const { start, end } = dayBoundsIso(day, safeTimezone(tz));

  const visits = new Map<string, Visit>();
  const eventLevel: Record<EventDimension, Map<string, Agg>> = { page: new Map(), hostname: new Map(), event: new Map() };
  const total = newAgg();
  let read = 0;

  // Keyset pagination on (ts, id): bounded memory per query, events in time order.
  let cursor: { ts: string; id: number } | null = null;
  for (;;) {
    const after: { ts: string; id: number } | null = cursor;
    const batch = (await db
      .selectFrom("events")
      .select([
        "id",
        "ts",
        "session_hash",
        "visit_id",
        "is_entry",
        "gap_sec",
        "name",
        "pathname",
        "hostname",
        "referrer_host",
        "source",
        "channel",
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "country",
        "region",
        "city",
        "browser",
        "os",
        "device",
        "screen",
        "lang",
        "revenue_cents",
      ])
      .where("site_id", "=", siteId)
      .where("ts", ">=", start)
      .where("ts", "<", end)
      .$if(after !== null, (qb) => qb.where((eb) => eb.or([eb("ts", ">", after!.ts), eb.and([eb("ts", "=", after!.ts), eb("id", ">", after!.id)])])))
      .orderBy("ts")
      .orderBy("id")
      .limit(BATCH)
      .execute()) as Row[];

    for (const e of batch) {
      read += 1;
      const revenue = Number(e.revenue_cents ?? 0) || 0;
      const isPageview = e.name === PAGEVIEW;
      let v = visits.get(e.visit_id);
      if (!v) {
        v = { sh: e.session_hash, entry: null, n: 0, pageviews: 0, events: 0, duration: 0, revenue: 0, exitPage: null, keys: { page: new Set(), hostname: new Set(), event: new Set() } };
        visits.set(e.visit_id, v);
      }
      v.n += 1;
      if (Number(e.is_entry) === 1) {
        if (!v.entry) {
          const entry = {} as Record<EntryDimension, string>;
          for (const dim of ENTRY_DIMENSIONS) entry[dim] = cut(e[VISIT_COLUMNS[dim]]);
          v.entry = entry;
        }
      } else {
        v.duration += Math.max(0, Number(e.gap_sec) || 0);
      }
      v.revenue += revenue;
      if (isPageview) {
        v.pageviews += 1;
        v.exitPage = cut(e.pathname);
      } else {
        v.events += 1;
      }

      total.visitors.add(e.session_hash);
      if (isPageview) total.pageviews += 1;
      else total.events += 1;
      total.revenue += revenue;

      const keys: Record<EventDimension, string> = { page: cut(e.pathname), hostname: cut(e.hostname), event: cut(e.name) };
      for (const dim of EVENT_DIMENSIONS) {
        // The "event" dimension lists custom events only (pageviews are the "page" dimension).
        if (dim === "event" && isPageview) continue;
        const a = get(eventLevel[dim], keys[dim]);
        a.visitors.add(e.session_hash);
        if (isPageview) a.pageviews += 1;
        else a.events += 1;
        a.revenue += revenue;
        v.keys[dim].add(keys[dim]);
      }
    }
    if (batch.length < BATCH) break;
    const last = batch[batch.length - 1];
    cursor = { ts: last.ts, id: last.id };
  }

  // Whole-visit numbers.
  const visitLevel = new Map<string, Map<string, Agg>>([["exit_page", new Map()], ...ENTRY_DIMENSIONS.map((d) => [d, new Map<string, Agg>()] as const)]);
  for (const v of visits.values()) {
    const bounce = v.n === 1 && v.pageviews === 1 ? 1 : 0;
    total.visits += 1;
    total.bounces += bounce;
    total.duration += v.duration;
    for (const dim of EVENT_DIMENSIONS) {
      for (const key of v.keys[dim]) {
        const a = eventLevel[dim].get(key)!;
        a.visits += 1;
        a.bounces += bounce;
        a.duration += v.duration;
      }
    }
    const addVisit = (a: Agg) => {
      a.visitors.add(v.sh);
      a.visits += 1;
      a.pageviews += v.pageviews;
      a.events += v.events;
      a.bounces += bounce;
      a.duration += v.duration;
      a.revenue += v.revenue;
    };
    if (v.exitPage !== null) addVisit(get(visitLevel.get("exit_page")!, v.exitPage));
    if (v.entry) for (const dim of ENTRY_DIMENSIONS) addVisit(get(visitLevel.get(dim)!, v.entry[dim]));
  }

  const rows: RollupDailyTable[] = [];
  const push = (dimension: string, value: string, a: Agg) =>
    rows.push({
      site_id: siteId,
      day,
      dimension,
      value,
      visitors: a.visitors.size,
      visits: a.visits,
      pageviews: a.pageviews,
      events: a.events,
      bounces: a.bounces,
      duration_sec: Math.round(a.duration),
      revenue_cents: Math.round(a.revenue),
    });
  push("total", "", total);
  for (const dim of EVENT_DIMENSIONS) for (const [value, a] of eventLevel[dim]) push(dim, value, a);
  for (const [dim, map] of visitLevel) for (const [value, a] of map) push(dim, value, a);

  const mysql = dbDriver() === "mysql";
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("rollup_daily").where("site_id", "=", siteId).where("day", "=", day).execute();
    for (const part of chunk(rows, INSERT_BATCH)) {
      if (mysql) {
        // MySQL compares strings case-insensitively, so "/About" and "/about" share a primary
        // key there: add them up instead of failing.
        await trx
          .insertInto("rollup_daily")
          .values(part)
          .onDuplicateKeyUpdate({
            visitors: sql`visitors + values(visitors)`,
            visits: sql`visits + values(visits)`,
            pageviews: sql`pageviews + values(pageviews)`,
            events: sql`events + values(events)`,
            bounces: sql`bounces + values(bounces)`,
            duration_sec: sql`duration_sec + values(duration_sec)`,
            revenue_cents: sql`revenue_cents + values(revenue_cents)`,
          })
          .execute();
      } else {
        await trx.insertInto("rollup_daily").values(part).execute();
      }
    }
  });
  return { rows: rows.length, events: read };
}

/** Remember that every day up to `day` is rolled up for a site. */
export async function setRolledUpUntil(siteId: number, day: string): Promise<void> {
  await writeKey(rolledUpKey(siteId), day);
}

/** Last local day rolled up, per site id (settings rows "rollup_until:<siteId>"). */
export async function getRolledUpUntil(siteIds?: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (siteIds && !siteIds.length) return out;
  const db = await getDb();
  const rows = await db.selectFrom("settings").select(["key", "value"]).where("key", "like", "rollup_until:%").execute();
  for (const row of rows) {
    if (!row.key.startsWith("rollup_until:")) continue;
    const id = Number(row.key.slice("rollup_until:".length));
    if (Number.isInteger(id) && row.value && /^\d{4}-\d{2}-\d{2}$/.test(row.value)) out.set(id, row.value);
  }
  return out;
}

/**
 * A site's time zone changed. Days are local calendar days, so the summaries of the days
 * that still have complete raw events are deleted and the rollups job builds them again in
 * the new time zone. Days whose raw events were already deleted by retention keep their
 * old grouping (they can't be rebuilt).
 */
export async function rebuildRollupsAfterTimezoneChange(siteId: number, oldTimezone: string, newTimezone: string): Promise<void> {
  const oldTz = safeTimezone(oldTimezone);
  const newTz = safeTimezone(newTimezone);
  if (oldTz === newTz) return;
  const db = await getDb();
  const first = await db.selectFrom("events").select("ts").where("site_id", "=", siteId).orderBy("ts").limit(1).executeTakeFirst();

  // Were raw events deleted (retention)? Then only days fully covered by raw events are rebuilt.
  let rebuildFrom: string | null = null;
  if (first) {
    const firstOldDay = localDay(Date.parse(first.ts), oldTz);
    const rolled = await db
      .selectFrom("rollup_daily")
      .select(["day", "pageviews", "events"])
      .where("site_id", "=", siteId)
      .where("dimension", "=", "total")
      .where("day", "<=", firstOldDay)
      .where((eb) => eb.or([eb("pageviews", ">", 0), eb("events", ">", 0)]))
      .orderBy("day")
      .limit(2)
      .execute();
    let purged = rolled.some((r) => r.day < firstOldDay);
    const firstRolled = rolled.find((r) => r.day === firstOldDay);
    if (!purged && firstRolled) {
      // The first raw day was cut by retention when its summary counted more events than are left.
      const { start, end } = dayBoundsIso(firstOldDay, oldTz);
      const left = await db.selectFrom("events").select((eb) => eb.fn.countAll<number>().as("n")).where("site_id", "=", siteId).where("ts", ">=", start).where("ts", "<", end).executeTakeFirst();
      purged = Number(left?.n ?? 0) < Number(firstRolled.pageviews) + Number(firstRolled.events);
    }
    if (purged) {
      // Raw events are complete from the next old local midnight on (the first raw day may be cut).
      const completeFrom = dayStartMs(addDays(firstOldDay, 1), oldTz);
      rebuildFrom = localDay(completeFrom, newTz);
      if (dayStartMs(rebuildFrom, newTz) < completeFrom) rebuildFrom = addDays(rebuildFrom, 1);
    }
  }

  await db.transaction().execute(async (trx) => {
    if (!first || !rebuildFrom) {
      // Nothing was purged: every summary is rebuilt from the raw events.
      await trx.deleteFrom("rollup_daily").where("site_id", "=", siteId).execute();
      await trx.deleteFrom("settings").where("key", "=", rolledUpKey(siteId)).execute();
      return;
    }
    await trx.deleteFrom("rollup_daily").where("site_id", "=", siteId).where("day", ">=", rebuildFrom).execute();
    // The rollups job continues the day after the progress row.
    await trx.deleteFrom("settings").where("key", "=", rolledUpKey(siteId)).execute();
    await trx.insertInto("settings").values({ key: rolledUpKey(siteId), value: addDays(rebuildFrom, -1) }).execute();
  });
  // Build the missing days on the next tick instead of waiting for the job's 5-minute interval.
  await db.deleteFrom("settings").where("key", "=", "job_next:rollups").execute();
}

/** For a site without a progress row: the last day that already has rollups, if any. */
export async function lastRollupDay(siteId: number): Promise<string | null> {
  const db = await getDb();
  const row = await db
    .selectFrom("rollup_daily")
    .select((eb) => eb.fn.max("day").as("day"))
    .where("site_id", "=", siteId)
    .where("dimension", "=", "total")
    .executeTakeFirst();
  return (row?.day as string | null | undefined) ?? null;
}
