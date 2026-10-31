/**
 * Calendar helpers for the stats engine: local days in a site's time zone, UTC bounds,
 * bucket boundaries and the dashboard periods. Dependency-free (server and client).
 *
 * Days are plain "YYYY-MM-DD" strings; arithmetic on them is done in UTC so it never
 * depends on the server's own time zone.
 */

import type { Granularity, Period } from "@/analytics/types";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDay(v: unknown): v is string {
  if (typeof v !== "string" || !DAY_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      f = partsFormatter("UTC");
    }
    formatters.set(tz, f);
  }
  return f;
}

function zonedParts(date: Date, tz: string) {
  const p: Record<string, number> = {};
  for (const part of partsFormatter(tz).formatToParts(date)) if (part.type !== "literal") p[part.type] = Number(part.value);
  return { year: p.year, month: p.month, day: p.day, hour: p.hour === 24 ? 0 : p.hour, minute: p.minute, second: p.second };
}

/** Offset of `tz` from UTC at `date`, in milliseconds (e.g. +7_200_000 for UTC+2). */
export function tzOffsetMs(date: Date, tz: string): number {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - (date.getTime() - date.getUTCMilliseconds());
}

/** The UTC instant of local `day` at `hour`:00 in `tz` (DST-aware). */
export function zonedToUtc(day: string, hour: number, tz: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour);
  const first = tzOffsetMs(new Date(guess), tz);
  let t = guess - first;
  const second = tzOffsetMs(new Date(t), tz);
  if (second !== first) t = guess - second;
  return new Date(t);
}

/** Local calendar day of an instant in `tz`. */
export function localDay(date: Date, tz: string): string {
  const p = zonedParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** First day of the month `n` months after the month of `day`. */
export function addMonths(day: string, n: number): string {
  const d = new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** ISO bounds [from 00:00 local, day after `to` 00:00 local) for the `ts` column. */
export function utcBounds(from: string, to: string, tz: string): { fromIso: string; toIso: string } {
  return { fromIso: zonedToUtc(from, 0, tz).toISOString(), toIso: zonedToUtc(addDays(to, 1), 0, tz).toISOString() };
}

export interface Bucket {
  /** "YYYY-MM-DD HH:00", "YYYY-MM-DD" or "YYYY-MM". */
  label: string;
  /** Local day the bucket starts on. */
  day: string;
  startIso: string;
}

/** Buckets covering [from, to] (local days) at `granularity`, plus the final end bound. */
export function buckets(from: string, to: string, granularity: Granularity, tz: string): { list: Bucket[]; endIso: string } {
  const list: Bucket[] = [];
  const endIso = zonedToUtc(addDays(to, 1), 0, tz).toISOString();
  if (granularity === "hour") {
    for (let day = from; day <= to; day = addDays(day, 1)) {
      for (let h = 0; h < 24; h++) {
        list.push({ label: `${day} ${String(h).padStart(2, "0")}:00`, day, startIso: zonedToUtc(day, h, tz).toISOString() });
      }
    }
  } else if (granularity === "day") {
    for (let day = from; day <= to; day = addDays(day, 1)) list.push({ label: day, day, startIso: zonedToUtc(day, 0, tz).toISOString() });
  } else {
    for (let day = from; day <= to; day = addMonths(day, 1)) list.push({ label: day.slice(0, 7), day, startIso: zonedToUtc(day, 0, tz).toISOString() });
  }
  // A skipped DST hour must not make the bounds go backwards (the SQL CASE relies on their order).
  for (let i = 1; i < list.length; i++) if (list[i].startIso < list[i - 1].startIso) list[i].startIso = list[i - 1].startIso;
  return { list, endIso };
}

/** The bucket label a local day falls into. */
export function bucketLabelOfDay(day: string, granularity: Granularity): string {
  return granularity === "month" ? day.slice(0, 7) : day;
}

export interface ResolvedPeriod {
  period: Period;
  /** Inclusive local dates. */
  from: string;
  to: string;
  granularity: Granularity;
  /** Human-readable range, e.g. "Oct 11 – Oct 17, 2026". */
  label: string;
}

const MAX_CUSTOM_DAYS = 3660;

function autoGranularity(from: string, to: string): Granularity {
  const span = daysBetween(from, to) + 1;
  if (span <= 1) return "hour";
  if (span <= 92) return "day";
  return "month";
}

/** "Oct 11 – Oct 17, 2026" in `locale` (dates are formatted as calendar days, no time zone shift). */
export function formatRange(from: string, to: string, locale = "en"): string {
  const fmt = (day: string, opts: Intl.DateTimeFormatOptions) => {
    const d = new Date(`${day}T12:00:00Z`);
    try {
      return d.toLocaleDateString(locale, { ...opts, timeZone: "UTC" });
    } catch {
      return d.toLocaleDateString("en", { ...opts, timeZone: "UTC" });
    }
  };
  if (from === to) return fmt(from, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${fmt(from, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" })} – ${fmt(to, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

/**
 * Turns a dashboard period into inclusive local dates and a chart granularity.
 * today/yesterday → hourly; 7d/30d/month/last_month → daily; 12m/all → monthly
 * (daily when "all" spans three months or less); custom → automatic (one day hourly, up to 92 days daily, longer monthly).
 * `since` is the first local day with data (used by "all"); `now` is for tests.
 */
export function resolvePeriod(
  period: Period,
  options: { from?: string | null; to?: string | null; timezone: string; since?: string | null; locale?: string; now?: Date },
): ResolvedPeriod {
  const tz = options.timezone || "UTC";
  const today = localDay(options.now ?? new Date(), tz);
  let from = today;
  let to = today;
  let granularity: Granularity = "day";
  let p: Period = period;

  switch (period) {
    case "realtime":
    case "today":
      granularity = "hour";
      break;
    case "yesterday":
      from = to = addDays(today, -1);
      granularity = "hour";
      break;
    case "7d":
      from = addDays(today, -6);
      break;
    case "30d":
      from = addDays(today, -29);
      break;
    case "month":
      from = `${today.slice(0, 7)}-01`;
      break;
    case "last_month":
      from = addMonths(today, -1);
      to = addDays(`${today.slice(0, 7)}-01`, -1);
      break;
    case "12m":
      from = addMonths(today, -11);
      granularity = "month";
      break;
    case "all": {
      const since = isDay(options.since) && options.since < today ? options.since : addDays(today, -29);
      from = since;
      granularity = autoGranularity(from, to);
      break;
    }
    case "custom": {
      let a = isDay(options.from) ? options.from : null;
      let b = isDay(options.to) ? options.to : null;
      if (!a || !b) {
        p = "30d";
        from = addDays(today, -29);
        break;
      }
      if (a > b) [a, b] = [b, a];
      if (daysBetween(a, b) >= MAX_CUSTOM_DAYS) a = addDays(b, -(MAX_CUSTOM_DAYS - 1));
      from = a;
      to = b;
      granularity = autoGranularity(from, to);
      break;
    }
  }
  return { period: p, from, to, granularity, label: formatRange(from, to, options.locale) };
}

/** The same-length range just before [from, to]. */
export function previousRange(from: string, to: string): { from: string; to: string } {
  const len = daysBetween(from, to) + 1;
  return { from: addDays(from, -len), to: addDays(from, -1) };
}

/** IANA time zones for pickers ("UTC" first). */
export function timezoneList(): string[] {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    zones = [];
  }
  return ["UTC", ...zones.filter((z) => z !== "UTC")];
}
