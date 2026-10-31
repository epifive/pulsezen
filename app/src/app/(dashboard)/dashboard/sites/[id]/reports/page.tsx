import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Mail, Send, Trash } from "lucide-react";
import { deleteReportAction, testReportAction } from "@/app/actions/dashboard/reports";
import { ActionButton } from "@/components/dashboard/actions";
import { DashHeader, Empty, Panel } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/dash-format";
import { requireDashboardUser } from "@/lib/dashboard";
import { getDb } from "@/lib/db";
import { getLocale, getT } from "@/lib/i18n/server";
import { plural } from "@/lib/i18n/messages";
import { mailConfigured } from "@/lib/mail";
import { parseRecipients } from "@/lib/reports";
import { getSettings } from "@/lib/settings";
import { getOwnedSite } from "@/lib/sites";
import { ReportForm } from "./report-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("dash.reports.title") };
}

export default async function SiteReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireDashboardUser();
  const site = await getOwnedSite(Number((await params).id), user.id);
  if (!site) notFound();
  const db = await getDb();
  const [t, locale, settings, reports] = await Promise.all([
    getT(),
    getLocale(),
    getSettings(),
    db.selectFrom("reports").selectAll().where("site_id", "=", site.id).orderBy("id").execute(),
  ]);

  return (
    <>
      <DashHeader title={t("dash.reports.title")} description={t("dash.reports.subtitle", { site: site.domain })} />
      {!mailConfigured(settings) ? (
        <Alert tone="warning" className="mb-6">
          {t("dash.reports.mailOff")}
        </Alert>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel padded={false} title={t("dash.reports.title")}>
          {reports.length ? (
            <ul className="divide-y divide-line">
              {reports.map((r) => {
                const recipients = parseRecipients(r.recipients);
                const frequency = r.frequency === "monthly" ? t("dash.reports.monthly") : t("dash.reports.weekly");
                return (
                  <li key={r.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-start gap-4">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                        <Mail className="size-5" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{frequency}</span>
                          <Badge>{plural(t, "dash.reports.recipientsCount", recipients.length)}</Badge>
                        </div>
                        <p className="mt-0.5 truncate text-sm text-muted" dir="ltr">
                          {recipients.join(", ")}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {r.last_sent_at
                            ? t("dash.reports.lastSent", { date: formatDateTime(r.last_sent_at, locale.code) })
                            : r.frequency === "monthly"
                              ? t("dash.reports.firstMonthly")
                              : t("dash.reports.firstWeekly")}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-start gap-2">
                        <ActionButton action={testReportAction} fields={{ report_id: r.id }} showSuccess>
                          <Send aria-hidden />
                          {t("dash.reports.sendTest")}
                        </ActionButton>
                        <ActionButton
                          action={deleteReportAction}
                          fields={{ report_id: r.id }}
                          confirmText={t("dash.reports.deleteConfirm", { frequency: frequency.toLowerCase() })}
                          label={t("dash.reports.delete")}
                          buttonClassName="hover:border-red-300 hover:text-red-600"
                        >
                          <Trash aria-hidden />
                        </ActionButton>
                      </div>
                    </div>
                    <details className="group mt-3 ms-14">
                      <summary className="cursor-pointer text-sm font-medium text-primary hover:underline">{t("dash.reports.edit")}</summary>
                      <div className="mt-3 max-w-lg">
                        <ReportForm siteId={site.id} report={{ id: r.id, frequency: r.frequency, recipients: recipients.join(", ") }} />
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty icon={<Mail />} title={t("dash.reports.emptyTitle")}>
              {t("dash.reports.emptyText")}
            </Empty>
          )}
        </Panel>
        <Panel title={t("dash.reports.add")} description={t("dash.reports.addText", { timezone: site.timezone })} className="h-fit">
          <ReportForm siteId={site.id} defaultRecipients={reports.length ? "" : user.email} />
        </Panel>
      </div>
    </>
  );
}
