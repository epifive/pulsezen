import type { Metadata } from "next";
import Link from "next/link";
import { Code2 } from "lucide-react";
import { DangerZone, SharingPanel, SiteGeneralForm, TrackingForm } from "@/components/dashboard/site-forms";
import { CopyField } from "@/components/dashboard/copy";
import { DashHeader, Panel } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { loadSitePage } from "@/lib/dashboard-site";
import { formatDateTime } from "@/lib/dash-format";
import { getT } from "@/lib/i18n/server";
import { getEntitlements } from "@/lib/plans";
import { baseUrl } from "@/lib/request";
import { timezoneList } from "@/lib/stats-dates";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("dash.settings.title") };
}

export default async function SiteSettingsPage({ params }: Props) {
  const [{ id }, t] = await Promise.all([params, getT()]);
  const { site, user, locale } = await loadSitePage(id);
  const [origin, entitlements] = await Promise.all([baseUrl(), getEntitlements(user)]);
  const snippet = `<script defer src="${origin}/pz.js" data-site="${site.publicKey}"></script>`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <DashHeader title={t("dash.settings.title")} description={<span dir="ltr">{site.domain}</span>} />

      <Panel
        title={t("dash.settings.tracking")}
        actions={
          site.verifiedAt ? (
            <Badge tone="success">{t("dash.settings.verifiedSince", { date: formatDateTime(site.verifiedAt, locale, false) })}</Badge>
          ) : (
            <Badge tone="warning">{t("dash.settings.notVerified")}</Badge>
          )
        }
      >
        <CopyField value={snippet} label={t("dash.install.snippet")} multiline />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-muted">
            {t("dash.settings.siteKey")}{" "}
            <code dir="ltr" className="rounded bg-paper px-1.5 py-0.5 font-mono text-[13px] text-ink">
              {site.publicKey}
            </code>
          </p>
          <Link href={`/dashboard/sites/${site.id}/install`} className={buttonClass("outline", "sm")}>
            <Code2 aria-hidden />
            {t("dash.settings.installGuide")}
          </Link>
        </div>
      </Panel>

      <Panel title={t("dash.settings.general")}>
        <SiteGeneralForm site={site} timezones={timezoneList()} />
      </Panel>

      <Panel title={t("dash.settings.filtering")} description={t("dash.settings.filteringText")}>
        <TrackingForm siteId={site.id} settings={site.settings} />
      </Panel>

      <Panel id="sharing" title={t("dash.share.title")} description={t("dash.share.text")}>
        <SharingPanel
          siteId={site.id}
          shareUrl={site.shareToken ? `${origin}/share/${site.shareToken}` : null}
          hasPassword={site.hasSharePassword}
          removeBranding={entitlements.removeBranding}
        />
      </Panel>

      <Panel title={t("dash.settings.danger")} className="border-red-200 dark:border-red-900/60">
        <DangerZone site={site} />
      </Panel>
    </div>
  );
}
