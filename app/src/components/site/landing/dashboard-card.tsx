import { TrendingDown, TrendingUp } from "lucide-react";
import { CountryCode } from "@/components/dashboard/country-code";
import { cn } from "@/lib/utils";
import { areaPaths } from "./chart";

export interface PreviewRow {
  label: string;
  value: number;
  /** Paths and domains stay left-to-right in RTL pages. */
  ltr?: boolean;
  /** Marks an AI assistant source. */
  ai?: boolean;
  country?: string;
}

export interface PreviewKpi {
  label: string;
  value: string;
  /** % change against the previous period; null hides it. */
  change: number | null;
  /** A drop is good news (bounce rate). */
  lowerIsBetter?: boolean;
}

export interface PreviewList {
  title: string;
  metric: string;
  rows: PreviewRow[];
  /** Hidden on phones to keep the card short. */
  hideOnMobile?: boolean;
}

export interface PreviewData {
  kpis: PreviewKpi[];
  series: number[];
  lists: PreviewList[];
}

const CHART_W = 640;

/**
 * The body of a Pulsezen dashboard (KPI strip, visitors chart, breakdown lists), drawn with
 * plain HTML/SVG so it costs no JavaScript. Used by the hero illustration and the live preview.
 */
export function DashboardBody({
  data,
  locale,
  aiLabel,
  chartLabel,
  chartHeight = 132,
  gradientId,
  wide = false,
  animate = false,
}: {
  data: PreviewData;
  locale: string;
  aiLabel: string;
  chartLabel: string;
  chartHeight?: number;
  gradientId: string;
  wide?: boolean;
  /** Draw the line on load (the hero only: lower sections are off screen at that moment). */
  animate?: boolean;
}) {
  const { line, area, peak } = areaPaths(data.series, CHART_W, chartHeight, 10);
  const fmt = (n: number) => n.toLocaleString(locale);

  return (
    <div className={cn("space-y-3", wide ? "p-3 sm:space-y-4 sm:p-6" : "p-3 sm:p-4")}>
      <dl className={cn("grid grid-cols-2 gap-2", wide ? "sm:grid-cols-4 sm:gap-3" : "sm:grid-cols-4")}>
        {data.kpis.map((k, i) => {
          const good = k.change === null ? null : k.lowerIsBetter ? k.change <= 0 : k.change >= 0;
          const Trend = k.change !== null && k.change < 0 ? TrendingDown : TrendingUp;
          return (
            <div
              key={k.label}
              className={cn(
                "relative flex min-w-0 flex-col-reverse justify-end rounded-xl border px-3 py-2.5",
                i === 0 ? "border-primary-line bg-primary-soft" : "border-line bg-paper/60",
              )}
            >
              <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
                <bdi className={cn("font-display font-bold tracking-tight tabular-nums", wide ? "text-xl sm:text-2xl" : "text-lg sm:text-xl")}>{k.value}</bdi>
                {k.change !== null ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 text-[10px] font-semibold sm:text-[11px]",
                      good ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
                    )}
                  >
                    <Trend className="size-3" aria-hidden />
                    <bdi dir="ltr">
                      {k.change > 0 ? "+" : ""}
                      {Math.round(k.change)}%
                    </bdi>
                  </span>
                ) : null}
              </dd>
              <dt className="truncate text-[10px] font-medium text-muted sm:text-[11px]">{k.label}</dt>
              {i === 0 ? <span aria-hidden className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" /> : null}
            </div>
          );
        })}
      </dl>

      <div className="rounded-xl border border-line bg-paper/60 p-3">
        <p className="text-[11px] font-semibold text-muted">{chartLabel}</p>
        <div className={cn("relative mt-2", wide ? "h-32 sm:h-48" : "h-24")}>
          <svg viewBox={`0 0 ${CHART_W} ${chartHeight}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="var(--primary)" stopOpacity="0.32" />
                <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((f) => (
              <line key={f} x1="0" x2={CHART_W} y1={chartHeight * f} y2={chartHeight * f} stroke="var(--line)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
            ))}
            <path d={area} fill={`url(#${gradientId})`} />
            <path
              d={line}
              pathLength={1}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className={animate ? "animate-[pz-draw_1.6s_ease-out_0.2s_both] [stroke-dasharray:1] motion-reduce:animate-none" : undefined}
            />
          </svg>
          {peak && data.series.some((v) => v > 0) ? (
            <span
              aria-hidden
              className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-primary shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_22%,transparent)]"
              style={{ left: `${(peak[0] / CHART_W) * 100}%`, top: `${(peak[1] / chartHeight) * 100}%` }}
            />
          ) : null}
        </div>
      </div>

      <div className={cn("grid grid-cols-1 gap-3", data.lists.length >= 3 ? "md:grid-cols-3" : "sm:grid-cols-2")}>
        {data.lists.map((list) => {
          const max = Math.max(1, ...list.rows.map((r) => r.value));
          return (
            <div key={list.title} className={cn("min-w-0 rounded-xl border border-line p-3", list.hideOnMobile && "max-sm:hidden")}>
              <p className="flex items-baseline justify-between gap-2 text-[11px] font-semibold text-muted">
                <span className="truncate text-ink">{list.title}</span>
                <span className="shrink-0">{list.metric}</span>
              </p>
              <ul className="mt-2 space-y-1">
                {list.rows.map((row) => (
                  <li key={row.label} className="relative flex items-center gap-2 overflow-hidden rounded-md px-2 py-1 text-[12px]">
                    <span
                      aria-hidden
                      className={cn("absolute inset-y-0 start-0 rounded-md", row.ai ? "bg-violet-500/15" : "bg-primary-soft")}
                      style={{ width: `${Math.max(4, (row.value / max) * 100)}%` }}
                    />
                    {row.country ? <CountryCode code={row.country} /> : null}
                    {/* The truncating element carries the text direction, so long paths lose their end (not their start) in RTL too. */}
                    <bdi dir={row.ltr ? "ltr" : "auto"} className="relative min-w-0 flex-1 truncate text-left font-medium rtl:text-right">
                      {row.label}
                    </bdi>
                    {row.ai ? (
                      <span className="relative shrink-0 rounded bg-violet-500/15 px-1.5 py-px text-[9px] font-bold tracking-wide text-violet-700 uppercase dark:text-violet-300">
                        {aiLabel}
                      </span>
                    ) : null}
                    <bdi className="relative shrink-0 font-semibold tabular-nums">{fmt(row.value)}</bdi>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
