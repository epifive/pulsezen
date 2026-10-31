/**
 * Formatting helpers for the customer dashboard. Dependency-free so they work
 * in Server Components and client components alike.
 */

export function formatNumber(n: number, locale: string, options?: Intl.NumberFormatOptions): string {
  try {
    return n.toLocaleString(locale, options);
  } catch {
    return n.toLocaleString("en", options);
  }
}

export function formatDateTime(iso: string | null | undefined, locale: string, withTime = true): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const options: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) };
  try {
    return d.toLocaleString(locale, options);
  } catch {
    return d.toLocaleString("en", options);
  }
}

/** Short time of day ("14:05") for chart axes. */
export function formatTime(iso: string, locale: string, withDay = false): string {
  const d = new Date(iso);
  const options: Intl.DateTimeFormatOptions = withDay ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" } : { hour: "2-digit", minute: "2-digit" };
  try {
    return d.toLocaleString(locale, options);
  } catch {
    return d.toLocaleString("en", options);
  }
}

/** "Mon, Oct 12" for a YYYY-MM-DD day (UTC). */
export function formatDay(day: string, locale: string, long = false): string {
  const d = new Date(`${day}T00:00:00Z`);
  const options: Intl.DateTimeFormatOptions = long
    ? { weekday: "short", year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }
    : { month: "short", day: "numeric", timeZone: "UTC" };
  try {
    return d.toLocaleDateString(locale, options);
  } catch {
    return d.toLocaleDateString("en", options);
  }
}

/** "3 minutes ago" / "in 2 days" in the visitor's language. */
export function formatRelative(iso: string | null | undefined, locale: string, nowMs = Date.now()): string {
  if (!iso) return "—";
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "—";
  const seconds = Math.round((at - nowMs) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
    ["second", 1],
  ];
  let rtf: Intl.RelativeTimeFormat;
  try {
    rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  } catch {
    rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  }
  if (Math.abs(seconds) < 45) return rtf.format(0, "second");
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, "second");
}

/** 99.954 → "99.95%", null → "—". */
export function formatPercent(value: number | null | undefined, locale: string, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  // Never round a small outage up to a perfect 100%.
  const factor = 10 ** digits;
  const floored = value < 100 ? Math.floor(value * factor) / factor : 100;
  return `${formatNumber(floored, locale, { maximumFractionDigits: digits, minimumFractionDigits: floored === 100 ? 0 : Math.min(digits, 2) })}%`;
}

// Left-to-right isolate: keeps "253 ms" in that order inside right-to-left text (it would show as "ms 253").
const LRI = String.fromCharCode(0x2066);
const PDI = String.fromCharCode(0x2069);

/** 1234 → "1,234 ms"; null → "—". The value is wrapped in a left-to-right isolate for RTL languages. */
export function formatMs(ms: number | null | undefined, locale: string): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms >= 10_000) return `${LRI}${formatNumber(Math.round(ms / 100) / 10, locale)} s${PDI}`;
  return `${LRI}${formatNumber(Math.round(ms), locale)} ms${PDI}`;
}

/** Positive integer from a query-string value (page numbers). */
export function intParam(value: string | string[] | undefined, fallback: number, max = 100_000): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : fallback;
}

/** Whole days from now until `iso` (negative once passed); null without a date. */
export function daysUntil(iso: string | null | undefined, nowMs = Date.now()): number | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return Math.floor((at - nowMs) / 86_400_000);
}

/** Colour band for an uptime percentage, used by bars and numbers. */
export function uptimeBand(value: number | null | undefined): "none" | "good" | "ok" | "warn" | "bad" {
  if (value === null || value === undefined) return "none";
  if (value >= 99.9) return "good";
  if (value >= 99) return "ok";
  if (value >= 95) return "warn";
  return "bad";
}

/** Where a maintenance window stands right now. */
export function maintenancePhase(
  m: { status: string; scheduled_start: string | null; scheduled_end: string | null },
  nowMs = Date.now(),
): "upcoming" | "in_progress" | "completed" {
  if (m.status === "completed") return "completed";
  const start = m.scheduled_start ? Date.parse(m.scheduled_start) : NaN;
  const end = m.scheduled_end ? Date.parse(m.scheduled_end) : NaN;
  if (Number.isFinite(end) && nowMs > end) return "completed";
  if (Number.isFinite(start) && nowMs < start) return "upcoming";
  return "in_progress";
}
