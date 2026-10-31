import type { AlertEvent, AlertPayload } from "@/analytics/types";

/**
 * Turns an AlertPayload into the title, summary and fields every channel shows.
 * Alerts are written in English (like the webhook payload), whatever the dashboard language.
 */

/** "2026-10-16 14:05 UTC" */
export function humanTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return `${new Date(t).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function humanNumber(value: number | string | undefined): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value ?? "");
  return Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

export const EVENT_COLORS: Record<AlertEvent, string> = {
  traffic_spike: "#7c3aed",
  traffic_drop: "#dc2626",
  traffic_silence: "#ea580c",
  quota_warning: "#d97706",
  quota_reached: "#dc2626",
  test: "#1d5bd8",
};

const SUBJECT_PREFIX: Record<AlertEvent, string> = {
  traffic_spike: "Traffic spike",
  traffic_drop: "Traffic drop",
  traffic_silence: "No data",
  quota_warning: "Usage 80%",
  quota_reached: "Usage limit reached",
  test: "Test",
};

/** True for events that need attention (red / "Attention" styling). */
export function isProblem(event: AlertEvent): boolean {
  return event === "traffic_drop" || event === "traffic_silence" || event === "quota_reached";
}

export interface AlertText {
  /** One-line headline, e.g. "Traffic spike on example.com". */
  title: string;
  /** Email subject, e.g. "[Traffic spike] example.com". */
  subject: string;
  /** One or two sentences with the essentials. */
  summary: string;
  /** Label/value pairs shown as fields. */
  facts: Array<[string, string]>;
  color: string;
  /** Label of the link button ("Open dashboard"). */
  linkLabel: string;
}

export function describeAlert(p: AlertPayload, siteName: string): AlertText {
  const site = p.site?.name || p.site?.domain || "your website";
  const d = p.data;
  let title: string;
  const facts: Array<[string, string]> = [];
  if (p.site) facts.push(["Website", p.site.domain || p.site.name]);
  switch (p.event) {
    case "traffic_spike":
      title = `Traffic spike on ${site}`;
      facts.push(["Visitors in the last hour", humanNumber(d.visitors)], ["Normal per hour", humanNumber(d.baseline)], ["Alert above", `${humanNumber(d.threshold)}× normal`]);
      break;
    case "traffic_drop":
      title = `Traffic drop on ${site}`;
      facts.push(["Visitors in the last 24 hours", humanNumber(d.visitors)], ["Normal per day", humanNumber(d.baseline)], ["Alert below", `${humanNumber(d.threshold)}% of normal`]);
      break;
    case "traffic_silence":
      title = `No data from ${site}`;
      facts.push(["Silent for", `${humanNumber(d.hours)} hours or more`]);
      if (d.lastEventAt) facts.push(["Last event", humanTime(String(d.lastEventAt))]);
      break;
    case "quota_warning":
    case "quota_reached":
      title = p.event === "quota_warning" ? "You have used 80% of your monthly pageviews" : "You have reached your monthly pageview limit";
      facts.push(["Used this month", humanNumber(d.used)], ["Monthly limit", humanNumber(d.limit)]);
      break;
    case "test":
      title = `Test alert from ${siteName}`;
      break;
  }
  return {
    title,
    subject: `[${SUBJECT_PREFIX[p.event]}] ${p.event === "test" ? siteName : p.site ? p.site.domain || p.site.name : siteName}`,
    summary: p.message,
    facts,
    color: EVENT_COLORS[p.event],
    linkLabel: "Open dashboard",
  };
}

/** Plain-text body used by email (and as a fallback elsewhere). */
export function alertPlainText(p: AlertPayload, siteName: string): string {
  const t = describeAlert(p, siteName);
  return [t.title, "", t.summary, "", ...t.facts.map(([k, v]) => `${k}: ${v}`), "", `${t.linkLabel}: ${p.url}`, "", `— ${siteName}`].join("\n");
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export interface SendContext {
  siteName: string;
  /** Webhooks may point at private/internal addresses (env ALLOW_PRIVATE_WEBHOOKS=1). */
  allowPrivate: boolean;
  timeoutMs: number;
}

export interface SendResult {
  ok: boolean;
  error?: string;
}
