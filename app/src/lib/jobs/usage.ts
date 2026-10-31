import "server-only";
import { logAlert } from "@/lib/channels";
import { getDb } from "@/lib/db";
import { mailConfigured, sendMail } from "@/lib/mail";
import { getEntitlements } from "@/lib/plans";
import { getSettings } from "@/lib/settings";
import { absoluteUrl } from "@/lib/site";
import type { Job } from "./index";
import { chunk, isDue, scheduleNext, writeKey } from "./shared";

/**
 * Usage emails: tells an account owner when this month's pageviews + events (usage_monthly,
 * UTC month) reach 80 % and 100 % of the plan's monthly limit — each once per month, tracked
 * in settings rows "quota_mail:<userId>:<YYYY-MM>:<80|100>". Waits while SMTP isn't configured.
 */

const INTERVAL_MS = 15 * 60_000;
const MAX_PER_TICK = 50;

const keyOf = (userId: number, month: string, level: 80 | 100) => `quota_mail:${userId}:${month}:${level}`;

export const usageJob: Job = {
  name: "usage",
  async run(ctx) {
    if (!(await isDue("usage", ctx))) return 0;
    const settings = await getSettings();
    if (!mailConfigured(settings)) {
      await scheduleNext("usage", INTERVAL_MS);
      return 0;
    }
    const db = await getDb();
    const month = new Date().toISOString().slice(0, 7);
    const rows = await db
      .selectFrom("usage_monthly")
      .innerJoin("users", "users.id", "usage_monthly.user_id")
      .select(["users.id", "users.name", "users.email", "users.role", "users.plan_id", "users.plan_expires_at", "usage_monthly.pageviews", "usage_monthly.events"])
      .where("usage_monthly.month", "=", month)
      .where("users.status", "=", "active")
      .where("users.role", "!=", "admin")
      .execute();
    const sentKeys = new Set(
      (await db.selectFrom("settings").select("key").where("key", "like", `quota_mail:%:${month}:%`).execute()).map((r) => r.key),
    );

    let sent = 0;
    let backlog = false;
    for (const row of rows) {
      if (Date.now() >= ctx.deadline || sent >= MAX_PER_TICK) {
        backlog = true;
        break;
      }
      const used = Number(row.pageviews) + Number(row.events);
      if (!used) continue;
      const ent = await getEntitlements({ role: row.role, plan_id: row.plan_id, plan_expires_at: row.plan_expires_at });
      const limit = ent.maxMonthlyPageviews;
      if (!limit) continue;
      const level: 80 | 100 | 0 = used >= limit ? 100 : used >= limit * 0.8 ? 80 : 0;
      if (!level || sentKeys.has(keyOf(row.id, month, level))) continue;

      // Claim first (an overlapping run won't send twice); reaching 100 % also settles 80 %.
      await writeKey(keyOf(row.id, month, level), new Date().toISOString());
      if (level === 100) await writeKey(keyOf(row.id, month, 80), new Date().toISOString());

      const percent = Math.floor((used / limit) * 100);
      const reached = level === 100;
      const subject = reached ? "You have reached your monthly pageview limit" : `You have used ${percent}% of your monthly pageviews`;
      const text = [
        `Hi ${row.name || "there"},`,
        "",
        reached
          ? `Your websites have recorded ${used.toLocaleString("en-US")} pageviews and events this month, which is your plan's limit of ${limit.toLocaleString("en-US")}.`
          : `Your websites have recorded ${used.toLocaleString("en-US")} of the ${limit.toLocaleString("en-US")} pageviews and events included in your plan this month (${percent}%).`,
        "",
        reached
          ? "New pageviews and events may no longer be recorded until your usage resets on the 1st of next month. Upgrade your plan to keep every visit."
          : "When the limit is reached, new pageviews and events may no longer be recorded until the 1st of next month. Upgrade your plan to get more room.",
        "",
        `See plans: ${absoluteUrl(settings, "/pricing")}`,
        `Your usage: ${absoluteUrl(settings, "/dashboard")}`,
        "",
        `— ${settings.site_name}`,
      ].join("\n");
      try {
        await sendMail({ to: row.email, subject, text });
        sent += 1;
        await logAlert({ siteId: null, channelId: null, event: reached ? "quota_reached" : "quota_warning", ok: true }).catch(() => undefined);
      } catch (error) {
        console.error(`[pulsezen] usage email to user ${row.id} failed:`, error instanceof Error ? error.message : error);
        // Try again on the next run.
        await db.deleteFrom("settings").where("key", "=", keyOf(row.id, month, level)).execute();
      }
    }

    // Forget the rows of months before the previous one.
    const prev = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
    const old = (await db.selectFrom("settings").select("key").where("key", "like", "quota_mail:%").execute())
      .map((r) => r.key)
      .filter((key) => {
        const m = key.split(":")[2] ?? "";
        return /^\d{4}-\d{2}$/.test(m) && m < prev;
      });
    for (const part of chunk(old, 200)) await db.deleteFrom("settings").where("key", "in", part).execute();

    await scheduleNext("usage", backlog ? 0 : INTERVAL_MS);
    return sent;
  },
};
