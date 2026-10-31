import "server-only";
import { getDb } from "./db";

/**
 * Every configurable option with its default value. Values are stored as
 * strings in the `settings` table; the type of the default decides how the
 * stored value is parsed.
 */
export const SETTING_DEFAULTS = {
  // General
  site_name: "Pulsezen",
  site_tagline: "Simple, privacy-friendly website analytics",
  site_url: "",
  site_email: "support@example.com",
  logo: "",
  logo_dark: "",
  favicon: "",
  footer_text: "Privacy-friendly website analytics without cookies.",
  copyright_text: "© {year} {site_name}. All rights reserved.",

  // Appearance
  primary_color: "#c2410c",
  default_theme: "system",
  home_hero_title: "Website analytics without the creepy part",
  home_hero_subtitle:
    "Simple, cookieless analytics for every website you run: visitors, pages, sources, AI traffic, goals and revenue. Email reports and traffic alerts included.",
  show_stats_on_home: true,

  // SEO
  meta_title: "Pulsezen — Privacy-friendly Website Analytics",
  meta_description:
    "Lightweight, cookieless website analytics: visitors, pages, referrers, AI traffic, goals, email reports and traffic alerts in one simple dashboard.",
  meta_keywords: "website analytics, privacy analytics, google analytics alternative, web analytics, cookieless analytics",
  og_image: "",
  google_site_verification: "",
  bing_site_verification: "",
  robots_extra: "",
  title_separator: " | ",

  // Analytics
  branding_text: "Powered by Pulsezen",
  branding_url: "",
  /** Run background jobs (rollups, reports, alerts) on page views when no cron job ran for a minute. */
  lazy_scheduler: true,
  /** Retention for raw events (days, 0 = unlimited) when no plan is marked as the free plan. Daily summaries are kept for good. */
  default_retention_days: 30,
  /** Optional path to a MaxMind/DB-IP city or country .mmdb file for visitor locations. */
  geoip_db_path: "",
  /** Extra user-agent fragments to treat as bots (one per line). */
  bot_patterns: "",
  /** Public shared dashboard shown on the home page ("" = none). */
  showcase_share_token: "",
  /** data-site key of one of the platform's own sites: the public website tracks itself ("" = off). */
  own_site_key: "",

  // Custom code
  custom_head_code: "",
  custom_body_code: "",

  // Cookie consent
  cookie_consent_enabled: true,
  cookie_consent_text:
    "We use cookies to keep you signed in and to understand how the site is used. By continuing you agree to our use of cookies.",

  // Language
  default_language: "en",

  // Blog
  blog_enabled: true,

  // Users
  registration_enabled: true,

  // Payments
  currency: "USD",
  stripe_enabled: false,
  stripe_secret_key: "",
  stripe_webhook_secret: "",
  paypal_enabled: false,
  paypal_mode: "sandbox",
  paypal_client_id: "",
  paypal_secret: "",
  razorpay_enabled: false,
  razorpay_key_id: "",
  razorpay_key_secret: "",
  offline_enabled: false,
  offline_instructions:
    "Transfer the amount to the bank account below and enter the transaction reference.\n\nBank: Example Bank\nAccount name: Your Company\nAccount number: 0000000000",

  // Email
  mail_enabled: false,
  smtp_host: "",
  smtp_port: 587,
  smtp_secure: false,
  smtp_user: "",
  smtp_pass: "",
  mail_from_name: "Pulsezen",
  mail_from_address: "no-reply@example.com",

  // Contact
  contact_enabled: true,

  // Maintenance
  maintenance_mode: false,
  maintenance_message: "We are performing scheduled maintenance. Please check back soon.",
};

export type Settings = typeof SETTING_DEFAULTS;
export type SettingKey = keyof Settings;

/** Settings that must never be sent to the browser. */
export const SECRET_SETTINGS: SettingKey[] = [
  "stripe_secret_key",
  "stripe_webhook_secret",
  "paypal_secret",
  "razorpay_key_secret",
  "smtp_pass",
];

const globalForSettings = globalThis as unknown as { __pulsezenSettings?: Settings };

function parse<K extends SettingKey>(key: K, raw: string | null): Settings[K] {
  const fallback = SETTING_DEFAULTS[key];
  if (raw === null || raw === undefined) return fallback;
  if (typeof fallback === "boolean") return (raw === "1" || raw === "true") as Settings[K];
  if (typeof fallback === "number") {
    const n = Number(raw);
    return (Number.isFinite(n) ? n : fallback) as Settings[K];
  }
  return raw as Settings[K];
}

export async function getSettings(): Promise<Settings> {
  if (globalForSettings.__pulsezenSettings) return globalForSettings.__pulsezenSettings;
  const db = await getDb();
  const rows = await db.selectFrom("settings").selectAll().execute();
  const settings: Settings = { ...SETTING_DEFAULTS };
  const record = settings as Record<string, unknown>;
  for (const row of rows) {
    if (row.key in SETTING_DEFAULTS) {
      record[row.key] = parse(row.key as SettingKey, row.value);
    }
  }
  globalForSettings.__pulsezenSettings = settings;
  return settings;
}

function serialize(value: unknown): string {
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value ?? "");
}

export async function updateSettings(values: Partial<Settings>): Promise<void> {
  const db = await getDb();
  await db.transaction().execute(async (trx) => {
    for (const [key, value] of Object.entries(values)) {
      if (!(key in SETTING_DEFAULTS)) continue;
      const serialized = serialize(value);
      const updated = await trx
        .updateTable("settings")
        .set({ value: serialized })
        .where("key", "=", key)
        .executeTakeFirst();
      if (Number(updated.numUpdatedRows) === 0) {
        // MySQL reports 0 changed rows when the value is unchanged, so check existence.
        const exists = await trx
          .selectFrom("settings")
          .select("key")
          .where("key", "=", key)
          .executeTakeFirst();
        if (!exists) await trx.insertInto("settings").values({ key, value: serialized }).execute();
      }
    }
  });
  clearSettingsCache();
}

export function clearSettingsCache(): void {
  globalForSettings.__pulsezenSettings = undefined;
}

/** Replace `{site_name}`, `{site_email}` and `{year}` placeholders. */
export function fillPlaceholders(text: string, settings: Settings): string {
  return text
    .replaceAll("{site_name}", settings.site_name)
    .replaceAll("{site_email}", settings.site_email)
    .replaceAll("{year}", String(new Date().getFullYear()));
}
