"use client";

import { useActionState, useId, useState } from "react";
import { saveReportAction } from "@/app/actions/dashboard/reports";
import { initialFormState } from "@/app/actions/types";
import { Field, Textarea } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { Segmented } from "@/components/ui/segmented";
import { useT } from "@/lib/i18n/client";
import type { ReportFrequency } from "@/analytics/types";

/** Create a report for a site, or edit one (frequency + recipients). */
export function ReportForm({
  siteId,
  report,
  defaultRecipients = "",
}: {
  siteId: number;
  report?: { id: number; frequency: ReportFrequency; recipients: string };
  defaultRecipients?: string;
}) {
  const t = useT();
  const uid = useId();
  const [state, action] = useActionState(saveReportAction, initialFormState);
  const [frequency, setFrequency] = useState<ReportFrequency>(report?.frequency ?? "weekly");

  return (
    <form action={action} className="space-y-4">
      {report ? <input type="hidden" name="report_id" value={report.id} /> : <input type="hidden" name="site_id" value={siteId} />}
      <input type="hidden" name="frequency" value={frequency} />
      <FormMessage state={state} />
      <div>
        <p className="mb-1.5 text-sm font-medium text-ink">{t("dash.reports.frequency")}</p>
        <Segmented
          value={frequency}
          onChange={setFrequency}
          label={t("dash.reports.frequency")}
          options={[
            { value: "weekly", label: t("dash.reports.weekly") },
            { value: "monthly", label: t("dash.reports.monthly") },
          ]}
        />
        <p className="mt-1.5 text-xs text-muted">{frequency === "weekly" ? t("dash.reports.weeklyHint") : t("dash.reports.monthlyHint")}</p>
      </div>
      <Field label={t("dash.reports.recipients")} htmlFor={`${uid}-to`} hint={t("dash.reports.recipientsHint")}>
        <Textarea
          id={`${uid}-to`}
          name="recipients"
          defaultValue={report?.recipients ?? defaultRecipients}
          required
          maxLength={1000}
          className="min-h-20"
          dir="ltr"
          placeholder="you@example.com, team@example.com"
        />
      </Field>
      <SubmitButton pendingText={t("dash.reports.saving")}>{report ? t("dash.reports.save") : t("dash.reports.create")}</SubmitButton>
    </form>
  );
}
