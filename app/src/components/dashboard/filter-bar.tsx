"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListFilter, X } from "lucide-react";
import { DIMENSIONS, type Dimension, type Filter, type FilterOp } from "@/analytics/types";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/messages";
import { addFilter, removeFilter, statsSearch, withSearch, type StatsParams } from "@/lib/stats-url";
import { DIMENSION_LABEL, isLtrDimension, valueLabel } from "./stats-format";

const OP_LABEL: Record<FilterOp, MessageKey> = { is: "dash.filter.is", is_not: "dash.filter.isNot", contains: "dash.filter.contains" };

/** Active filters as removable chips, plus an "Add filter" popover. */
export function FilterBar({ basePath, params, locale, keep }: { basePath: string; params: StatsParams; locale: string; /** Extra query values to keep (e.g. the details tab). */ keep?: Record<string, string> }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dimension, setDimension] = useState<Dimension>("page");
  const [op, setOp] = useState<FilterOp>("is");
  const [value, setValue] = useState("");
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

  const chipText = (f: Filter) => `${t(DIMENSION_LABEL[f.dimension])} ${t(OP_LABEL[f.op])} `;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {params.filters.map((f) => (
        <span
          key={`${f.dimension}:${f.op}:${f.value}`}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary-line bg-primary-soft py-1 ps-3 pe-1 text-sm"
        >
          <span className="truncate">
            <span className="text-muted">{chipText(f)}</span>
            <bdi dir={isLtrDimension(f.dimension) ? "ltr" : "auto"} className="font-medium">
              {f.op === "contains" ? f.value : valueLabel(f.dimension, f.value, t, locale)}
            </bdi>
          </span>
          <Link
            href={withSearch(basePath, statsSearch(removeFilter(params, f)), keep)}
            scroll={false}
            aria-label={t("dash.filter.remove", { name: `${chipText(f)}${f.value}` })}
            className="grid size-6 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink"
          >
            <X className="size-3.5" aria-hidden />
          </Link>
        </span>
      ))}
      <div ref={ref} className="relative">
        <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="true">
          <ListFilter aria-hidden />
          {t("dash.filter.add")}
        </Button>
        {open ? (
          <form
            className="absolute start-0 top-full z-40 mt-1 w-72 space-y-3 rounded-xl border border-line bg-surface p-4 shadow-xl"
            onSubmit={(e) => {
              e.preventDefault();
              const v = value.trim();
              if (!v) return;
              setOpen(false);
              setValue("");
              router.push(withSearch(basePath, statsSearch(addFilter(params, { dimension, op, value: v })), keep), { scroll: false });
            }}
          >
            <p className="text-sm font-semibold">{t("dash.filter.title")}</p>
            <label className="block text-xs text-muted">
              {t("dash.filter.dimension")}
              <select
                value={dimension}
                onChange={(e) => setDimension(e.target.value as Dimension)}
                className="mt-1 block h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm text-ink"
              >
                {DIMENSIONS.map((d) => (
                  <option key={d} value={d}>
                    {t(DIMENSION_LABEL[d])}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-muted">
              {t("dash.filter.operator")}
              <select value={op} onChange={(e) => setOp(e.target.value as FilterOp)} className="mt-1 block h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm text-ink">
                {(Object.keys(OP_LABEL) as FilterOp[]).map((o) => (
                  <option key={o} value={o}>
                    {t(OP_LABEL[o])}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-muted">
              {t("dash.filter.value")}
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
                maxLength={300}
                placeholder={dimension === "country" ? "DE" : dimension.includes("page") ? "/pricing" : ""}
                className="mt-1 block h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm text-ink"
              />
            </label>
            {dimension === "country" ? <p className="text-xs text-muted">{t("dash.filter.countryHint")}</p> : null}
            <Button type="submit" size="sm" className="w-full">
              {t("dash.filter.apply")}
            </Button>
          </form>
        ) : null}
      </div>
      {params.filters.length > 1 ? (
        <Link href={withSearch(basePath, statsSearch({ ...params, filters: [] }), keep)} scroll={false} className="text-sm text-muted underline-offset-2 hover:text-ink hover:underline">
          {t("dash.filter.clear")}
        </Link>
      ) : null}
    </div>
  );
}
