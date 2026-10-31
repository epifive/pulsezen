/** Translator shape accepted by these helpers (server getT() and client useT() both fit). */
type T = (key: "pricing.unlimited" | "time.days" | "time.months" | "time.years" | "time.year", vars?: { n: number }) => string;

/** 0 → "Unlimited", 30 → "30 days", 365 → "1 year", 730 → "2 years", 90 → "3 months". */
export function formatRetention(days: number, t: T): string {
  if (!days) return t("pricing.unlimited");
  if (days === 365) return t("time.year");
  if (days % 365 === 0) return t("time.years", { n: days / 365 });
  if (days % 30 === 0 && days >= 60) return t("time.months", { n: days / 30 });
  return t("time.days", { n: days });
}

/** 0 → "Unlimited", otherwise a grouped number. */
export function formatLimit(value: number, t: T, locale?: string): string {
  return value ? value.toLocaleString(locale) : t("pricing.unlimited");
}
