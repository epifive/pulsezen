import "server-only";
import { sql } from "kysely";
import { buildAlertPayload, notifyChannels } from "@/lib/alerts";
import { parseChannelIds } from "@/lib/channels";
import { getDb, now } from "@/lib/db";
import { getRolledUpUntil } from "@/lib/rollups";
import { safeTimezone } from "@/lib/sites";
import type { AlertEvent, TrafficAlertType } from "@/analytics/types";
import type { Job } from "./index";
import { addDays, isDue, localDay, scheduleNext } from "./shared";

/**
 * Traffic alerts (table traffic_alerts), checked every 5 minutes:
 *   spike    visitors in the last 60 minutes > threshold × the average hourly visitors of the
 *            7 days before (at least 20 visitors, and at least 24 hours of history)
 *   drop     visitors in the last 24 hours < threshold % of the average daily visitors of the
 *            last 7 finished days (only once the site has 7 days of data and ≥ 10 visitors a day)
 *   silence  no event at all for `threshold` hours (removed or broken tracking script); one
 *            alert per silence: it re-arms when events arrive again
 * After an alert fires it stays quiet for 6 hours. Deliveries are logged in alert_log.
 */

const INTERVAL_MS = 5 * 60_000;
const HOUR_MS = 3_600_000;
const COOLDOWN_MS = 6 * HOUR_MS;
export const SPIKE_MIN_VISITORS = 20;
export const DROP_MIN_DAILY = 10;

const EVENT_OF: Record<TrafficAlertType, AlertEvent> = { spike: "traffic_spike", drop: "traffic_drop", silence: "traffic_silence" };

type Check = { message: string; data: Record<string, number | string> } | null;

const iso = (ms: number) => new Date(ms).toISOString();
const round1 = (n: number) => Math.round(n * 10) / 10;

async function visitorsBetween(siteId: number, from: number, to: number): Promise<number> {
  const db = await getDb();
  const row = await db
    .selectFrom("events")
    .select(sql<number>`count(distinct session_hash)`.as("n"))
    .where("site_id", "=", siteId)
    .where("ts", ">=", iso(from))
    .where("ts", "<", iso(to))
    .executeTakeFirst();
  return Number(row?.n ?? 0);
}

async function checkSpike(site: { id: number; domain: string }, threshold: number, at: number): Promise<Check> {
  const current = await visitorsBetween(site.id, at - HOUR_MS, at + 60_000);
  if (current < SPIKE_MIN_VISITORS) return null;
  const db = await getDb();
  const windowStart = at - HOUR_MS - 7 * 24 * HOUR_MS;
  const first = await db.selectFrom("events").select("ts").where("site_id", "=", site.id).where("ts", ">=", iso(windowStart)).orderBy("ts").limit(1).executeTakeFirst();
  if (!first) return null;
  const hours = Math.min(168, (at - HOUR_MS - Math.max(windowStart, Date.parse(first.ts))) / HOUR_MS);
  if (hours < 24) return null;
  // Distinct visitors per clock hour ("YYYY-MM-DDTHH" prefix of the ISO time).
  const hourly = await db
    .selectFrom("events")
    .select([sql<string>`substr(ts, 1, 13)`.as("h"), sql<number>`count(distinct session_hash)`.as("n")])
    .where("site_id", "=", site.id)
    .where("ts", ">=", iso(windowStart))
    .where("ts", "<", iso(at - HOUR_MS))
    .groupBy(sql`substr(ts, 1, 13)`)
    .execute();
  const baseline = hourly.reduce((sum, r) => sum + Number(r.n), 0) / hours;
  if (current <= threshold * baseline) return null;
  const ratio = baseline > 0 ? round1(current / baseline) : 0;
  return {
    message: `Traffic spike on ${site.domain}: ${current} visitors in the last hour${ratio ? ` (${ratio}× the usual ${round1(baseline)} per hour)` : ""}.`,
    data: { visitors: current, baseline: round1(baseline), threshold, ratio },
  };
}

async function checkDrop(site: { id: number; domain: string; timezone: string }, threshold: number, at: number, rolledUntil: string | undefined): Promise<Check> {
  const tz = safeTimezone(site.timezone);
  const today = localDay(at, tz);
  const first = addDays(today, -7);
  const yesterday = addDays(today, -1);
  // The last 7 finished days must be rolled up, and the site must have data from 7 days ago.
  if (!rolledUntil || rolledUntil < yesterday) return null;
  const db = await getDb();
  const oldest = await db
    .selectFrom("rollup_daily")
    .select((eb) => eb.fn.min("day").as("day"))
    .where("site_id", "=", site.id)
    .where("dimension", "=", "total")
    .where("visitors", ">", 0)
    .executeTakeFirst();
  if (!oldest?.day || String(oldest.day) > first) return null;
  const sum = await db
    .selectFrom("rollup_daily")
    .select((eb) => eb.fn.sum<number>("visitors").as("n"))
    .where("site_id", "=", site.id)
    .where("dimension", "=", "total")
    .where("day", ">=", first)
    .where("day", "<=", yesterday)
    .executeTakeFirst();
  const average = Number(sum?.n ?? 0) / 7;
  if (average < DROP_MIN_DAILY) return null;
  const current = await visitorsBetween(site.id, at - 24 * HOUR_MS, at + 60_000);
  if (current >= (average * threshold) / 100) return null;
  const percent = Math.round((current / average) * 100);
  return {
    message: `Traffic drop on ${site.domain}: ${current} visitors in the last 24 hours, ${percent}% of the usual ${Math.round(average)} per day.`,
    data: { visitors: current, baseline: round1(average), threshold, percent },
  };
}

async function checkSilence(site: { id: number; domain: string }, threshold: number, at: number, lastTriggered: string | null): Promise<Check> {
  const db = await getDb();
  const last = await db.selectFrom("events").select("ts").where("site_id", "=", site.id).orderBy("ts", "desc").limit(1).executeTakeFirst();
  if (!last) return null; // Never received data: nothing stopped.
  const silentMs = at - Date.parse(last.ts);
  if (silentMs < threshold * HOUR_MS) return null;
  // One alert per silence: wait for new events before alerting again.
  if (lastTriggered && lastTriggered > last.ts) return null;
  const hours = Math.floor(silentMs / HOUR_MS);
  return {
    message: `No data from ${site.domain} for ${hours} hours. The tracking script may have been removed or broken.`,
    data: { hours: threshold, silentHours: hours, lastEventAt: last.ts },
  };
}

export const trafficAlertsJob: Job = {
  name: "traffic-alerts",
  async run(ctx) {
    if (!(await isDue("traffic-alerts", ctx))) return 0;
    const db = await getDb();
    const alerts = await db
      .selectFrom("traffic_alerts")
      .innerJoin("sites", "sites.id", "traffic_alerts.site_id")
      .select([
        "traffic_alerts.id",
        "traffic_alerts.type",
        "traffic_alerts.threshold",
        "traffic_alerts.channel_ids",
        "traffic_alerts.last_triggered_at",
        "sites.id as site_id",
        "sites.user_id",
        "sites.name",
        "sites.domain",
        "sites.timezone",
      ])
      .where("traffic_alerts.is_active", "=", 1)
      .orderBy("traffic_alerts.id")
      .execute();
    const rolled = alerts.some((a) => a.type === "drop") ? await getRolledUpUntil(alerts.map((a) => a.site_id)) : new Map<number, string>();
    let fired = 0;
    let backlog = false;
    const at = Date.now();

    for (const alert of alerts) {
      if (Date.now() >= ctx.deadline) {
        backlog = true;
        break;
      }
      if (alert.last_triggered_at && at - Date.parse(alert.last_triggered_at) < COOLDOWN_MS) continue;
      const site = { id: alert.site_id, name: alert.name, domain: alert.domain, timezone: alert.timezone };
      const threshold = Math.max(1, Number(alert.threshold) || 1);
      let check: Check = null;
      try {
        if (alert.type === "spike") check = await checkSpike(site, threshold, at);
        else if (alert.type === "drop") check = await checkDrop(site, threshold, at, rolled.get(site.id));
        else if (alert.type === "silence") check = await checkSilence(site, threshold, at, alert.last_triggered_at);
      } catch (error) {
        console.error(`[pulsezen] traffic alert ${alert.id} check failed:`, error);
        continue;
      }
      if (!check) continue;
      // Claim the alert first, so an overlapping run can't send it twice.
      await db.updateTable("traffic_alerts").set({ last_triggered_at: now() }).where("id", "=", alert.id).execute();
      const payload = await buildAlertPayload(site, EVENT_OF[alert.type], check.message, check.data);
      await notifyChannels(parseChannelIds(alert.channel_ids), payload, site.id, alert.user_id);
      fired += 1;
    }

    await scheduleNext("traffic-alerts", backlog ? 0 : INTERVAL_MS);
    return fired;
  },
};
