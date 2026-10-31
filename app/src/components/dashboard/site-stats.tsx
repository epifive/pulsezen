import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { getT } from "@/lib/i18n/server";
import { formatRange, localDay } from "@/lib/stats-dates";
import type { StatsParams } from "@/lib/stats-url";
import { loadDashboardData } from "@/lib/stats-view";
import { BreakdownCard } from "./breakdown-card";
import { FilterBar } from "./filter-bar";
import { PeriodPicker } from "./period-picker";
import { RealtimeBadge } from "./realtime-badge";
import { StatsOverview } from "./stats-overview";
import { STATS_CARDS } from "./stats-tabs";

/**
 * The analytics view of one site: period picker, filters, KPIs, chart and breakdown cards.
 * Shared by the owner's dashboard and public shared dashboards (read-only).
 */
export async function SiteStats({
  site,
  params,
  basePath,
  dataUrl,
  realtimeUrl,
  realtimeNow,
  locale,
  title,
  goalsHref,
}: {
  site: { id: number; timezone: string; domain: string };
  params: StatsParams;
  /** Path of this view (filters and periods link here). */
  basePath: string;
  /** JSON endpoint for other breakdown tabs. */
  dataUrl: string;
  realtimeUrl: string;
  realtimeNow: number | null;
  locale: string;
  title: ReactNode;
  /** Owner only: where to set up goals. */
  goalsHref?: string;
}) {
  const [t, data] = await Promise.all([getT(), loadDashboardData(site, params, locale)]);
  const prevLabel = formatRange(data.previousLabel.from, data.previousLabel.to, locale);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
          {title}
          <RealtimeBadge url={realtimeUrl} initial={realtimeNow} locale={locale} />
        </div>
        <PeriodPicker basePath={basePath} params={params} rangeLabel={data.period.label} from={data.period.from} to={data.period.to} today={localDay(new Date(), site.timezone)} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FilterBar basePath={basePath} params={params} locale={locale} />
        <p className="text-xs text-muted">
          <bdi>{data.period.label}</bdi>
        </p>
      </div>
      {data.info.approximate ? <Alert tone="warning">{t("dash.stats.approximate")}</Alert> : data.info.breakdownsApproximate ? <Alert tone="warning">{t("dash.stats.approximateBreakdowns")}</Alert> : null}
      <StatsOverview
        aggregate={data.aggregate}
        previous={data.previous}
        change={data.change}
        series={data.series}
        previousSeries={data.previousSeries}
        granularity={data.period.granularity}
        nowBucket={data.nowBucket}
        locale={locale}
        previousLabel={prevLabel}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {STATS_CARDS.map((card) => (
          <BreakdownCard
            key={card.id}
            card={card}
            initialRows={data.rows[card.tabs[0].key] ?? []}
            dataUrl={dataUrl}
            basePath={basePath}
            params={params}
            locale={locale}
            currency={data.currency}
            domain={site.domain}
            emptyAction={goalsHref ? { href: goalsHref, label: t("dash.card.setupGoals") } : undefined}
          />
        ))}
      </div>
    </div>
  );
}
