import type { Metadata } from "next";
import { Crown } from "lucide-react";
import { AddSiteForm } from "@/components/dashboard/site-forms";
import { DashHeader, Panel } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { getEntitlements } from "@/lib/plans";
import { requireDashboardUser } from "@/lib/dashboard";
import { getT } from "@/lib/i18n/server";
import { plural } from "@/lib/i18n/messages";
import { atLimit } from "@/lib/plans";
import { countUserSites } from "@/lib/sites";
import { timezoneList } from "@/lib/stats-dates";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("dash.sites.add") };
}

export default async function NewSitePage() {
  const user = await requireDashboardUser();
  const [t, entitlements, count] = await Promise.all([getT(), getEntitlements(user), countUserSites(user.id)]);
  const full = atLimit(count, entitlements.maxSites);
  return (
    <div className="mx-auto max-w-2xl">
      <DashHeader title={t("dash.sites.add")} description={t("dash.sites.addText")} />
      {full ? (
        <Alert tone="warning" className="mb-5" title={plural(t, "dash.err.siteLimit", entitlements.maxSites)}>
          <ButtonLink href="/pricing" size="sm" className="mt-2">
            <Crown aria-hidden />
            {t("dash.sites.upgrade")}
          </ButtonLink>
        </Alert>
      ) : null}
      <Panel>
        <AddSiteForm timezones={timezoneList()} atLimit={full} />
      </Panel>
    </div>
  );
}
