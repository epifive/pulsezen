/**
 * The contract shared by the tracker (src/tracker → public/pz.js), the ingest endpoint
 * (src/lib/ingest.ts), the stats engine (src/lib/query.ts), the dashboard, the shared
 * dashboards, the Stats API, email reports and traffic alerts.
 *
 * Keep this file free of imports and runtime dependencies: it is used on the server,
 * in client components and (types only) in the tracker.
 */

// ── Tracker → POST /api/event (text/plain JSON, ≤ 2 KB) ──

export interface TrackPayload {
  /** Event name: "pageview" or a custom name (max 120 chars). */
  n: string;
  /** Full page URL (location.href, max 1000 chars). */
  u: string;
  /** Site public key (data-site). */
  d: string;
  /** document.referrer ("" when none). */
  r: string;
  /** Screen width in CSS pixels (window.innerWidth). */
  w: number;
  /** Custom properties: up to 20 string pairs, keys ≤ 40 chars, values ≤ 200 chars. */
  p?: Record<string, string>;
  /** Revenue: { amount, currency } (amount in major units, e.g. 19.99). */
  $?: { amount: number; currency: string };
  /** 1 when the page is a 404 (tracker sends n = "404"). */
  h?: number;
}

export const PAGEVIEW = "pageview";
/** Events the tracker sends automatically when enabled with data-* attributes. */
export const AUTO_EVENTS = ["Outbound Link", "File Download", "404"] as const;

// ── Visitors, visits and metrics ──

/** A new visit starts after this much inactivity (same visitor hash, same day). */
export const VISIT_TIMEOUT_SEC = 30 * 60;

export const METRICS = ["visitors", "visits", "pageviews", "views_per_visit", "bounce_rate", "visit_duration", "events", "conversion_rate", "revenue"] as const;
export type Metric = (typeof METRICS)[number];

/** Breakdown dimensions (also the `dimension` column of rollup_daily, except "total"). */
export const DIMENSIONS = [
  "page",
  "entry_page",
  "exit_page",
  "hostname",
  "channel",
  "source",
  "referrer",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "country",
  "region",
  "city",
  "browser",
  "os",
  "device",
  "screen",
  "lang",
  "event",
  "goal",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/** Channel groups shown in the "Sources → Channels" tab. */
export const CHANNELS = ["direct", "search", "social", "ai", "email", "paid", "referral"] as const;
export type Channel = (typeof CHANNELS)[number];

export const DEVICES = ["desktop", "mobile", "tablet"] as const;
export type Device = (typeof DEVICES)[number];

/** Screen buckets derived from the reported width. */
export const SCREEN_BUCKETS = ["<576", "576-767", "768-991", "992-1279", "1280-1919", "1920+"] as const;

// ── Queries ──

export const PERIODS = ["realtime", "today", "yesterday", "7d", "30d", "month", "last_month", "12m", "all", "custom"] as const;
export type Period = (typeof PERIODS)[number];

export type Granularity = "hour" | "day" | "month";

/** Filter operators: is / is not / contains. */
export type FilterOp = "is" | "is_not" | "contains";

export interface Filter {
  dimension: Dimension;
  op: FilterOp;
  value: string;
}

export interface StatsQuery {
  siteId: number;
  /** Inclusive local dates (site time zone) YYYY-MM-DD. */
  from: string;
  to: string;
  timezone: string;
  filters: Filter[];
}

export interface AggregateResult {
  visitors: number;
  visits: number;
  pageviews: number;
  /** pageviews / visits. */
  viewsPerVisit: number;
  /** % of visits with a single pageview (0–100). */
  bounceRate: number;
  /** Average visit duration in seconds. */
  visitDuration: number;
  events: number;
  revenueCents: number;
}

export interface TimeseriesPoint {
  /** Bucket start, local time: "YYYY-MM-DD HH:00", "YYYY-MM-DD" or "YYYY-MM". */
  date: string;
  visitors: number;
  pageviews: number;
}

export interface BreakdownRow {
  value: string;
  visitors: number;
  pageviews: number;
  /** For events/goals: completions; for goals also conversionRate (0–100). */
  events?: number;
  conversionRate?: number;
  bounceRate?: number;
  visitDuration?: number;
  revenueCents?: number;
}

// ── Sites ──

export interface SiteSettings {
  /** Extra hostnames allowed to send data (staging, other domains). */
  extraDomains: string[];
  /** Pathname patterns to ignore (* wildcard), e.g. "/admin/*". */
  excludePaths: string[];
  /** IP addresses or CIDR ranges to ignore (e.g. the owner's office). */
  excludeIps: string[];
  /** Count visits from localhost (off by default). */
  allowLocalhost: boolean;
  /** Track hash-based routes (#/page) as pages. */
  hashRouting: boolean;
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  extraDomains: [],
  excludePaths: [],
  excludeIps: [],
  allowLocalhost: false,
  hashRouting: false,
};

// ── Goals, reports and traffic alerts ──

export type GoalType = "pageview" | "event";
export type ReportFrequency = "weekly" | "monthly";
export type TrafficAlertType = "spike" | "drop" | "silence";

// ── Alert channels (same senders as the sibling product Statuszen) ──

export const CHANNEL_TYPES = ["email", "webhook", "slack", "discord", "telegram", "teams"] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export interface ChannelConfigByType {
  /** Comma-separated addresses. */
  email: { to: string };
  /** Payload signed with HMAC-SHA256 of `secret` in the X-Pulsezen-Signature header. */
  webhook: { url: string; secret: string };
  slack: { webhookUrl: string };
  discord: { webhookUrl: string };
  teams: { webhookUrl: string };
  telegram: { botToken: string; chatId: string };
}
export type ChannelConfig<T extends ChannelType = ChannelType> = ChannelConfigByType[T];

export const ALERT_EVENTS = ["traffic_spike", "traffic_drop", "traffic_silence", "quota_warning", "quota_reached", "test"] as const;
export type AlertEvent = (typeof ALERT_EVENTS)[number];

/** What every alert channel receives (also the JSON body of webhook alerts). */
export interface AlertPayload {
  event: AlertEvent;
  site: { id: number; name: string; domain: string } | null;
  /** Human-readable one-line summary, e.g. "Traffic spike: 412 visitors in the last hour (6× normal)". */
  message: string;
  /** Numbers behind the alert (current, baseline, threshold…). */
  data: Record<string, number | string>;
  /** Link to the site's dashboard. */
  url: string;
  sentAt: string;
}
