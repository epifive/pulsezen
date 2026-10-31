import { cn } from "@/lib/utils";
import { uptimeBand } from "@/lib/dash-format";

/**
 * Pure SVG/CSS charts for the dashboard (no chart library, no client JS).
 * Hover tooltips use CSS group-hover/focus-within; each chart also carries a
 * text alternative for screen readers.
 */

/** Tiny response-time line for list rows. `points` are ms values (null = no successful check). */
export function Sparkline({
  points,
  failures,
  label,
  className,
}: {
  points: Array<number | null>;
  failures?: number[];
  label: string;
  className?: string;
}) {
  const w = 120;
  const h = 32;
  const values = points.filter((p): p is number => p !== null);
  const max = Math.max(1, ...values);
  const min = values.length ? Math.min(...values) : 0;
  const range = Math.max(1, max - min);
  const step = points.length > 1 ? w / (points.length - 1) : w;
  // A single value (e.g. a daily job) sits on the middle line instead of looking like a stray pixel.
  const y = (v: number) => (values.length === 1 ? h / 2 : h - 3 - ((v - min) / range) * (h - 8));

  // Split into segments at gaps so missing hours are not bridged.
  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((p, i) => {
    if (p === null) {
      if (current.length) segments.push(current.join(" "));
      current = [];
    } else current.push(`${(i * step).toFixed(1)},${y(p).toFixed(1)}`);
  });
  if (current.length) segments.push(current.join(" "));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn("h-8 w-full overflow-visible", className)} role="img" aria-label={label}>
      {failures?.map((f, i) =>
        f > 0 ? <rect key={i} x={Math.max(0, i * step - step / 2)} y={0} width={Math.max(2, step)} height={h} className="fill-red-500/15" /> : null,
      )}
      {values.length < 2 ? <line x1={0} x2={w} y1={h / 2} y2={h / 2} className="stroke-line" strokeWidth={1.5} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" /> : null}
      {segments.map((seg, i) =>
        seg.includes(" ") ? (
          <polyline key={i} points={seg} fill="none" className="stroke-primary" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        ) : (
          <circle key={i} cx={seg.split(",")[0]} cy={seg.split(",")[1]} r={2} className="fill-primary" />
        ),
      )}
    </svg>
  );
}

export interface ResponsePoint {
  at: string;
  avgMs: number | null;
  minMs: number | null;
  maxMs: number | null;
  failures: number;
  checks: number;
  /** Pre-formatted tooltip lines (time, average, range, failures). */
  tip: { title: string; lines: string[] };
}

/**
 * Response-time area chart with a hover tooltip per bucket and red marks where checks failed.
 * `bars` draws one bar per bucket instead, which reads better for sparse data such as daily jobs.
 */
export function ResponseChart({
  data,
  axis,
  label,
  emptyText,
  variant = "line",
}: {
  data: ResponsePoint[];
  axis: { start: string; middle: string; end: string; unit: (n: number) => string };
  label: string;
  emptyText: string;
  variant?: "line" | "bars";
}) {
  const values = data.map((d) => d.avgMs).filter((v): v is number => v !== null);
  if (!values.length) {
    return <div className="grid h-56 place-items-center rounded-lg border border-dashed border-line text-sm text-muted">{emptyText}</div>;
  }
  const rawMax = Math.max(...values);
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, rawMax)));
  const niceMax = Math.max(10, Math.ceil((rawMax * 1.1) / magnitude) * magnitude);
  const w = 1000;
  const h = 220;
  const n = data.length;
  // Points sit in the middle of their hover column.
  const col = w / Math.max(1, n);
  const x = (i: number) => (i + 0.5) * col;
  const y = (v: number) => h - (v / niceMax) * h;

  const lines: string[][] = [];
  let seg: string[] = [];
  data.forEach((d, i) => {
    if (d.avgMs === null) {
      if (seg.length) lines.push(seg);
      seg = [];
    } else seg.push(`${x(i).toFixed(1)},${y(d.avgMs).toFixed(1)}`);
  });
  if (seg.length) lines.push(seg);
  const edge = Math.max(2, Math.round(n * 0.15));
  const barWidth = Math.min(col - 2, Math.max(col * 0.6, 10));

  return (
    <figure aria-label={label}>
      <div className="flex gap-2">
        <div className="flex h-56 w-12 shrink-0 flex-col justify-between text-end text-[11px] text-muted tabular-nums" aria-hidden>
          <span className="-translate-y-1/2">{axis.unit(niceMax)}</span>
          <span>{axis.unit(Math.round(niceMax / 2))}</span>
          <span className="translate-y-1/2">0</span>
        </div>
        <div className="relative h-56 min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden>
            <div className="border-t border-dashed border-line" />
            <div className="border-t border-dashed border-line" />
            <div className="border-t border-line" />
          </div>
          <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
            <defs>
              <linearGradient id="sz-rt-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {data.map((d, i) =>
              d.failures > 0 ? (
                <rect key={`f${i}`} x={x(i) - col / 2 + 1} y={h - 6} width={Math.max(3, col - 2)} height={6} rx={1.5} className="fill-red-500" />
              ) : null,
            )}
            {variant === "bars"
              ? data.map((d, i) =>
                  d.avgMs !== null ? (
                    <rect
                      key={`b${i}`}
                      x={x(i) - barWidth / 2}
                      y={Math.min(y(d.avgMs), h - 2)}
                      width={barWidth}
                      height={Math.max(2, h - y(d.avgMs))}
                      className="fill-primary/75"
                    />
                  ) : null,
                )
              : lines.map((pts, i) =>
              pts.length > 1 ? (
                <g key={i}>
                  <polygon points={`${pts[0].split(",")[0]},${h} ${pts.join(" ")} ${pts[pts.length - 1].split(",")[0]},${h}`} fill="url(#sz-rt-fill)" />
                  <polyline points={pts.join(" ")} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                </g>
              ) : (
                <circle key={i} cx={pts[0].split(",")[0]} cy={pts[0].split(",")[1]} r={3} fill="var(--primary)" vectorEffect="non-scaling-stroke" />
              ),
            )}
          </svg>
          <ul className="absolute inset-0 flex">
            {data.map((d, i) => {
              const align = i < edge ? "start-0" : i >= n - edge ? "end-0" : "left-1/2 -translate-x-1/2";
              return (
                <li key={d.at} className="group relative h-full flex-1">
                  <span className="sr-only">
                    {d.tip.title}: {d.tip.lines.join(", ")}
                  </span>
                  <div className="absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-primary/40 group-hover:block" aria-hidden />
                  {d.avgMs !== null && variant === "line" ? (
                    <span
                      className="absolute left-1/2 hidden size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-surface bg-primary group-hover:block"
                      style={{ bottom: `${(d.avgMs / niceMax) * 100}%` }}
                      aria-hidden
                    />
                  ) : null}
                  <div
                    className={cn("pointer-events-none absolute top-0 z-10 hidden w-max max-w-56 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg group-hover:block", align)}
                    aria-hidden
                  >
                    <p className="font-medium">{d.tip.title}</p>
                    {d.tip.lines.map((line) => (
                      <p key={line} className="mt-0.5 text-muted">
                        {line}
                      </p>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <div className="mt-2 flex justify-between ps-14 text-[11px] text-muted" aria-hidden>
        <span>{axis.start}</span>
        <span>{axis.middle}</span>
        <span>{axis.end}</span>
      </div>
    </figure>
  );
}

const BAND_CLASS: Record<ReturnType<typeof uptimeBand>, string> = {
  none: "bg-line",
  good: "bg-emerald-500",
  ok: "bg-lime-500",
  warn: "bg-amber-500",
  bad: "bg-red-500",
};

export interface UptimeBarDay {
  day: string;
  uptime: number | null;
  tip: { title: string; lines: string[] };
}

/** One bar per day coloured by uptime, with a tooltip. */
export function UptimeBars({ days, label, startLabel, endLabel, className }: { days: UptimeBarDay[]; label: string; startLabel: string; endLabel: string; className?: string }) {
  const edge = Math.max(3, Math.round(days.length * 0.12));
  return (
    <figure aria-label={label} className={className}>
      <ul className={cn("flex h-10 items-stretch", days.length > 60 ? "gap-px sm:gap-[2px]" : "gap-[3px]")}>
        {days.map((d, i) => {
          const align = i < edge ? "start-0" : i >= days.length - edge ? "end-0" : "left-1/2 -translate-x-1/2";
          return (
            <li key={d.day} className="group relative flex-1">
              <span className="sr-only">
                {d.tip.title}: {d.tip.lines.join(", ")}
              </span>
              <div className={cn("h-full rounded-[3px] transition-opacity group-hover:opacity-70", BAND_CLASS[uptimeBand(d.uptime)])} aria-hidden />
              <div
                className={cn("pointer-events-none absolute bottom-full z-10 mb-2 hidden w-max max-w-60 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg group-hover:block", align)}
                aria-hidden
              >
                <p className="font-medium">{d.tip.title}</p>
                {d.tip.lines.map((line) => (
                  <p key={line} className="mt-0.5 text-muted">
                    {line}
                  </p>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex justify-between text-[11px] text-muted" aria-hidden>
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
    </figure>
  );
}

/** Colour legend for UptimeBars. */
export function UptimeLegend({ labels }: { labels: { good: string; ok: string; warn: string; bad: string; none: string } }) {
  const items: Array<[keyof typeof labels, string]> = [
    ["good", BAND_CLASS.good],
    ["ok", BAND_CLASS.ok],
    ["warn", BAND_CLASS.warn],
    ["bad", BAND_CLASS.bad],
    ["none", BAND_CLASS.none],
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map(([key, cls]) => (
        <li key={key} className="inline-flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-sm", cls)} aria-hidden />
          {labels[key]}
        </li>
      ))}
    </ul>
  );
}
