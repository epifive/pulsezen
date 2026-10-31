import "server-only";
import type { StatsQuery } from "@/analytics/types";
import { findTab, STATS_CARDS, type StatsTab } from "@/components/dashboard/stats-tabs";
import { compareAggregate, getBreakdownResult, getQueryInfo, getTimeseries, type BreakdownItem, type BreakdownOptions, type MetricChanges, type QueryInfo, type ResolvedPeriod, type StatsAggregate, type StatsPoint } from "./query";
import { getSettings } from "./settings";
import { buckets, localDay, previousRange } from "./stats-dates";
import { buildStatsQuery } from "./stats-params";
import type { StatsParams } from "./stats-url";
import type { SiteRecord } from "./sites";

/** Breakdown rows of a dashboard tab (adds the tab's own filter, e.g. channel = ai). */
export async function loadTabRows(q: StatsQuery, tab: StatsTab, options: BreakdownOptions = {}): Promise<BreakdownItem[]> {
  return (await loadTabResult(q, tab, options)).rows;
}

/** loadTabRows plus `approximate` (rolled-up days left out because of the filters). */
export async function loadTabResult(q: StatsQuery, tab: StatsTab, options: BreakdownOptions = {}): Promise<{ rows: BreakdownItem[]; approximate: boolean }> {
  const extra = tab.extraFilter;
  const filters = extra && !q.filters.some((f) => f.dimension === extra.dimension) ? [...q.filters, extra] : q.filters;
  return getBreakdownResult({ ...q, filters }, tab.dimension, options);
}

export interface DashboardData {
  period: ResolvedPeriod;
  aggregate: StatsAggregate;
  previous: StatsAggregate;
  change: MetricChanges;
  previousLabel: { from: string; to: string };
  series: StatsPoint[];
  previousSeries: StatsPoint[] | null;
  /** Bucket labels after this are in the future (not drawn). */
  nowBucket: string;
  /** Initial rows of the first tab of each card. */
  rows: Record<string, BreakdownItem[]>;
  info: QueryInfo;
  currency: string;
}

/** Everything the first render of a stats view needs. */
export async function loadDashboardData(site: Pick<SiteRecord, "id" | "timezone">, params: StatsParams, locale: string): Promise<DashboardData> {
  const { q, period } = await buildStatsQuery(site, params, locale);
  const prev = previousRange(q.from, q.to);
  const firstTabs = STATS_CARDS.map((c) => c.tabs[0]);
  const [cmp, series, previousSeries, info, settings, ...tabRows] = await Promise.all([
    compareAggregate(q),
    getTimeseries(q, period.granularity),
    params.compare ? getTimeseries({ ...q, ...prev }, period.granularity) : Promise.resolve(null),
    getQueryInfo(q),
    getSettings(),
    ...firstTabs.map((tab) => loadTabRows(q, tab, { limit: 9 })),
  ]);
  const now = new Date();
  const today = localDay(now, site.timezone);
  let nowBucket = today;
  if (period.granularity === "hour") {
    // The label of the bucket that contains "now".
    const list = buckets(today, today, "hour", site.timezone).list;
    nowBucket = list.filter((b) => b.startIso <= now.toISOString()).at(-1)?.label ?? `${today} 23:00`;
  } else if (period.granularity === "month") nowBucket = today.slice(0, 7);
  return {
    period,
    aggregate: cmp.current,
    previous: cmp.previous,
    change: cmp.change,
    previousLabel: prev,
    series,
    previousSeries,
    nowBucket,
    rows: Object.fromEntries(firstTabs.map((tab, i) => [tab.key, tabRows[i]])),
    info,
    currency: settings.currency || "USD",
  };
}

export { findTab };
