/**
 * Turns untrusted input (dashboard forms, stored JSON, query strings) into valid values.
 * Unknown keys are dropped, missing keys get defaults. Dependency-free.
 */

import {
  CHANNEL_TYPES,
  DEFAULT_SITE_SETTINGS,
  DIMENSIONS,
  PERIODS,
  type ChannelConfigByType,
  type ChannelType,
  type Dimension,
  type Filter,
  type FilterOp,
  type Period,
  type SiteSettings,
} from "./types";

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

export function parseJson(text: string | null | undefined): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function str(v: unknown, fallback: string, max = 500): string {
  if (typeof v !== "string") return fallback;
  return v.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").trim().slice(0, max);
}

function bool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (v === "true" || v === "on" || v === 1 || v === "1") return true;
  if (v === "false" || v === "off" || v === 0 || v === "0") return false;
  return fallback;
}

/** "https://WWW.Example.com/path" → "example.com"; "" when invalid. Keeps subdomains other than www. */
export function normalizeDomain(v: unknown): string {
  if (typeof v !== "string") return "";
  let value = v.trim().toLowerCase();
  if (!value) return "";
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(value)) value = `http://${value}`;
  try {
    const host = new URL(value).hostname.replace(/\.$/, "").replace(/^www\./, "");
    if (!/^[a-z0-9.-]+\.[a-z0-9-]{2,}$/.test(host) && host !== "localhost") return "";
    return host;
  } catch {
    return "";
  }
}

/** True when `host` is `domain`, www.`domain` or a subdomain of it. */
export function hostMatches(host: string, domain: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  return h === domain || h.endsWith(`.${domain}`);
}

function list(v: unknown, max: number, each: (s: string) => string): string[] {
  const raw = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[\n,]+/) : [];
  return [...new Set(raw.map((x) => each(String(x))).filter(Boolean))].slice(0, max);
}

export function normalizeSiteSettings(input: unknown): SiteSettings {
  const o = asObj(input);
  const d = DEFAULT_SITE_SETTINGS;
  return {
    extraDomains: list(o.extraDomains, 20, normalizeDomain),
    excludePaths: list(o.excludePaths, 50, (s) => (/^\/[^\s]{0,199}$/.test(s.trim()) ? s.trim() : "")),
    excludeIps: list(o.excludeIps, 50, (s) => (/^[0-9a-fA-F:.]+(\/\d{1,3})?$/.test(s.trim()) ? s.trim() : "")),
    allowLocalhost: bool(o.allowLocalhost, d.allowLocalhost),
    hashRouting: bool(o.hashRouting, d.hashRouting),
  };
}

export function isPeriod(v: unknown): v is Period {
  return typeof v === "string" && (PERIODS as readonly string[]).includes(v);
}

export function isDimension(v: unknown): v is Dimension {
  return typeof v === "string" && (DIMENSIONS as readonly string[]).includes(v);
}

/**
 * Filters from the URL: "f=country:is:DE&f=page:contains:/blog".
 * Values may contain ":"; at most 10 filters.
 */
export function parseFilters(values: string[]): Filter[] {
  const out: Filter[] = [];
  for (const raw of values.slice(0, 10)) {
    const [dimension, op, ...rest] = raw.split(":");
    const value = rest.join(":").slice(0, 300);
    if (!isDimension(dimension) || !["is", "is_not", "contains"].includes(op ?? "") || !value) continue;
    out.push({ dimension, op: op as FilterOp, value });
  }
  return out;
}

export function serializeFilter(f: Filter): string {
  return `${f.dimension}:${f.op}:${f.value}`;
}

/** "Signup", "Outbound Link" … — printable, ≤ 120 chars. */
export function normalizeEventName(v: unknown): string {
  return str(v, "", 120).replace(/[<>]/g, "");
}

/** Goal path pattern with * wildcards → SQL LIKE pattern. */
export function pathPatternToLike(pattern: string): string {
  return pattern.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/\*/g, "%");
}

/** Glob match used in memory (exclusions, goal checks). */
export function matchesPattern(pattern: string, value: string): boolean {
  const re = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
  return re.test(value);
}

// ── Alert channels ──

export function isChannelType(v: unknown): v is ChannelType {
  return typeof v === "string" && (CHANNEL_TYPES as readonly string[]).includes(v);
}

/** http(s) URL or "". */
export function httpUrl(v: unknown): string {
  if (typeof v !== "string") return "";
  const value = v.trim().slice(0, 1000);
  return /^https?:\/\/[^\s"'<>]+$/i.test(value) ? value : "";
}

export function normalizeChannelConfig<T extends ChannelType>(type: T, input: unknown): ChannelConfigByType[T] {
  const o = asObj(input);
  let out: unknown;
  switch (type) {
    case "email":
      out = {
        to: str(o.to, "", 1000)
          .split(/[,;\s]+/)
          .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
          .slice(0, 10)
          .join(", "),
      };
      break;
    case "webhook":
      out = { url: httpUrl(o.url), secret: str(o.secret, "", 200) };
      break;
    case "slack":
    case "discord":
    case "teams":
      out = { webhookUrl: httpUrl(o.webhookUrl) };
      break;
    case "telegram":
      out = { botToken: str(o.botToken, "", 100).replace(/[^A-Za-z0-9:_-]/g, ""), chatId: str(o.chatId, "", 40).replace(/[^0-9@A-Za-z_-]/g, "") };
      break;
  }
  return out as ChannelConfigByType[T];
}

export function channelProblem(type: ChannelType, config: unknown): string {
  const c = asObj(config);
  if (type === "email" && !c.to) return "Enter at least one valid email address.";
  if (type === "webhook" && !c.url) return "Enter the webhook URL (https://…).";
  if ((type === "slack" || type === "discord" || type === "teams") && !c.webhookUrl) return "Paste the incoming webhook URL.";
  if (type === "telegram" && (!c.botToken || !c.chatId)) return "Enter the bot token and the chat ID.";
  return "";
}
