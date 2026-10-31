import Link from "next/link";
import { ArrowLeft, Download, Search } from "lucide-react";
import type { Dimension } from "@/analytics/types";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { getSettings } from "@/lib/settings";
import { getT } from "@/lib/i18n/server";
import { buildStatsQuery } from "@/lib/stats-params";
import { addFilter, statsSearch, withSearch, type StatsParams } from "@/lib/stats-url";
import { loadTabResult } from "@/lib/stats-view";
import { cn } from "@/lib/utils";
import { CountryCode } from "./country-code";
import { FilterBar } from "./filter-bar";
import { DIMENSION_LABEL, formatCount, formatDuration, formatMoneyCents, formatPct, isLtrDimension, valueLabel } from "./stats-format";
import { STATS_CARDS, type StatsTab } from "./stats-tabs";
import { DTable, DTd, DTh, Empty, Panel } from "./ui";

const PAGE_SIZE = 50;

/** Full list of one breakdown tab: search, pagination and CSV export. */
export async function StatsDetails({
  site,
  params,
  tab,
  page,
  search,
  basePath,
  exportPath,
  locale,
}: {
  site: { id: number; timezone: string };
  params: StatsParams;
  tab: StatsTab;
  page: number;
  search: string;
  basePath: string;
  exportPath: string;
  locale: string;
}) {
  const [t, settings, { q, period }] = await Promise.all([getT(), getSettings(), buildStatsQuery(site, params, locale)]);
  const { rows, approximate } = await loadTabResult(q, tab, { limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE, search });
  const hasMore = rows.length > PAGE_SIZE;
  const list = rows.slice(0, PAGE_SIZE);
  const d: Dimension = tab.dimension;
  const isConv = d === "goal" || d === "event";
  const isPage = d === "page" || d === "hostname";
  const showRevenue = isConv && list.some((r) => (r.revenueCents ?? 0) > 0);
  const card = STATS_CARDS.find((c) => c.tabs.some((x) => x.key === tab.key));
  const viewSearch = statsSearch(params);
  const detailsHref = (extra: Record<string, string>) => withSearch(`${basePath}/details`, viewSearch, { tab: tab.key, ...(search ? { search } : {}), ...extra });
  const num = (n: number) => formatCount(n, locale);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href={withSearch(basePath, viewSearch)} className="inline-flex items-center gap-1 text-sm text-muted hover:text-primary">
            <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
            {t("dash.details.back")}
          </Link>
          <h1 className="mt-1 text-2xl font-bold">{card ? `${t(card.title)} · ${t(tab.label)}` : t(DIMENSION_LABEL[d])}</h1>
          <p className="mt-0.5 text-sm text-muted">
            <bdi>{period.label}</bdi>
          </p>
        </div>
        <a href={withSearch(exportPath, viewSearch, { tab: tab.key })} className={buttonClass("outline", "md")}>
          <Download aria-hidden />
          {t("dash.details.export")}
        </a>
      </div>
      {approximate ? <Alert tone="warning">{t("dash.stats.approximate")}</Alert> : null}
      {card ? (
        <nav aria-label={t(card.title)} className="flex flex-wrap gap-1">
          {card.tabs.map((x) => (
            <Link
              key={x.key}
              href={withSearch(`${basePath}/details`, viewSearch, { tab: x.key })}
              aria-current={x.key === tab.key ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-1 text-sm font-medium",
                x.key === tab.key ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface hover:text-ink",
              )}
            >
              {t(x.label)}
            </Link>
          ))}
        </nav>
      ) : null}
      <FilterBar basePath={`${basePath}/details`} params={params} locale={locale} keep={{ tab: tab.key }} />
      <Panel
        padded={false}
        title={t(DIMENSION_LABEL[d])}
        actions={
          <form method="get" className="relative" role="search">
            {[...viewSearch.entries()].map(([k, v], i) => (
              <input key={`${k}${i}`} type="hidden" name={k} value={v} />
            ))}
            <input type="hidden" name="tab" value={tab.key} />
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              name="search"
              defaultValue={search}
              placeholder={t("dash.details.search")}
              aria-label={t("dash.details.search")}
              className="h-9 w-56 max-w-full rounded-lg border border-line bg-surface ps-8 pe-3 text-sm text-ink focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
            />
          </form>
        }
      >
        {list.length ? (
          <DTable minWidth={isPage ? 480 : 720} label={t(DIMENSION_LABEL[d])}>
            <thead>
              <tr>
                <DTh>{t(DIMENSION_LABEL[d])}</DTh>
                <DTh className="text-end">{t(isConv ? "dash.metric.uniques" : "dash.metric.visitors")}</DTh>
                {isConv ? <DTh className="text-end">{t("dash.metric.total")}</DTh> : null}
                {d === "goal" ? <DTh className="text-end">{t("dash.metric.cr")}</DTh> : null}
                {showRevenue ? <DTh className="text-end">{t("dash.metric.revenue")}</DTh> : null}
                {!isConv && !isPage ? <DTh className="text-end">{t(tab.value === "visits" ? tab.metric : "dash.metric.visits")}</DTh> : null}
                {!isConv ? <DTh className="text-end">{t("dash.metric.pageviews")}</DTh> : null}
                {!isConv && !isPage ? <DTh className="text-end">{t("dash.metric.bounceRate")}</DTh> : null}
                {!isConv && !isPage ? <DTh className="text-end">{t("dash.metric.visitDuration")}</DTh> : null}
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const label = valueLabel(d, r.value, t, locale);
                const ltr = isLtrDimension(d);
                return (
                  <tr key={r.value} className="hover:bg-paper/60">
                    <DTd className="max-w-[28rem]">
                      <Link
                        href={withSearch(basePath, statsSearch(addFilter(params, { dimension: d, op: "is", value: r.value })))}
                        className="flex min-w-0 items-center gap-2 hover:text-primary hover:underline"
                        title={t("dash.card.filterBy", { value: label })}
                      >
                        {d === "country" ? <CountryCode code={r.value} /> : null}
                        <bdi dir={ltr ? "ltr" : "auto"} className={cn("truncate", ltr && "font-mono text-[13px]")}>
                          {label}
                        </bdi>
                      </Link>
                    </DTd>
                    <DTd className="text-end font-medium tabular-nums">{num(r.visitors)}</DTd>
                    {isConv ? <DTd className="text-end tabular-nums">{num(r.events ?? 0)}</DTd> : null}
                    {d === "goal" ? <DTd className="text-end tabular-nums">{formatPct(r.conversionRate ?? 0, locale, 1)}</DTd> : null}
                    {showRevenue ? <DTd className="text-end tabular-nums">{formatMoneyCents(r.revenueCents ?? 0, settings.currency || "USD", locale)}</DTd> : null}
                    {!isConv && !isPage ? <DTd className="text-end tabular-nums">{num(r.visits ?? 0)}</DTd> : null}
                    {!isConv ? <DTd className="text-end tabular-nums">{num(r.pageviews)}</DTd> : null}
                    {!isConv && !isPage ? <DTd className="text-end tabular-nums">{formatPct(r.bounceRate ?? 0, locale)}</DTd> : null}
                    {!isConv && !isPage ? (
                      <DTd className="text-end tabular-nums">
                        <bdi>{formatDuration(r.visitDuration ?? 0, t)}</bdi>
                      </DTd>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </DTable>
        ) : (
          <Empty icon={<Search />} title={search ? t("dash.details.noMatch") : t("dash.card.empty")} />
        )}
        {page > 1 || hasMore ? (
          <nav aria-label={t("dash.details.pages")} className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm">
            <span className="text-muted">{t("dash.details.page", { n: page })}</span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link href={detailsHref({ page: String(page - 1) })} className={buttonClass("outline", "sm")} rel="prev">
                  {t("dash.details.previous")}
                </Link>
              ) : null}
              {hasMore ? (
                <Link href={detailsHref({ page: String(page + 1) })} className={buttonClass("outline", "sm")} rel="next">
                  {t("dash.details.next")}
                </Link>
              ) : null}
            </div>
          </nav>
        ) : null}
      </Panel>
    </div>
  );
}
