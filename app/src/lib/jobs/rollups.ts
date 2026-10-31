import "server-only";
import { getDb } from "@/lib/db";
import { buildRollupsForDay, getRolledUpUntil, lastRollupDay, setRolledUpUntil } from "@/lib/rollups";
import { safeTimezone } from "@/lib/sites";
import type { Job } from "./index";
import { addDays, dayStartMs, isDue, localDay, scheduleNext } from "./shared";

/**
 * Builds the daily summaries of finished days. A local day is finished a few minutes after
 * midnight in the site's time zone (events carry the server's receive time, so nothing can
 * arrive for it later). Each site's progress is stored in the settings row
 * "rollup_until:<siteId>"; days are built in order, days without events are skipped.
 */

/** Wait this long after local midnight before rolling up the day that just ended. */
const GRACE_MS = 3 * 60_000;
/** Day builds per tick (a backlog, e.g. imported history, is spread over several ticks). */
const MAX_BUILDS = 40;
/** Without backlog, look for finished days every 5 minutes. */
const INTERVAL_MS = 5 * 60_000;

export const rollupsJob: Job = {
  name: "rollups",
  async run(ctx) {
    if (!(await isDue("rollups", ctx))) return 0;
    const db = await getDb();
    const sites = await db.selectFrom("sites").select(["id", "timezone"]).orderBy("id").execute();
    const until = await getRolledUpUntil(sites.map((s) => s.id));
    let built = 0;
    let backlog = false;

    for (const site of sites) {
      if (Date.now() >= ctx.deadline || built >= MAX_BUILDS) {
        backlog = true;
        break;
      }
      const tz = safeTimezone(site.timezone);
      const lastFinished = addDays(localDay(Date.now() - GRACE_MS, tz), -1);
      let done = until.get(site.id) ?? (await lastRollupDay(site.id));
      if (done && done >= lastFinished) continue;

      // Start after the last rolled-up day, or at the first event.
      let day: string;
      if (done) {
        day = addDays(done, 1);
      } else {
        const first = await db.selectFrom("events").select("ts").where("site_id", "=", site.id).orderBy("ts").limit(1).executeTakeFirst();
        if (!first) continue;
        day = localDay(Date.parse(first.ts), tz);
        if (day > lastFinished) continue;
      }

      while (day <= lastFinished) {
        if (Date.now() >= ctx.deadline || built >= MAX_BUILDS) {
          backlog = true;
          break;
        }
        // Skip days without events in one step.
        const next = await db
          .selectFrom("events")
          .select("ts")
          .where("site_id", "=", site.id)
          .where("ts", ">=", new Date(dayStartMs(day, tz)).toISOString())
          .where("ts", "<", new Date(dayStartMs(addDays(lastFinished, 1), tz)).toISOString())
          .orderBy("ts")
          .limit(1)
          .executeTakeFirst();
        if (!next) {
          // Nothing left up to the last finished day: write an empty marker row for it.
          await buildRollupsForDay(site.id, lastFinished, tz);
          done = lastFinished;
          await setRolledUpUntil(site.id, done);
          break;
        }
        const target = localDay(Date.parse(next.ts), tz);
        const d = target > day ? target : day;
        await buildRollupsForDay(site.id, d, tz);
        built += 1;
        done = d;
        await setRolledUpUntil(site.id, done);
        day = addDays(d, 1);
      }
      if (backlog) break;
    }

    await scheduleNext("rollups", backlog ? 0 : INTERVAL_MS);
    return built;
  },
};
