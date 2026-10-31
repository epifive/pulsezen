"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { AggregateResult, Granularity } from "@/analytics/types";
import { useT } from "@/lib/i18n/client";
import type { MessageKey, Translator } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";
import { bucketLabel, formatCount, formatDuration, formatPct } from "./stats-format";

export interface OverviewPoint {
  date: string;
  visitors: number;
  visits: number;
  pageviews: number;
  viewsPerVisit: number;
  bounceRate: number;
  visitDuration: number;
}

type MetricKey = "visitors" | "visits" | "pageviews" | "viewsPerVisit" | "bounceRate" | "visitDuration";

const METRICS: Array<{ key: MetricKey; label: MessageKey; ratio?: boolean; lowerIsBetter?: boolean }> = [
  { key: "visitors", label: "dash.metric.visitors" },
  { key: "visits", label: "dash.metric.visits" },
  { key: "pageviews", label: "dash.metric.pageviews" },
  { key: "viewsPerVisit", label: "dash.metric.viewsPerVisit", ratio: true },
  { key: "bounceRate", label: "dash.metric.bounceRate", ratio: true, lowerIsBetter: true },
  { key: "visitDuration", label: "dash.metric.visitDuration", ratio: true },
];

function formatMetric(key: MetricKey, v: number, t: Translator, locale: string): string {
  if (key === "bounceRate") return formatPct(v, locale);
  if (key === "visitDuration") return formatDuration(v, t);
  if (key === "viewsPerVisit") return v.toLocaleString(locale, { maximumFractionDigits: 2 });
  return formatCount(v, locale);
}

function niceMax(v: number): number {
  if (v <= 0) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(v));
  for (const step of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (step * magnitude >= v) return step * magnitude;
  }
  return 10 * magnitude;
}

function Change({ value, lowerIsBetter, points, label }: { value: number | null; lowerIsBetter?: boolean; points?: boolean; label: string }) {
  if (value === null) return null;
  const good = lowerIsBetter ? value < 0 : value > 0;
  const Icon = value === 0 ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      title={label}
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-semibold whitespace-nowrap tabular-nums",
        value === 0 ? "text-muted" : good ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      <bdi>
        {Math.abs(value)}
        {points ? " pp" : "%"}
      </bdi>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** KPI strip (click a number to chart it) and the main chart with hover / keyboard tooltip. */
export function StatsOverview({
  aggregate,
  previous,
  change,
  series,
  previousSeries,
  granularity,
  nowBucket,
  locale,
  previousLabel,
}: {
  aggregate: AggregateResult;
  previous: AggregateResult;
  change: Record<string, number | null>;
  series: OverviewPoint[];
  previousSeries: OverviewPoint[] | null;
  granularity: Granularity;
  nowBucket: string;
  locale: string;
  previousLabel: string;
}) {
  const t = useT();
  const [metric, setMetric] = useState<MetricKey>("visitors");
  const def = METRICS.find((m) => m.key === metric)!;

  return (
    <section className="rounded-xl border border-line bg-surface" aria-label={t("dash.overview.label")}>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-t-xl border-b border-line bg-line sm:grid-cols-3 xl:grid-cols-6">
        {METRICS.map((m) => {
          const active = m.key === metric;
          const value = formatMetric(m.key, aggregate[m.key], t, locale);
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetric(m.key)}
              aria-pressed={active}
              className="relative flex flex-col justify-start bg-surface px-4 py-3.5 text-start transition-colors hover:bg-paper focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary sm:px-5 sm:py-4"
            >
              {active ? <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-primary sm:inset-x-5" aria-hidden /> : null}
              <span className={cn("block text-xs font-medium tracking-wide uppercase", active ? "text-primary" : "text-muted")}>{t(m.label)}</span>
              {/* The value never breaks inside; on a narrow card the change moves under it as a whole. */}
              <span className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <bdi className={cn("font-display font-bold whitespace-nowrap tabular-nums", value.length > 8 ? "text-xl sm:text-2xl" : "text-2xl")}>{value}</bdi>
                <Change
                  value={change[m.key] ?? null}
                  lowerIsBetter={m.lowerIsBetter}
                  points={m.key === "bounceRate"}
                  label={t("dash.overview.vsPrevious", { value: formatMetric(m.key, previous[m.key], t, locale), period: previousLabel })}
                />
              </span>
            </button>
          );
        })}
      </div>
      <div className="p-4 sm:p-5">
        <MainChart
          series={series}
          previousSeries={previousSeries}
          metric={metric}
          ratio={Boolean(def.ratio)}
          label={t(def.label)}
          granularity={granularity}
          nowBucket={nowBucket}
          locale={locale}
          previousLabel={previousLabel}
        />
      </div>
    </section>
  );
}

function MainChart({
  series,
  previousSeries,
  metric,
  ratio,
  label,
  granularity,
  nowBucket,
  locale,
  previousLabel,
}: {
  series: OverviewPoint[];
  previousSeries: OverviewPoint[] | null;
  metric: MetricKey;
  ratio: boolean;
  label: string;
  granularity: Granularity;
  nowBucket: string;
  locale: string;
  previousLabel: string;
}) {
  const t = useT();
  const gradientId = useId().replace(/:/g, "");
  const [active, setActive] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);

  const value = (p: OverviewPoint | undefined): number | null => {
    if (!p) return null;
    if (ratio && !p.visits) return null;
    return p[metric];
  };
  const values = series.map((p) => (p.date > nowBucket ? null : value(p)));
  const prevValues = previousSeries ? series.map((_, i) => value(previousSeries[i])) : null;
  const max = niceMax(Math.max(0, ...values.map((v) => v ?? 0), ...(prevValues ?? []).map((v) => v ?? 0)));
  const W = 1000;
  const H = 240;
  const n = series.length;
  const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => H - (v / max) * H;

  const segments = (vals: Array<number | null>) => {
    const out: Array<Array<[number, number]>> = [];
    let cur: Array<[number, number]> = [];
    vals.forEach((v, i) => {
      if (v === null) {
        if (cur.length) out.push(cur);
        cur = [];
      } else cur.push([x(i), y(v)]);
    });
    if (cur.length) out.push(cur);
    return out;
  };
  const main = segments(values);
  const prev = prevValues ? segments(prevValues) : [];
  const path = (pts: Array<[number, number]>) => pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join("");
  const fmt = (v: number) => formatMetric(metric, v, t, locale);
  const hasData = values.some((v) => (v ?? 0) > 0) || (prevValues ?? []).some((v) => (v ?? 0) > 0);

  // Width of the plot in CSS pixels (0 until measured): narrow charts get fewer date labels.
  const [plotWidth, setPlotWidth] = useState(0);
  useEffect(() => {
    const el = plotRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => setPlotWidth(Math.round(entries[0].contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const ticks = useMemo(() => {
    if (n <= 1) return [0];
    // Room for one label per ~72 px ("Oct 12", "14:00", "Sep 2026"), at most 6–7.
    const maxTicks = Math.max(2, Math.min(granularity === "hour" ? 7 : 6, plotWidth ? Math.floor(plotWidth / 72) : 7));
    if (n <= maxTicks) return Array.from({ length: n }, (_, i) => i);
    const step = Math.ceil((n - 1) / (maxTicks - 1));
    const out: number[] = [];
    for (let i = 0; i < n; i += step) out.push(i);
    // Always label the last point; drop the label before it when the two would touch.
    const last = out[out.length - 1];
    if (last !== n - 1) {
      const minGap = plotWidth ? Math.max(step / 2, (64 / plotWidth) * (n - 1)) : step / 2;
      if (n - 1 - last < minGap && out.length > 1) out.pop();
      out.push(n - 1);
    }
    return out;
  }, [n, granularity, plotWidth]);

  const indexFromEvent = (e: PointerEvent<HTMLDivElement>) => {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect || n === 0) return null;
    let ratioX = (e.clientX - rect.left) / rect.width;
    if (getComputedStyle(plotRef.current!).direction === "rtl") ratioX = 1 - ratioX;
    return Math.max(0, Math.min(n - 1, Math.round(ratioX * (n - 1))));
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!n) return;
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    const fwd = rtl ? "ArrowLeft" : "ArrowRight";
    const back = rtl ? "ArrowRight" : "ArrowLeft";
    if (e.key === fwd) setActive((a) => Math.min(n - 1, (a ?? -1) + 1));
    else if (e.key === back) setActive((a) => Math.max(0, (a ?? n) - 1));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(n - 1);
    else if (e.key === "Escape") setActive(null);
    else return;
    e.preventDefault();
  };

  const tip = active !== null ? series[active] : null;
  const tipLeft = active !== null ? (n <= 1 ? 50 : (active / (n - 1)) * 100) : 0;

  return (
    <figure>
      <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-semibold">{label}</span>
        {prevValues ? (
          <span className="flex items-center gap-4 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full bg-primary" aria-hidden />
              {t("dash.chart.current")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 border-t-2 border-dashed border-muted/60" aria-hidden />
              {previousLabel}
            </span>
          </span>
        ) : null}
      </figcaption>
      <div className="flex gap-2">
        <div className="relative h-60 w-11 shrink-0 text-end text-[11px] text-muted tabular-nums" aria-hidden>
          {[1, 0.5, 0].map((f) => (
            <span key={f} className="absolute end-0 -translate-y-1/2 whitespace-nowrap" style={{ top: `${(1 - f) * 100}%` }}>
              {fmt(ratio && metric === "viewsPerVisit" ? Math.round(max * f * 10) / 10 : max * f)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div
            ref={plotRef}
            className="relative h-60 touch-pan-y rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            tabIndex={0}
            role="group"
            aria-label={t("dash.chart.keyboard", { metric: label })}
            onPointerMove={(e) => setActive(indexFromEvent(e))}
            onPointerLeave={() => setActive(null)}
            onKeyDown={onKey}
            onBlur={() => setActive(null)}
          >
            <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden>
              <div className="border-t border-dashed border-line" />
              <div className="border-t border-dashed border-line" />
              <div className="border-t border-line" />
            </div>
            {hasData ? (
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible rtl:-scale-x-100" aria-hidden>
                <defs>
                  <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.24" />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                {prev.map((pts, i) => (
                  <path key={`p${i}`} d={path(pts)} fill="none" stroke="var(--muted)" strokeOpacity={0.55} strokeWidth={2} strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
                ))}
                {main.map((pts, i) =>
                  pts.length > 1 ? (
                    <g key={i}>
                      <path d={`${path(pts)}L${pts[pts.length - 1][0].toFixed(1)},${H}L${pts[0][0].toFixed(1)},${H}Z`} fill={`url(#${gradientId})`} />
                      <path d={path(pts)} fill="none" stroke="var(--primary)" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                    </g>
                  ) : null,
                )}
                {active !== null ? <line x1={x(active)} x2={x(active)} y1={0} y2={H} stroke="var(--primary)" strokeOpacity={0.35} strokeWidth={1} vectorEffect="non-scaling-stroke" /> : null}
              </svg>
            ) : (
              <div className="absolute inset-0 grid place-items-center text-sm text-muted">{t("dash.chart.empty")}</div>
            )}
            {/* Dots are HTML so they stay round whatever the chart's aspect ratio. */}
            {hasData
              ? main
                  .filter((pts) => pts.length === 1)
                  .map((pts, i) => (
                    <span
                      key={`d${i}`}
                      className="absolute size-2 -translate-x-1/2 translate-y-1/2 rounded-full bg-primary rtl:translate-x-1/2"
                      style={{ insetInlineStart: `${(pts[0][0] / W) * 100}%`, bottom: `${(1 - pts[0][1] / H) * 100}%` }}
                      aria-hidden
                    />
                  ))
              : null}
            {tip && active !== null ? (
              <>
                {values[active] !== null ? (
                  <span
                    className="pointer-events-none absolute size-3 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-surface bg-primary shadow rtl:translate-x-1/2"
                    style={{ insetInlineStart: `${tipLeft}%`, bottom: `${((values[active] ?? 0) / max) * 100}%` }}
                    aria-hidden
                  />
                ) : null}
                <div
                  className={cn(
                    "pointer-events-none absolute top-1 z-10 w-max max-w-60 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg",
                    tipLeft > 60 ? "-translate-x-[calc(100%+12px)] rtl:translate-x-[calc(100%+12px)]" : "translate-x-3 rtl:-translate-x-3",
                  )}
                  style={{ insetInlineStart: `${tipLeft}%` }}
                  role="status"
                >
                  <p className="font-medium">{bucketLabel(tip.date, locale, "long")}</p>
                  <p className="mt-1 flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-primary" aria-hidden />
                    {label}: <bdi className="font-semibold tabular-nums">{values[active] === null ? "—" : fmt(values[active]!)}</bdi>
                  </p>
                  {prevValues && previousSeries?.[active] ? (
                    <p className="mt-0.5 flex items-center gap-1.5 text-muted">
                      <span className="size-2 rounded-full bg-muted/60" aria-hidden />
                      {bucketLabel(previousSeries[active].date, locale, "long")}: <bdi className="font-medium tabular-nums">{prevValues[active] === null ? "—" : fmt(prevValues[active]!)}</bdi>
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
          <div className="relative mt-2 h-4 text-[11px] text-muted" aria-hidden>
            {ticks.map((i, k) => (
              <span
                key={i}
                className={cn(
                  "absolute whitespace-nowrap",
                  k === 0 ? "" : n > 1 && i / (n - 1) > 0.92 ? "-translate-x-full rtl:translate-x-full" : "-translate-x-1/2 rtl:translate-x-1/2",
                )}
                style={{ insetInlineStart: `${n <= 1 ? 50 : (i / (n - 1)) * 100}%` }}
              >
                {series[i] ? bucketLabel(series[i].date, locale) : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-xs text-muted hover:text-ink">{t("dash.chart.table")}</summary>
        <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-line">
          <table className="w-full text-start text-sm">
            <thead>
              <tr>
                <th scope="col" className="sticky top-0 border-b border-line bg-paper px-3 py-2 text-start text-xs font-medium text-muted">
                  {t("dash.chart.date")}
                </th>
                <th scope="col" className="sticky top-0 border-b border-line bg-paper px-3 py-2 text-end text-xs font-medium text-muted">
                  {label}
                </th>
                {prevValues ? (
                  <th scope="col" className="sticky top-0 border-b border-line bg-paper px-3 py-2 text-end text-xs font-medium text-muted">
                    {previousLabel}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {series.map((p, i) => (
                <tr key={p.date} className="border-b border-line last:border-0">
                  <td className="px-3 py-1.5">{bucketLabel(p.date, locale, "long")}</td>
                  <td className="px-3 py-1.5 text-end tabular-nums">
                    <bdi>{values[i] === null ? "—" : fmt(values[i]!)}</bdi>
                  </td>
                  {prevValues ? (
                    <td className="px-3 py-1.5 text-end text-muted tabular-nums">
                      <bdi>{prevValues[i] === null ? "—" : fmt(prevValues[i]!)}</bdi>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
