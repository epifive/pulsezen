"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, Filter, Maximize2 } from "lucide-react";
import type { Dimension } from "@/analytics/types";
import { useT } from "@/lib/i18n/client";
import { addFilter, statsSearch, withSearch, type StatsParams } from "@/lib/stats-url";
import { cn } from "@/lib/utils";
import { CountryCode } from "./country-code";
import { EventProperties } from "./event-properties";
import { formatCount, formatMoneyCents, formatPct, isLtrDimension, valueLabel } from "./stats-format";
import type { StatsCard } from "./stats-tabs";

export interface CardRow {
  value: string;
  visitors: number;
  visits?: number;
  pageviews: number;
  events?: number;
  conversionRate?: number;
  revenueCents?: number;
}

const ROWS = 9;

/**
 * One breakdown card (Pages, Sources…) with tabs. The first tab arrives from the server;
 * other tabs load on demand from `dataUrl`. Clicking a row filters the whole view by it;
 * in the Events tab it opens the event's properties (the filter is the icon next to it).
 */
export function BreakdownCard({
  card,
  initialRows,
  dataUrl,
  basePath,
  params,
  locale,
  currency,
  domain,
  emptyAction,
}: {
  card: StatsCard;
  initialRows: CardRow[];
  dataUrl: string;
  basePath: string;
  params: StatsParams;
  locale: string;
  currency: string;
  /** Site domain: page rows get a link to open the page. */
  domain?: string;
  /** Shown under the empty state of the goals tab (e.g. a link to set up goals). */
  emptyAction?: { href: string; label: string };
}) {
  const t = useT();
  const [tabKey, setTabKey] = useState(card.tabs[0].key);
  const search = statsSearch(params).toString();
  const [cache, setCache] = useState<Record<string, CardRow[]>>({ [card.tabs[0].key]: initialRows });
  const [failed, setFailed] = useState(false);
  const [prevSearch, setPrevSearch] = useState(search);
  /** Events tab: the event whose properties are shown. */
  const [propEvent, setPropEvent] = useState<string | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // New period or filters: start again from the server's rows.
  if (prevSearch !== search) {
    setPrevSearch(search);
    setCache({ [card.tabs[0].key]: initialRows });
    setTabKey(card.tabs[0].key);
    setPropEvent(null);
  }

  const tab = card.tabs.find((x) => x.key === tabKey) ?? card.tabs[0];
  const rows = cache[tab.key];

  useEffect(() => {
    if (cache[tab.key]) return;
    let cancelled = false;
    const url = withSearch(dataUrl, new URLSearchParams(search), { tab: tab.key, limit: String(ROWS) });
    fetch(url, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ rows: CardRow[] }>) : Promise.reject(new Error(String(res.status)))))
      .then((body) => {
        if (!cancelled) setCache((c) => ({ ...c, [tab.key]: body.rows }));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [cache, tab.key, dataUrl, search]);

  // One header tab per tab, or per group of tabs (UTM medium / source / campaign).
  const headerTabs = card.tabs.filter((x, i) => !x.group || card.tabs.findIndex((y) => y.group?.key === x.group!.key) === i);
  const groupTabs = tab.group ? card.tabs.filter((x) => x.group?.key === tab.group!.key) : [];
  const isSelected = (x: (typeof card.tabs)[number]) => (x.group ? x.group.key === tab.group?.key : x.key === tab.key);
  const select = (key: string) => {
    setFailed(false);
    setTabKey(key);
    setPropEvent(null);
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    const count = headerTabs.length;
    let next = -1;
    if (e.key === (rtl ? "ArrowLeft" : "ArrowRight")) next = (i + 1) % count;
    else if (e.key === (rtl ? "ArrowRight" : "ArrowLeft")) next = (i - 1 + count) % count;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = count - 1;
    if (next < 0) return;
    e.preventDefault();
    select(headerTabs[next].key);
    tabRefs.current[next]?.focus();
  };

  const metricOf = (r: CardRow) => (tab.value === "visits" ? (r.visits ?? r.visitors) : r.visitors);
  const max = Math.max(1, ...(rows ?? []).map(metricOf));
  const dimension: Dimension = tab.dimension;
  const isGoals = dimension === "goal";
  const isEvents = dimension === "event";
  const showRevenue = (isGoals || isEvents) && (rows ?? []).some((r) => (r.revenueCents ?? 0) > 0);
  const panelId = `bd-${card.id}-panel`;
  const detailsHref = withSearch(`${basePath}/details`, new URLSearchParams(search), { tab: tab.key });

  return (
    <section className={cn("flex min-w-0 flex-col rounded-xl border border-line bg-surface", card.id === "conversions" && "lg:col-span-2")} aria-labelledby={`bd-${card.id}-title`}>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 pt-3.5 sm:px-5">
        <h2 id={`bd-${card.id}-title`} className="pb-3 font-sans text-sm font-semibold tracking-normal">
          {t(card.title)}
        </h2>
        <div role="tablist" aria-label={t(card.title)} className="-mb-px flex max-w-full gap-3 overflow-x-auto [scrollbar-width:none]">
          {headerTabs.map((x, i) => {
            const selected = isSelected(x);
            return (
              <button
                key={x.key}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`bd-${card.id}-tab-${x.group?.key ?? x.key}`}
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(x.key)}
                onKeyDown={(e) => onTabKey(e, i)}
                className={cn(
                  "shrink-0 border-b-2 pb-2.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-primary",
                  selected ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink",
                )}
              >
                {t(x.group ? x.group.label : x.label)}
              </button>
            );
          })}
        </div>
      </header>
      <div id={panelId} role="tabpanel" aria-labelledby={`bd-${card.id}-tab-${tab.group?.key ?? tab.key}`} className="flex flex-1 flex-col px-2 py-2 sm:px-3">
        {groupTabs.length > 1 ? (
          <div className="flex flex-wrap gap-1 px-2 pt-1 pb-1" role="group" aria-label={t(tab.group!.label)}>
            {groupTabs.map((x) => (
              <button
                key={x.key}
                type="button"
                aria-pressed={x.key === tab.key}
                onClick={() => select(x.key)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                  x.key === tab.key ? "bg-primary-soft text-primary" : "text-muted hover:bg-paper hover:text-ink",
                )}
              >
                {t(x.label)}
              </button>
            ))}
          </div>
        ) : null}
        {isEvents && propEvent !== null ? (
          <EventProperties key={propEvent} event={propEvent} dataUrl={dataUrl} search={search} locale={locale} currency={currency} onBack={() => setPropEvent(null)} />
        ) : (
          <>
            <div className="flex items-center justify-between px-2 py-1.5 text-[11px] font-medium tracking-wide text-muted uppercase">
              <span>{t(isGoals ? "dash.dim.goal" : isEvents ? "dash.dim.event" : "dash.card.name")}</span>
              <span className="flex gap-4">
                {isGoals || isEvents ? <span className="w-14 text-end max-sm:hidden">{t("dash.metric.total")}</span> : null}
                {isGoals ? <span className="w-12 text-end">{t("dash.metric.cr")}</span> : null}
                {showRevenue ? <span className="w-16 text-end max-sm:hidden">{t("dash.metric.revenue")}</span> : null}
                <span className="w-20 text-end">{t(tab.metric)}</span>
              </span>
            </div>
            {!rows ? (
              failed ? (
                <p className="px-2 py-10 text-center text-sm text-muted">{t("dash.card.error")}</p>
              ) : (
                <ul className="space-y-1.5 px-2 py-1" aria-busy="true" aria-label={t("dash.card.loading")}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <li key={i} className="h-7 animate-pulse rounded-md bg-paper" style={{ width: `${90 - i * 14}%` }} />
                  ))}
                </ul>
              )
            ) : rows.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center text-sm text-muted">
                <p>{t(isGoals ? "dash.card.noGoals" : "dash.card.empty")}</p>
                {isGoals && emptyAction ? (
                  <Link href={emptyAction.href} className="font-medium text-primary hover:underline">
                    {emptyAction.label}
                  </Link>
                ) : null}
              </div>
            ) : (
              <ul className="space-y-0.5">
                {rows.map((r) => {
                  const m = metricOf(r);
                  const label = valueLabel(dimension, r.value, t, locale);
                  const filterDim: Dimension = dimension;
                  const href = withSearch(basePath, statsSearch(addFilter(params, { dimension: filterDim, op: "is", value: r.value })));
                  const ltr = isLtrDimension(dimension);
                  return (
                    <li key={r.value} className="group relative">
                      <div className="absolute inset-y-0 start-0 rounded-md bg-primary/10 transition-colors group-hover:bg-primary/15" style={{ width: `${(m / max) * 100}%` }} aria-hidden />
                      <div className="relative flex min-h-8 items-center gap-3 px-2 text-sm">
                        {isEvents ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setPropEvent(r.value)}
                              title={t("dash.props.show", { event: label })}
                              className="flex min-w-0 flex-1 items-center gap-2 py-1 text-start hover:underline focus-visible:underline"
                            >
                              <bdi dir="auto" className="truncate">
                                {label}
                              </bdi>
                            </button>
                            <Link
                              href={href}
                              scroll={false}
                              aria-label={t("dash.card.filterBy", { value: label })}
                              title={t("dash.card.filterBy", { value: label })}
                              className="shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-primary"
                            >
                              <Filter className="size-3.5" aria-hidden />
                            </Link>
                          </>
                        ) : (
                          <Link
                            href={href}
                            scroll={false}
                            title={t("dash.card.filterBy", { value: label })}
                            className="flex min-w-0 flex-1 items-center gap-2 py-1 hover:underline focus-visible:underline"
                          >
                            {dimension === "country" ? <CountryCode code={r.value} /> : null}
                            <bdi dir={ltr ? "ltr" : "auto"} className={cn("truncate", ltr && "font-mono text-[13px]")}>
                              {label}
                            </bdi>
                          </Link>
                        )}
                        {domain && (dimension === "page" || dimension === "entry_page" || dimension === "exit_page") && r.value.startsWith("/") ? (
                          <a
                            href={`https://${domain}${r.value}`}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            aria-label={t("dash.card.openPage", { page: r.value })}
                            className="shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-primary"
                          >
                            <ArrowUpRight className="size-3.5" aria-hidden />
                          </a>
                        ) : null}
                        <span className="flex shrink-0 gap-4 tabular-nums">
                          {isGoals || isEvents ? <span className="w-14 text-end text-muted max-sm:hidden">{formatCount(r.events ?? 0, locale, true)}</span> : null}
                          {isGoals ? <span className="w-12 text-end text-muted">{formatPct(r.conversionRate ?? 0, locale, 1)}</span> : null}
                          {showRevenue ? <span className="w-16 text-end text-muted max-sm:hidden">{r.revenueCents ? formatMoneyCents(r.revenueCents, currency, locale) : "—"}</span> : null}
                          <span className="w-20 text-end font-medium">{formatCount(m, locale, true)}</span>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {rows && rows.length > 0 ? (
              <div className="mt-auto flex justify-center pt-2">
                <Link href={detailsHref} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted hover:text-primary">
                  <Maximize2 className="size-3.5" aria-hidden />
                  {t("dash.card.details")}
                </Link>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
