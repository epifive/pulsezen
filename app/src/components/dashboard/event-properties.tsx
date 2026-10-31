"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { withSearch } from "@/lib/stats-url";
import { cn } from "@/lib/utils";
import { formatCount, formatMoneyCents } from "./stats-format";

interface PropRow {
  value: string;
  visitors: number;
  events?: number;
  revenueCents?: number;
}

interface PropResult {
  rows: PropRow[];
  approximate: boolean;
  truncated: boolean;
}

const ROWS = 9;
const SCAN_CAP = 100_000;

/**
 * Drill-down of one custom event in the "Goals and events" card: the property names sent
 * with it (e.g. `url` of Outbound Link / File Download) and the values of the selected one,
 * with visitors and completions. Loaded from `dataUrl?event=…[&prop=…]` (src/lib/stats-routes.ts).
 */
export function EventProperties({
  event,
  dataUrl,
  search,
  locale,
  currency,
  onBack,
}: {
  event: string;
  dataUrl: string;
  /** Query string of the view (period and filters). */
  search: string;
  locale: string;
  currency: string;
  onBack: () => void;
}) {
  const t = useT();
  const [results, setResults] = useState<Record<string, PropResult | "failed">>({});
  const [selected, setSelected] = useState<string | null>(null);

  const keysResult = results[""];
  const keys = keysResult && keysResult !== "failed" ? keysResult.rows : null;
  const prop = selected ?? keys?.[0]?.value ?? null;
  const valuesResult = prop ? results[`p:${prop}`] : undefined;

  // Property names first, then the values of the selected property.
  const want = !keysResult ? "" : prop && !valuesResult ? `p:${prop}` : null;
  useEffect(() => {
    if (want === null) return;
    let cancelled = false;
    const extra: Record<string, string> = { event, limit: String(want ? ROWS : 20) };
    if (want) extra.prop = want.slice(2);
    fetch(withSearch(dataUrl, new URLSearchParams(search), extra), { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<PropResult>) : Promise.reject(new Error(String(res.status)))))
      .then((body) => {
        if (!cancelled) setResults((r) => ({ ...r, [want]: body }));
      })
      .catch(() => {
        if (!cancelled) setResults((r) => ({ ...r, [want]: "failed" }));
      });
    return () => {
      cancelled = true;
    };
  }, [want, event, dataUrl, search]);

  const values = valuesResult && valuesResult !== "failed" ? valuesResult.rows : null;
  const failed = keysResult === "failed" || valuesResult === "failed";
  const approximate = Boolean((keysResult && keysResult !== "failed" && keysResult.approximate) || (valuesResult && valuesResult !== "failed" && valuesResult.approximate));
  const truncated = Boolean(keysResult && keysResult !== "failed" && keysResult.truncated);
  const showRevenue = (values ?? []).some((r) => (r.revenueCents ?? 0) > 0);
  const max = Math.max(1, ...(values ?? []).map((r) => r.visitors));

  return (
    <div className="flex flex-1 flex-col" data-testid="event-properties">
      <div className="flex min-w-0 items-center gap-2 px-2 pt-1 pb-1.5">
        <button type="button" onClick={onBack} className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted hover:bg-paper hover:text-primary">
          <ArrowLeft className="size-3.5 rtl:rotate-180" aria-hidden />
          {t("dash.props.back")}
        </button>
        <bdi className="truncate text-sm font-semibold">{event}</bdi>
      </div>
      {keys && keys.length > 0 ? (
        <div className="flex flex-wrap gap-1 px-2 pb-1" role="group" aria-label={t("dash.props.property")}>
          {keys.map((k) => (
            <button
              key={k.value}
              type="button"
              aria-pressed={k.value === prop}
              onClick={() => setSelected(k.value)}
              className={cn("rounded-full px-2.5 py-0.5 font-mono text-xs transition-colors", k.value === prop ? "bg-primary-soft text-primary" : "text-muted hover:bg-paper hover:text-ink")}
            >
              <bdi dir="ltr">{k.value}</bdi>
            </button>
          ))}
        </div>
      ) : null}
      {failed ? (
        <p className="px-2 py-10 text-center text-sm text-muted">{t("dash.card.error")}</p>
      ) : !keys || (prop && !values) ? (
        <ul className="space-y-1.5 px-2 py-1" aria-busy="true" aria-label={t("dash.card.loading")}>
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="h-7 animate-pulse rounded-md bg-paper" style={{ width: `${90 - i * 16}%` }} />
          ))}
        </ul>
      ) : !prop || !values || values.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted">{t("dash.props.none")}</p>
      ) : (
        <>
          <div className="flex items-center justify-between px-2 py-1.5 text-[11px] font-medium tracking-wide text-muted uppercase">
            <bdi dir="ltr" className="font-mono normal-case">
              {prop}
            </bdi>
            <span className="flex gap-4">
              <span className="w-14 text-end max-sm:hidden">{t("dash.metric.total")}</span>
              {showRevenue ? <span className="w-16 text-end max-sm:hidden">{t("dash.metric.revenue")}</span> : null}
              <span className="w-20 text-end">{t("dash.metric.uniques")}</span>
            </span>
          </div>
          <ul className="space-y-0.5">
            {values.map((r) => (
              <li key={r.value} className="relative">
                <div className="absolute inset-y-0 start-0 rounded-md bg-primary/10" style={{ width: `${(r.visitors / max) * 100}%` }} aria-hidden />
                <div className="relative flex min-h-8 items-center gap-3 px-2 text-sm">
                  <bdi dir="auto" className="min-w-0 flex-1 truncate py-1" title={r.value}>
                    {r.value}
                  </bdi>
                  <span className="flex shrink-0 gap-4 tabular-nums">
                    <span className="w-14 text-end text-muted max-sm:hidden">{formatCount(r.events ?? 0, locale, true)}</span>
                    {showRevenue ? <span className="w-16 text-end text-muted max-sm:hidden">{r.revenueCents ? formatMoneyCents(r.revenueCents, currency, locale) : "—"}</span> : null}
                    <span className="w-20 text-end font-medium">{formatCount(r.visitors, locale, true)}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {approximate || truncated ? (
        <p className="mt-auto px-2 pt-2 text-xs text-muted">
          {[approximate ? t("dash.props.partial") : "", truncated ? t("dash.props.truncated", { count: formatCount(SCAN_CAP, locale) }) : ""].filter(Boolean).join(" ")}
        </p>
      ) : null}
    </div>
  );
}
