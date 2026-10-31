import type { Metadata } from "next";
import Link from "next/link";
import { Download, ExternalLink, Share2 } from "lucide-react";
import { SiteStats } from "@/components/dashboard/site-stats";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { loadSitePage } from "@/lib/dashboard-site";
import { getT } from "@/lib/i18n/server";
import { getRealtimeVisitors } from "@/lib/realtime";
import { getOwnedSite } from "@/lib/sites";
import { getCurrentUser } from "@/lib/auth/session";
import { parseStatsParams, statsSearch, withSearch } from "@/lib/stats-url";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);
  const site = user ? await getOwnedSite(Number(id), user.id) : undefined;
  return { title: site?.name ?? "Dashboard" };
}

export default async function SiteDashboardPage({ params, searchParams }: Props) {
  const [{ id }, query, t] = await Promise.all([params, searchParams, getT()]);
  const { site, locale } = await loadSitePage(id);
  const statsParams = parseStatsParams(query);
  const base = `/dashboard/sites/${site.id}`;
  const realtime = await getRealtimeVisitors(site.id).catch(() => null);

  return (
    <>
      {!site.verifiedAt ? (
        <Alert tone="info" title={t("dash.site.notInstalledTitle")} className="mb-5">
          {t("dash.site.notInstalledText")}{" "}
          <Link href={`${base}/install`} className="font-semibold text-primary underline underline-offset-2">
            {t("dash.site.installCta")}
          </Link>
        </Alert>
      ) : null}
      <SiteStats
        site={site}
        params={statsParams}
        basePath={base}
        dataUrl={`${base}/data`}
        realtimeUrl={`/api/sites/${site.id}/realtime`}
        realtimeNow={realtime}
        locale={locale}
        goalsHref={`${base}/goals`}
        title={
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0">
              <h1 dir="auto" className="truncate text-2xl font-bold">
                {site.name}
              </h1>
              <a
                href={`https://${site.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                dir="ltr"
                className="inline-flex items-center gap-1 text-sm text-muted hover:text-primary"
              >
                {site.domain}
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </div>
            <div className="flex shrink-0 gap-1">
              <a
                href={withSearch(`${base}/export`, statsSearch(statsParams))}
                className={buttonClass("ghost", "sm", "px-2")}
                title={t("dash.site.exportChart")}
                aria-label={t("dash.site.exportChart")}
              >
                <Download aria-hidden />
              </a>
              <Link href={`${base}/settings#sharing`} className={buttonClass("ghost", "sm", "px-2")} title={t("dash.site.share")} aria-label={t("dash.site.share")}>
                <Share2 aria-hidden />
              </Link>
            </div>
          </div>
        }
      />
    </>
  );
}
