import type { Generated, Insertable, Selectable, Updateable } from "kysely";

/**
 * Database schema shared by the MySQL and SQLite drivers.
 *
 * Portability rules used across the project:
 * - booleans are stored as 0 / 1 integers
 * - timestamps are ISO-8601 strings (see `now()` in ./index.ts)
 * - money is stored in the smallest currency unit (cents)
 */

export interface SettingsTable {
  key: string;
  value: string | null;
}

export interface UsersTable {
  id: Generated<number>;
  name: string;
  email: string;
  password_hash: string;
  role: "user" | "admin";
  status: "active" | "banned";
  plan_id: number | null;
  plan_expires_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionsTable {
  id: string;
  user_id: number;
  expires_at: string;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface PasswordResetsTable {
  token_hash: string;
  user_id: number;
  expires_at: string;
  created_at: string;
}

export interface PlansTable {
  id: Generated<number>;
  name: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number;
  features: string | null;
  /** 0 = unlimited. */
  max_sites: number;
  /** Pageviews + events per month; 0 = unlimited. */
  max_monthly_pageviews: number;
  /** Days raw events are kept (daily summaries are kept for good); 0 = unlimited. */
  retention_days: number;
  /** 0 = unlimited (reserved for team access). */
  max_team_members: number;
  /** Stats REST API access. */
  allow_api: number;
  remove_branding: number;
  is_free: number;
  is_active: number;
  is_featured: number;
  sort_order: number;
  created_at: string;
}

export interface PaymentsTable {
  id: Generated<number>;
  user_id: number;
  plan_id: number;
  amount: number;
  currency: string;
  billing_cycle: "monthly" | "yearly";
  provider: "stripe" | "paypal" | "razorpay" | "offline";
  provider_ref: string;
  status: "pending" | "paid" | "rejected" | "refunded";
  note: string | null;
  created_at: string;
}

export interface PagesTable {
  id: Generated<number>;
  slug: string;
  title: string;
  content: string;
  meta_description: string | null;
  is_published: number;
  show_in_footer: number;
  created_at: string;
  updated_at: string;
}

export interface ContactMessagesTable {
  id: Generated<number>;
  name: string;
  email: string;
  subject: string;
  message: string;
  ip: string | null;
  is_read: number;
  created_at: string;
}

export interface LanguagesTable {
  code: string;
  name: string;
  native_name: string;
  direction: "ltr" | "rtl";
  is_active: number;
  sort_order: number;
}

export interface TranslationsTable {
  lang: string;
  key: string;
  value: string;
}

export interface PostsTable {
  id: Generated<number>;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  cover_image: string | null;
  meta_description: string | null;
  status: "draft" | "published";
  published_at: string | null;
  views: number;
  created_at: string;
  updated_at: string;
}

export interface SitesTable {
  id: Generated<number>;
  user_id: number;
  name: string;
  /** Bare hostname, e.g. "example.com" (subdomains are accepted too). */
  domain: string;
  /** Public id used in the tracking snippet (data-site). */
  public_key: string;
  /** IANA time zone used for "today", days and reports. */
  timezone: string;
  /** JSON: SiteSettings (see src/analytics/types.ts). */
  settings: string;
  /** Secret part of the public shared dashboard URL (null = sharing off). */
  share_token: string | null;
  /** scrypt hash of the optional share password. */
  share_password_hash: string | null;
  /** First event received (installation verified). */
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventsTable {
  id: Generated<number>;
  site_id: number;
  /** ISO time (UTC). */
  ts: string;
  /** Daily-salted hash of IP + user agent + site: counts unique visitors without cookies. */
  session_hash: string;
  /** "pageview" or a custom event name. */
  name: string;
  pathname: string;
  hostname: string;
  referrer_host: string;
  referrer_path: string;
  /** Normalised traffic source, e.g. "Google", "ChatGPT", "Direct / None". */
  source: string;
  /** Channel group: direct, search, social, ai, email, paid, referral. */
  channel: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_term: string;
  utm_content: string;
  country: string;
  region: string;
  city: string;
  browser: string;
  browser_version: string;
  os: string;
  /** desktop | mobile | tablet */
  device: string;
  /** Screen width bucket, e.g. "1280+". */
  screen: string;
  lang: string;
  /** JSON object of custom event properties (string values). */
  props: string | null;
  revenue_cents: number | null;
  /** Id shared by the events of one visit (a new visit starts after 30 minutes of inactivity). */
  visit_id: string;
  /** Seconds since the previous event of the same visitor (0 for the first). */
  gap_sec: number;
  /** 1 when this event started a new visit (first event or gap over 30 minutes). */
  is_entry: number;
}

export interface RollupDailyTable {
  site_id: number;
  day: string;
  /** "total" or a dimension name (see src/analytics/types.ts). */
  dimension: string;
  value: string;
  visitors: number;
  visits: number;
  pageviews: number;
  events: number;
  bounces: number;
  duration_sec: number;
  revenue_cents: number;
}

export interface GoalsTable {
  id: Generated<number>;
  site_id: number;
  /** "pageview" (path pattern, * wildcard) or "event" (event name). */
  type: "pageview" | "event";
  value: string;
  name: string;
  created_at: string;
}

export interface SaltsTable {
  /** UTC day the salt is used for (YYYY-MM-DD). */
  day: string;
  salt: string;
}

export interface ReportsTable {
  id: Generated<number>;
  site_id: number;
  user_id: number;
  frequency: "weekly" | "monthly";
  /** Comma-separated email addresses. */
  recipients: string;
  last_sent_at: string | null;
  created_at: string;
}

export interface TrafficAlertsTable {
  id: Generated<number>;
  site_id: number;
  /** spike: visitors in the last hour > threshold × hourly average; drop: below threshold %; silence: no events for threshold hours. */
  type: "spike" | "drop" | "silence";
  threshold: number;
  /** JSON array of alert channel ids. */
  channel_ids: string;
  is_active: number;
  last_triggered_at: string | null;
  created_at: string;
}

export interface ApiKeysTable {
  id: Generated<number>;
  user_id: number;
  name: string;
  /** sha256 of the key; the key itself is shown once. */
  key_hash: string;
  /** First characters, to recognise the key in the list. */
  prefix: string;
  last_used_at: string | null;
  created_at: string;
}

export interface UsageMonthlyTable {
  user_id: number;
  /** YYYY-MM */
  month: string;
  pageviews: number;
  events: number;
}

export interface AlertChannelsTable {
  id: Generated<number>;
  user_id: number;
  type: "email" | "webhook" | "slack" | "discord" | "telegram" | "teams";
  name: string;
  /** JSON: channel config (see src/analytics/types.ts). */
  config: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface AlertLogTable {
  id: Generated<number>;
  site_id: number | null;
  channel_id: number | null;
  event: string;
  ok: number;
  error: string | null;
  created_at: string;
}

export interface Database {
  settings: SettingsTable;
  users: UsersTable;
  sessions: SessionsTable;
  password_resets: PasswordResetsTable;
  plans: PlansTable;
  payments: PaymentsTable;
  pages: PagesTable;
  contact_messages: ContactMessagesTable;
  languages: LanguagesTable;
  translations: TranslationsTable;
  posts: PostsTable;
  sites: SitesTable;
  events: EventsTable;
  rollup_daily: RollupDailyTable;
  goals: GoalsTable;
  salts: SaltsTable;
  reports: ReportsTable;
  traffic_alerts: TrafficAlertsTable;
  api_keys: ApiKeysTable;
  usage_monthly: UsageMonthlyTable;
  alert_channels: AlertChannelsTable;
  alert_log: AlertLogTable;
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;
export type Plan = Selectable<PlansTable>;
export type Payment = Selectable<PaymentsTable>;
export type Page = Selectable<PagesTable>;
export type ContactMessage = Selectable<ContactMessagesTable>;
export type Language = Selectable<LanguagesTable>;
export type Post = Selectable<PostsTable>;
export type Site = Selectable<SitesTable>;
export type AnalyticsEvent = Selectable<EventsTable>;
export type Goal = Selectable<GoalsTable>;
export type Report = Selectable<ReportsTable>;
export type TrafficAlert = Selectable<TrafficAlertsTable>;
export type ApiKey = Selectable<ApiKeysTable>;
export type AlertChannel = Selectable<AlertChannelsTable>;
