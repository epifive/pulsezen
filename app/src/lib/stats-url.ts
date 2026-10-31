/**
 * Query-string state of a stats view: period, custom dates, filters and comparison.
 * Dependency-free so server pages, client components and the Stats API share it.
 */

import { isPeriod, parseFilters, serializeFilter } from "@/analytics/normalize";
import type { Filter, Period } from "@/analytics/types";

export interface StatsParams {
  period: Period;
  from: string | null;
  to: string | null;
  filters: Filter[];
  compare: boolean;
}

type Raw = URLSearchParams | Record<string, string | string[] | undefined>;

function all(raw: Raw, key: string): string[] {
  if (raw instanceof URLSearchParams) return raw.getAll(key);
  const v = raw[key];
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

const first = (raw: Raw, key: string) => all(raw, key)[0] ?? null;

export function parseStatsParams(raw: Raw, defaultPeriod: Period = "30d"): StatsParams {
  const p = first(raw, "period");
  const period: Period = isPeriod(p) && p !== "realtime" ? p : defaultPeriod;
  // The API also accepts filters=a:is:b;c:is:d.
  const filterValues = [...all(raw, "f"), ...all(raw, "filters").flatMap((v) => v.split(";"))];
  return {
    period,
    from: first(raw, "from"),
    to: first(raw, "to"),
    filters: parseFilters(filterValues),
    compare: first(raw, "compare") === "1",
  };
}

const sameFilter = (a: Filter, b: Filter) => a.dimension === b.dimension && a.op === b.op && a.value === b.value;

/** URLSearchParams for a view; `overrides` replace parts of it. */
export function statsSearch(params: StatsParams, overrides: Partial<StatsParams> = {}): URLSearchParams {
  const s = { ...params, ...overrides };
  const out = new URLSearchParams();
  if (s.period !== "30d") out.set("period", s.period);
  if (s.period === "custom") {
    if (s.from) out.set("from", s.from);
    if (s.to) out.set("to", s.to);
  }
  for (const f of s.filters) out.append("f", serializeFilter(f));
  if (s.compare) out.set("compare", "1");
  return out;
}

/** `base` + query string (no "?" when empty). */
export function withSearch(base: string, search: URLSearchParams, extra?: Record<string, string>): string {
  const s = new URLSearchParams(search);
  for (const [k, v] of Object.entries(extra ?? {})) s.set(k, v);
  const text = s.toString();
  return text ? `${base}?${text}` : base;
}

/** Adds a filter, replacing an existing "is" filter on the same dimension. */
export function addFilter(params: StatsParams, filter: Filter): StatsParams {
  const rest = params.filters.filter((f) => !(f.dimension === filter.dimension && (f.op === "is" || filter.op === "is")) && !sameFilter(f, filter));
  return { ...params, filters: [...rest, filter].slice(0, 10) };
}

export function removeFilter(params: StatsParams, filter: Filter): StatsParams {
  return { ...params, filters: params.filters.filter((f) => !sameFilter(f, filter)) };
}
