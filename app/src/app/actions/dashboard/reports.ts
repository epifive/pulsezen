"use server";

import { revalidatePath } from "next/cache";
import { getDb, now } from "@/lib/db";
import { guardDashboard } from "@/lib/dashboard";
import { getT } from "@/lib/i18n/server";
import { plural } from "@/lib/i18n/messages";
import { rateLimit } from "@/lib/rate-limit";
import { parseRecipients, sendReport } from "@/lib/reports";
import { getOwnedSite } from "@/lib/sites";
import type { ReportFrequency } from "@/analytics/types";
import type { FormState } from "../types";
import { idOf, str } from "./helpers";

const MAX_REPORTS_PER_SITE = 4;

const pathOf = (siteId: number) => `/dashboard/sites/${siteId}/reports`;

/** A report of a site owned by `userId`, or undefined. */
async function ownedReport(reportId: number, userId: number) {
  if (!Number.isInteger(reportId) || reportId < 1) return undefined;
  const db = await getDb();
  return db
    .selectFrom("reports")
    .innerJoin("sites", "sites.id", "reports.site_id")
    .selectAll("reports")
    .where("reports.id", "=", reportId)
    .where("sites.user_id", "=", userId)
    .executeTakeFirst();
}

/** Create a report (site_id) or change one (report_id): frequency + recipients. */
export async function saveReportAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const guard = await guardDashboard();
  if (!guard.ok) return { error: guard.error };
  const t = await getT();
  const frequency = str(formData.get("frequency"));
  if (frequency !== "weekly" && frequency !== "monthly") return { error: t("dash.reports.err.frequency") };
  const recipients = parseRecipients(str(formData.get("recipients")));
  if (!recipients.length) return { error: t("dash.reports.err.recipients") };
  const db = await getDb();

  if (str(formData.get("report_id"))) {
    const report = await ownedReport(idOf(formData.get("report_id")), guard.user.id);
    if (!report) return { error: t("dash.reports.err.notFound") };
    await db
      .updateTable("reports")
      .set({ frequency: frequency as ReportFrequency, recipients: recipients.join(", ") })
      .where("id", "=", report.id)
      .execute();
    revalidatePath(pathOf(report.site_id));
    return { success: t("dash.reports.saved") };
  }

  const site = await getOwnedSite(idOf(formData.get("site_id")), guard.user.id);
  if (!site) return { error: t("dash.reports.err.notFound") };
  const count = await db.selectFrom("reports").select((eb) => eb.fn.countAll<number>().as("n")).where("site_id", "=", site.id).executeTakeFirst();
  if (Number(count?.n ?? 0) >= MAX_REPORTS_PER_SITE) return { error: t("dash.reports.err.limit", { n: MAX_REPORTS_PER_SITE }) };
  await db
    .insertInto("reports")
    .values({ site_id: site.id, user_id: guard.user.id, frequency: frequency as ReportFrequency, recipients: recipients.join(", "), last_sent_at: null, created_at: now() })
    .execute();
  revalidatePath(pathOf(site.id));
  return { success: t("dash.reports.created") };
}

export async function deleteReportAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const guard = await guardDashboard();
  if (!guard.ok) return { error: guard.error };
  const t = await getT();
  const report = await ownedReport(idOf(formData.get("report_id")), guard.user.id);
  if (!report) return { error: t("dash.reports.err.notFound") };
  const db = await getDb();
  await db.deleteFrom("reports").where("id", "=", report.id).execute();
  revalidatePath(pathOf(report.site_id));
  return { success: t("dash.reports.deleted") };
}

/** "Send a test report now": the last complete period, to the report's recipients (marked [Test]). */
export async function testReportAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const guard = await guardDashboard();
  if (!guard.ok) return { error: guard.error };
  const t = await getT();
  const report = await ownedReport(idOf(formData.get("report_id")), guard.user.id);
  if (!report) return { error: t("dash.reports.err.notFound") };
  if (!rateLimit(`pz-report-test:${guard.user.id}`, 3, 5 * 60_000)) return { error: t("dash.reports.err.rate") };
  const result = await sendReport(report, { test: true }).catch((error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : String(error) }));
  if (!result.ok) return { error: t("dash.reports.testFailed", { error: result.error }) };
  return { success: plural(t, "dash.reports.testSent", result.sent) };
}
