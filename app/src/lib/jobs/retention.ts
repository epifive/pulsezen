import "server-only";
import { getDb } from "@/lib/db";
import { getEntitlements, type Entitlements } from "@/lib/plans";
import { getRolledUpUntil } from "@/lib/rollups";
import { safeTimezone } from "@/lib/sites";
import type { Job } from "./index";
import { addDays, chunk, dayStartMs, isDue, localDay, scheduleNext } from "./shared";

/**
 * Data retention and housekeeping:
 *  - raw events older than the owner's plan retention (days; 0 = unlimited) are deleted, but
 *    only for days that are already rolled up (daily summaries are kept for good). Owners
 *    without an active paid plan (and websites without an owner) use the free plan's
 *    retention, or Settings → Analytics → retention when no plan is marked as free (the
 *    same rule as getEntitlements). Administrators' websites are never pruned.
 *  - at most 5,000 events per site per tick; the rest is picked up by the next ticks
 *  - visitor salts older than yesterday, alert_log rows older than 90 days, progress rows of
 *    deleted websites.
 */

const MAX_DELETE_PER_SITE = 5_000;
const INTERVAL_MS = 60 * 60_000;
const ALERT_LOG_DAYS = 90;
const DAY_MS = 86_400_000;

export const retentionJob: Job = {
  name: "retention",
  async run(ctx) {
    if (!(await isDue("retention", ctx))) return 0;
    const db = await getDb();
    const sites = await db
      .selectFrom("sites")
      .leftJoin("users", "users.id", "sites.user_id")
      .select(["sites.id", "sites.timezone", "users.id as user_id", "users.role", "users.plan_id", "users.plan_expires_at"])
      .orderBy("sites.id")
      .execute();
    const until = await getRolledUpUntil(sites.map((s) => s.id));
    const plans = new Map<number, Entitlements>();
    let ownerless: Entitlements | null = null;
    let deleted = 0;
    let backlog = false;

    for (const site of sites) {
      if (Date.now() >= ctx.deadline) {
        backlog = true;
        break;
      }
      const rolled = until.get(site.id);
      if (!rolled) continue;

      let ent: Entitlements;
      if (site.user_id !== null && site.role) {
        if (site.role === "admin") continue;
        let cached = plans.get(site.user_id);
        if (!cached) {
          cached = await getEntitlements({ role: site.role, plan_id: site.plan_id ?? null, plan_expires_at: site.plan_expires_at ?? null });
          plans.set(site.user_id, cached);
        }
        ent = cached;
      } else {
        ent = ownerless ??= await getEntitlements(null);
      }
      const days = ent.retentionDays;
      if (days <= 0) continue;

      const tz = safeTimezone(site.timezone);
      // Keep today and the last `days` days, and every day that isn't rolled up yet.
      const keepFrom = addDays(localDay(Date.now(), tz), -days);
      const cutoffDay = keepFrom <= addDays(rolled, 1) ? keepFrom : addDays(rolled, 1);
      const cutoff = new Date(dayStartMs(cutoffDay, tz)).toISOString();

      const ids = (await db.selectFrom("events").select("id").where("site_id", "=", site.id).where("ts", "<", cutoff).orderBy("ts").limit(MAX_DELETE_PER_SITE).execute()).map((r) => r.id);
      for (const part of chunk(ids, 500)) {
        await db.deleteFrom("events").where("id", "in", part).execute();
      }
      deleted += ids.length;
      if (ids.length >= MAX_DELETE_PER_SITE) backlog = true;
    }

    // Salts: the daily visitor salt is only needed for today (and yesterday around midnight).
    const saltCutoff = addDays(new Date().toISOString().slice(0, 10), -1);
    await db.deleteFrom("salts").where("day", "<", saltCutoff).execute();

    await db
      .deleteFrom("alert_log")
      .where("created_at", "<", new Date(Date.now() - ALERT_LOG_DAYS * DAY_MS).toISOString())
      .execute();

    // Progress rows of deleted websites.
    const siteIds = new Set(sites.map((s) => s.id));
    const orphans = [...until.keys()].filter((id) => !siteIds.has(id)).map((id) => `rollup_until:${id}`);
    for (const part of chunk(orphans, 200)) await db.deleteFrom("settings").where("key", "in", part).execute();

    await scheduleNext("retention", backlog ? 0 : INTERVAL_MS);
    return deleted;
  },
};
