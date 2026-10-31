/**
 * Labels and number formatting for stats views (owner dashboard, shared dashboards,
 * details pages, CSV). Dependency-free: works in server and client components.
 */

import type { Dimension } from "@/analytics/types";
import type { MessageKey, Translator } from "@/lib/i18n/messages";

export const DIMENSION_LABEL: Record<Dimension, MessageKey> = {
  page: "dash.dim.page",
  entry_page: "dash.dim.entry_page",
  exit_page: "dash.dim.exit_page",
  hostname: "dash.dim.hostname",
  channel: "dash.dim.channel",
  source: "dash.dim.source",
  referrer: "dash.dim.referrer",
  utm_source: "dash.dim.utm_source",
  utm_medium: "dash.dim.utm_medium",
  utm_campaign: "dash.dim.utm_campaign",
  utm_term: "dash.dim.utm_term",
  utm_content: "dash.dim.utm_content",
  country: "dash.dim.country",
  region: "dash.dim.region",
  city: "dash.dim.city",
  browser: "dash.dim.browser",
  os: "dash.dim.os",
  device: "dash.dim.device",
  screen: "dash.dim.screen",
  lang: "dash.dim.lang",
  event: "dash.dim.event",
  goal: "dash.dim.goal",
};

const CHANNEL_LABEL: Record<string, MessageKey> = {
  direct: "dash.channel.direct",
  search: "dash.channel.search",
  social: "dash.channel.social",
  ai: "dash.channel.ai",
  email: "dash.channel.email",
  paid: "dash.channel.paid",
  referral: "dash.channel.referral",
};

const DEVICE_LABEL: Record<string, MessageKey> = {
  desktop: "dash.device.desktop",
  mobile: "dash.device.mobile",
  tablet: "dash.device.tablet",
};

const regionNames = new Map<string, Intl.DisplayNames | null>();
const languageNames = new Map<string, Intl.DisplayNames | null>();

function displayNames(cache: Map<string, Intl.DisplayNames | null>, locale: string, type: "region" | "language"): Intl.DisplayNames | null {
  if (!cache.has(locale)) {
    try {
      cache.set(locale, new Intl.DisplayNames([locale, "en"], { type }));
    } catch {
      cache.set(locale, null);
    }
  }
  return cache.get(locale) ?? null;
}

/** "DE" → "Germany" in the interface language. */
export function countryName(code: string, locale: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return code;
  try {
    return displayNames(regionNames, locale, "region")?.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Readable text for a breakdown value (channels, devices, countries and languages are translated). */
export function valueLabel(dimension: Dimension, value: string, t: Translator, locale: string): string {
  if (dimension === "channel") return CHANNEL_LABEL[value] ? t(CHANNEL_LABEL[value]) : value;
  if (dimension === "device") return DEVICE_LABEL[value] ? t(DEVICE_LABEL[value]) : value;
  if (dimension === "country") return countryName(value, locale);
  if (dimension === "lang" && /^[a-z]{2,3}$/.test(value)) {
    try {
      return displayNames(languageNames, locale, "language")?.of(value) ?? value;
    } catch {
      return value;
    }
  }
  if (dimension === "screen" && value) return `${value} px`;
  return value || t("dash.value.none");
}

/** True when values are URLs/paths that should stay left-to-right. */
export function isLtrDimension(dimension: Dimension): boolean {
  return ["page", "entry_page", "exit_page", "hostname", "referrer", "screen"].includes(dimension);
}

export function formatCount(n: number, locale: string, compact = false): string {
  try {
    return n.toLocaleString(locale, compact && n >= 10_000 ? { notation: "compact", maximumFractionDigits: 1 } : undefined);
  } catch {
    return n.toLocaleString("en");
  }
}

/** 135 → "2m 15s", 3720 → "1h 2m", 42 → "42s". */
export function formatDuration(seconds: number, t: Translator): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return t("dash.unit.s", { s });
  if (s < 3600) return t("dash.unit.ms", { m: Math.floor(s / 60), s: s % 60 });
  return t("dash.unit.hm", { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60) });
}

export function formatPct(value: number, locale: string, digits = 0): string {
  try {
    return `${value.toLocaleString(locale, { maximumFractionDigits: digits })}%`;
  } catch {
    return `${value}%`;
  }
}

export function formatMoneyCents(cents: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** Chart / table label of a timeseries bucket ("2026-10-17 14:00", "2026-10-17", "2026-10"). */
export function bucketLabel(date: string, locale: string, mode: "short" | "long" = "short"): string {
  const opts = (o: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions => ({ ...o, timeZone: "UTC" });
  let d: Date;
  let options: Intl.DateTimeFormatOptions;
  if (/^\d{4}-\d{2}$/.test(date)) {
    d = new Date(`${date}-01T00:00:00Z`);
    options = opts(mode === "long" ? { month: "long", year: "numeric" } : { month: "short", year: "2-digit" });
  } else if (date.length > 10) {
    d = new Date(`${date.slice(0, 10)}T${date.slice(11, 16)}:00Z`);
    options = opts(mode === "long" ? { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } : { hour: "numeric" });
  } else {
    d = new Date(`${date}T00:00:00Z`);
    options = opts(mode === "long" ? { weekday: "short", month: "short", day: "numeric", year: "numeric" } : { month: "short", day: "numeric" });
  }
  try {
    return d.toLocaleString(locale, options);
  } catch {
    return d.toLocaleString("en", options);
  }
}
