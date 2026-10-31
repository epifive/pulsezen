import type { Metadata } from "next";
import { StatsDetails } from "@/components/dashboard/stats-details";
import { findTab } from "@/components/dashboard/stats-tabs";
import { intParam } from "@/lib/dash-format";
import { loadSitePage } from "@/lib/dashboard-site";
import { getT } from "@/lib/i18n/server";
import { parseStatsParams } from "@/lib/stats-url";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("dash.details.title") };
}

export default async function SiteDetailsPage({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { site, locale } = await loadSitePage(id);
  const tab = findTab(typeof query.tab === "string" ? query.tab : null) ?? findTab("page")!;
  const base = `/dashboard/sites/${site.id}`;
  return (
    <StatsDetails
      site={site}
      params={parseStatsParams(query)}
      tab={tab}
      page={intParam(query.page, 1, 200)}
      search={typeof query.search === "string" ? query.search.slice(0, 200) : ""}
      basePath={base}
      exportPath={`${base}/export`}
      locale={locale}
    />
  );
}
