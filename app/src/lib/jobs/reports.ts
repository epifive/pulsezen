import "server-only";
import { getDb } from "@/lib/db";
import { mailConfigured } from "@/lib/mail";
import { markReportSent, reportDue, sendReport } from "@/lib/reports";
import { getRolledUpUntil } from "@/lib/rollups";
import { getSettings } from "@/lib/settings";
import { safeTimezone } from "@/lib/sites";
import type { Job } from "./index";
import { isDue, scheduleNext, writeKey } from "./shared";

/**
 * Sends due weekly (Monday) and monthly (1st) email reports, in each site's time zone,
 * once per period. Waits until the period's last day is rolled up. Does nothing while
 * email (SMTP) isn't configured. A report that keeps failing (SMTP errors) is retried every
 * 10 minutes and skipped for the period after a day (settings row "report_failed:<id>").
 */

const INTERVAL_MS = 10 * 60_000;
const MAX_PER_TICK = 20;
const GIVE_UP_MS = 86_400_000;

export const reportsJob: Job = {
  name: "reports",
  async run(ctx) {
    if (!(await isDue("reports", ctx))) return 0;
    const settings = await getSettings();
    if (!mailConfigured(settings)) {
      await scheduleNext("reports", INTERVAL_MS);
      return 0;
    }
    const db = await getDb();
    const reports = await db
      .selectFrom("reports")
      .innerJoin("sites", "sites.id", "reports.site_id")
      .innerJoin("users", "users.id", "sites.user_id")
      .selectAll("reports")
      .select(["sites.timezone", "users.status"])
      .orderBy("reports.id")
      .execute();
    const rolled = await getRolledUpUntil(reports.map((r) => r.site_id));
    let sent = 0;
    let backlog = false;
    const at = Date.now();

    for (const report of reports) {
      if (Date.now() >= ctx.deadline || sent >= MAX_PER_TICK) {
        backlog = true;
        break;
      }
      if (report.status !== "active") continue;
      const tz = safeTimezone(report.timezone);
      const { due, periodStart, period } = reportDue(report, tz, at);
      if (!due) continue;
      // Wait for the rollup of the period's last day (sites that never had data have no progress row).
      const until = rolled.get(report.site_id);
      if (until && until < period.to && at - periodStart < 6 * 3_600_000) continue;

      const result = await sendReport(report, { at }).catch((error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : String(error) }));
      const failKey = `report_failed:${report.id}`;
      if (result.ok) {
        sent += 1;
        await markReportSent(report.id);
        await db.deleteFrom("settings").where("key", "=", failKey).execute();
      } else {
        console.error(`[pulsezen] report ${report.id} failed: ${result.error}`);
        // Retry every run; after a day of failures, skip this period.
        const firstFailure = (await db.selectFrom("settings").select("value").where("key", "=", failKey).executeTakeFirst())?.value;
        if (!firstFailure || firstFailure < new Date(periodStart).toISOString()) {
          await writeKey(failKey, new Date(at).toISOString());
        } else if (at - Date.parse(firstFailure) > GIVE_UP_MS) {
          await markReportSent(report.id);
          await db.deleteFrom("settings").where("key", "=", failKey).execute();
        }
      }
    }

    await scheduleNext("reports", backlog ? 0 : INTERVAL_MS);
    return sent;
  },
};
