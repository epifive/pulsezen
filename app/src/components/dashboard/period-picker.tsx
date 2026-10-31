"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronDown, GitCompareArrows } from "lucide-react";
import type { Period } from "@/analytics/types";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/messages";
import { statsSearch, withSearch, type StatsParams } from "@/lib/stats-url";
import { cn } from "@/lib/utils";

const OPTIONS: Array<{ period: Exclude<Period, "realtime" | "custom">; label: MessageKey; divider?: boolean }> = [
  { period: "today", label: "dash.period.today" },
  { period: "yesterday", label: "dash.period.yesterday" },
  { period: "7d", label: "dash.period.7d", divider: true },
  { period: "30d", label: "dash.period.30d" },
  { period: "month", label: "dash.period.month", divider: true },
  { period: "last_month", label: "dash.period.last_month" },
  { period: "12m", label: "dash.period.12m", divider: true },
  { period: "all", label: "dash.period.all" },
];

export function periodName(period: Period): MessageKey {
  return OPTIONS.find((o) => o.period === period)?.label ?? "dash.period.custom";
}

/** Period dropdown (with a custom date range) and the "compare" switch. */
export function PeriodPicker({
  basePath,
  params,
  rangeLabel,
  from,
  to,
  today,
}: {
  basePath: string;
  params: StatsParams;
  /** e.g. "Oct 11 – Oct 17, 2026". */
  rangeLabel: string;
  from: string;
  to: string;
  today: string;
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [range, setRange] = useState({ from, to });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const href = (overrides: Partial<StatsParams>) => withSearch(basePath, statsSearch(params, overrides));
  const title = params.period === "custom" ? rangeLabel : t(periodName(params.period));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div ref={ref} className="relative">
        <Button
          variant="outline"
          onClick={() => {
            setOpen((v) => !v);
            setCustom(false);
          }}
          aria-expanded={open}
          aria-haspopup="true"
          className="min-w-44 justify-between"
        >
          <CalendarDays aria-hidden />
          <span className="flex-1 truncate text-start">{title}</span>
          <ChevronDown className="text-muted" aria-hidden />
        </Button>
        {open ? (
          <div className="absolute end-0 top-full z-40 mt-1 w-64 rounded-xl border border-line bg-surface p-1 shadow-xl">
            {custom ? (
              <form
                className="space-y-3 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!range.from || !range.to) return;
                  setOpen(false);
                  router.push(href({ period: "custom", from: range.from, to: range.to }), { scroll: false });
                }}
              >
                <p className="text-sm font-semibold">{t("dash.period.customTitle")}</p>
                <label className="block text-xs text-muted">
                  {t("dash.period.from")}
                  <input
                    type="date"
                    required
                    max={today}
                    value={range.from}
                    onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                    className="mt-1 block h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm text-ink"
                  />
                </label>
                <label className="block text-xs text-muted">
                  {t("dash.period.to")}
                  <input
                    type="date"
                    required
                    max={today}
                    value={range.to}
                    onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                    className="mt-1 block h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm text-ink"
                  />
                </label>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" className="flex-1">
                    {t("dash.period.apply")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setCustom(false)}>
                    {t("dash.period.back")}
                  </Button>
                </div>
              </form>
            ) : (
              <ul>
                {OPTIONS.map((o) => (
                  <li key={o.period} className={cn(o.divider && "mt-1 border-t border-line pt-1")}>
                    <Link
                      href={href({ period: o.period, from: null, to: null })}
                      scroll={false}
                      onClick={() => setOpen(false)}
                      aria-current={params.period === o.period ? "true" : undefined}
                      className={cn(
                        "block rounded-lg px-3 py-2 text-sm hover:bg-paper",
                        params.period === o.period ? "font-semibold text-primary" : "text-ink",
                      )}
                    >
                      {t(o.label)}
                    </Link>
                  </li>
                ))}
                <li className="mt-1 border-t border-line pt-1">
                  <button
                    type="button"
                    onClick={() => setCustom(true)}
                    className={cn("block w-full rounded-lg px-3 py-2 text-start text-sm hover:bg-paper", params.period === "custom" && "font-semibold text-primary")}
                  >
                    {t("dash.period.custom")}
                  </button>
                </li>
              </ul>
            )}
          </div>
        ) : null}
      </div>
      <Link
        href={href({ compare: !params.compare })}
        scroll={false}
        role="button"
        aria-pressed={params.compare}
        title={t("dash.compare.hint")}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors [&_svg]:size-4",
          params.compare ? "border-primary-line bg-primary-soft text-primary" : "border-line bg-surface text-muted hover:text-ink",
        )}
      >
        <GitCompareArrows aria-hidden />
        <span className="max-sm:sr-only">{t("dash.compare.label")}</span>
      </Link>
    </div>
  );
}
