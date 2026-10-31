import "server-only";
import { getDb, now } from "./db";
import type { Report } from "./db/schema";
import { addDays, dayStartMs, isoWeekday, localDay, monthStart } from "./jobs/shared";
import { mailConfigured, sendMail } from "./mail";
import { getEntitlements } from "./plans";
import { getAggregate, getBreakdown } from "./query";
import { getSettings, type Settings } from "./settings";
import { absoluteUrl } from "./site";
import { safeTimezone } from "./sites";
import type { AggregateResult, BreakdownRow, ReportFrequency, StatsQuery } from "@/analytics/types";

/**
 * Weekly / monthly email reports (table reports). Reports are written in English.
 * A weekly report covers the last full week (Monday–Sunday) and is sent on Monday; a monthly
 * report covers the previous calendar month and is sent on the 1st — both in the site's time
 * zone, once per period (reports.last_sent_at).
 */

export interface ReportPeriod {
  /** Inclusive local days. */
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  /** Local day the period's report is due (the day after `to`). */
  sendDay: string;
}

/** The last complete period before `at` (ms) in a time zone. */
export function lastCompletePeriod(frequency: ReportFrequency, timezone: string, at = Date.now()): ReportPeriod {
  const today = localDay(at, timezone);
  if (frequency === "weekly") {
    const monday = addDays(today, 1 - isoWeekday(today));
    const from = addDays(monday, -7);
    return { from, to: addDays(monday, -1), prevFrom: addDays(from, -7), prevTo: addDays(from, -1), sendDay: monday };
  }
  const first = monthStart(today, 0);
  const from = monthStart(today, -1);
  const prevFrom = monthStart(today, -2);
  return { from, to: addDays(first, -1), prevFrom, prevTo: addDays(from, -1), sendDay: first };
}

interface ReportSite {
  id: number;
  name: string;
  domain: string;
  timezone: string;
}

export interface ReportData {
  site: ReportSite;
  frequency: ReportFrequency;
  period: ReportPeriod;
  current: AggregateResult;
  previous: AggregateResult;
  pages: BreakdownRow[];
  sources: BreakdownRow[];
  countries: BreakdownRow[];
  aiVisitors: number;
}

export async function collectReportData(site: ReportSite, frequency: ReportFrequency, at = Date.now()): Promise<ReportData> {
  const timezone = safeTimezone(site.timezone);
  const period = lastCompletePeriod(frequency, timezone, at);
  const q: StatsQuery = { siteId: site.id, from: period.from, to: period.to, timezone, filters: [] };
  const prev: StatsQuery = { ...q, from: period.prevFrom, to: period.prevTo };
  const [current, previous, pages, sources, countries, channels] = await Promise.all([
    getAggregate(q),
    getAggregate(prev),
    getBreakdown(q, "page", { limit: 5 }),
    getBreakdown(q, "source", { limit: 5 }),
    getBreakdown(q, "country", { limit: 5 }),
    getBreakdown(q, "channel", { limit: 10 }),
  ]);
  const aiVisitors = channels.find((c) => c.value === "ai")?.visitors ?? 0;
  return { site: { ...site, timezone }, frequency, period, current, previous, pages, sources, countries, aiVisitors };
}

// ── rendering ──

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const num = (n: number) => Math.round(n || 0).toLocaleString("en-US");

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

function dayLabel(day: string, withYear = false): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
}

export function periodLabel(r: Pick<ReportData, "frequency" | "period">): string {
  if (r.frequency === "monthly") {
    return new Date(`${r.period.from}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  }
  return `${dayLabel(r.period.from)} – ${dayLabel(r.period.to, true)}`;
}

let regionNames: Intl.DisplayNames | null = null;
function countryName(code: string): string {
  if (!/^[A-Z]{2}$/i.test(code)) return code || "Unknown";
  try {
    regionNames ??= new Intl.DisplayNames(["en"], { type: "region" });
    return regionNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

interface Kpi {
  label: string;
  value: string;
  /** "+12%" / "−3 pts" / "" */
  change: string;
  /** Whether the change is good news (bounce rate: lower is better). */
  good: boolean | null;
}

function kpis(r: ReportData): Kpi[] {
  const pct = (cur: number, prev: number, lowerIsBetter = false): Pick<Kpi, "change" | "good"> => {
    if (!prev) return { change: cur ? "new" : "", good: null };
    const diff = Math.round(((cur - prev) / prev) * 100);
    if (diff === 0) return { change: "±0%", good: null };
    return { change: `${diff > 0 ? "+" : "−"}${Math.abs(diff)}%`, good: lowerIsBetter ? diff < 0 : diff > 0 };
  };
  const c = r.current;
  const p = r.previous;
  const bounceDiff = Math.round(c.bounceRate - p.bounceRate);
  return [
    { label: "Visitors", value: num(c.visitors), ...pct(c.visitors, p.visitors) },
    { label: "Pageviews", value: num(c.pageviews), ...pct(c.pageviews, p.pageviews) },
    {
      label: "Bounce rate",
      value: `${Math.round(c.bounceRate)}%`,
      change: p.visits && c.visits && bounceDiff ? `${bounceDiff > 0 ? "+" : "−"}${Math.abs(bounceDiff)} pts` : "",
      good: p.visits && c.visits && bounceDiff ? bounceDiff < 0 : null,
    },
    { label: "Visit duration", value: formatDuration(c.visitDuration), ...pct(c.visitDuration, p.visitDuration) },
  ];
}

export interface RenderedReport {
  subject: string;
  text: string;
  html: string;
}

export function renderReport(r: ReportData, settings: Settings, opts: { branding: boolean; test?: boolean }): RenderedReport {
  const label = periodLabel(r);
  const kind = r.frequency === "weekly" ? "Weekly" : "Monthly";
  const subject = `${opts.test ? "[Test] " : ""}${kind} report for ${r.site.domain}: ${label}`;
  const dashboardUrl = absoluteUrl(settings, `/dashboard/sites/${r.site.id}`);
  const manageUrl = absoluteUrl(settings, `/dashboard/sites/${r.site.id}/reports`);
  const brandUrl = settings.branding_url || absoluteUrl(settings, "/");
  const comparison = r.frequency === "weekly" ? "the week before" : "the month before";
  const stats = kpis(r);
  const lists: Array<{ title: string; rows: Array<[string, string]> }> = [
    { title: "Top pages", rows: r.pages.map((x) => [x.value || "/", num(x.visitors)]) },
    { title: "Top sources", rows: r.sources.map((x) => [x.value || "Direct / None", num(x.visitors)]) },
    { title: "Top countries", rows: r.countries.map((x) => [countryName(x.value), num(x.visitors)]) },
  ];

  // Plain text.
  const text = [
    `${kind} report for ${r.site.name} (${r.site.domain})`,
    label,
    "",
    ...stats.map((k) => `${k.label}: ${k.value}${k.change ? ` (${k.change} vs ${comparison})` : ""}`),
    ...(r.aiVisitors ? [`AI assistants: ${num(r.aiVisitors)} visitors from ChatGPT, Perplexity and others`] : []),
    "",
    ...lists.flatMap((l) => [l.title, ...(l.rows.length ? l.rows.map(([k, v]) => `  ${k} — ${v} visitors`) : ["  No data"]), ""]),
    `Open the dashboard: ${dashboardUrl}`,
    "",
    `You receive this email because a ${kind.toLowerCase()} report is set up for ${r.site.domain}.`,
    `Change recipients or unsubscribe: ${manageUrl}`,
    ...(opts.branding && settings.branding_text ? ["", `${settings.branding_text} — ${brandUrl}`] : []),
  ].join("\n");

  // HTML (inline styles: email clients ignore <style> blocks).
  const color = /^#[0-9a-f]{3,8}$/i.test(settings.primary_color) ? settings.primary_color : "#c2410c";
  const kpiCells = stats
    .map((k) => {
      const tone = k.good === null ? "#6b7280" : k.good ? "#15803d" : "#b91c1c";
      return `<td width="25%" style="padding:12px 8px;vertical-align:top">
<div style="font-size:12px;color:#6b7280">${esc(k.label)}</div>
<div style="font-size:22px;font-weight:bold;margin-top:4px;color:#18201d">${esc(k.value)}</div>
<div style="font-size:12px;margin-top:2px;color:${tone}">${esc(k.change || " ")}</div></td>`;
    })
    .join("");
  const listHtml = lists
    .map(
      (l) => `<tr><td style="padding:20px 24px 0">
<div style="font-size:14px;font-weight:bold;margin-bottom:6px">${esc(l.title)}</div>
<table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">${
        l.rows.length
          ? l.rows
              .map(
                ([k, v]) =>
                  `<tr><td style="padding:6px 0;border-bottom:1px solid #eef0ee;color:#18201d;word-break:break-all">${esc(k)}</td><td align="right" style="padding:6px 0 6px 12px;border-bottom:1px solid #eef0ee;color:#6b7280;white-space:nowrap">${esc(v)}</td></tr>`,
              )
              .join("")
          : `<tr><td style="padding:6px 0;color:#6b7280">No data for this period.</td></tr>`
      }</table></td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;background:#f6f7f5;font-family:Arial,Helvetica,sans-serif;color:#18201d">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f5"><tr><td align="center" style="padding:32px 12px">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="padding:0 4px 16px;font-size:18px;font-weight:bold">${esc(settings.site_name)}</td></tr>
<tr><td style="background:#ffffff;border:1px solid #dde3df;border-radius:12px">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:24px 24px 4px">
<div style="font-size:13px;color:#6b7280">${esc(kind)} report · ${esc(label)}</div>
<div style="font-size:20px;font-weight:bold;margin-top:4px">${esc(r.site.name)}</div>
<div style="font-size:13px;color:#6b7280">${esc(r.site.domain)}</div>
</td></tr>
<tr><td style="padding:8px 16px 0"><table width="100%" cellpadding="0" cellspacing="0"><tr>${kpiCells}</tr></table>
<div style="padding:0 8px;font-size:12px;color:#6b7280">Changes compared with ${esc(comparison)}.</div></td></tr>
${r.aiVisitors ? `<tr><td style="padding:16px 24px 0"><div style="background:#f5f3ff;border-radius:8px;padding:10px 12px;font-size:14px">AI assistants (ChatGPT, Perplexity and others) sent <b>${esc(num(r.aiVisitors))}</b> visitors.</div></td></tr>` : ""}
${listHtml}
<tr><td style="padding:24px"><a href="${esc(dashboardUrl)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:10px 18px;border-radius:8px">Open the dashboard</a></td></tr>
</table></td></tr>
<tr><td style="padding:16px 4px;font-size:12px;line-height:1.6;color:#6b7280">
You receive this email because a ${esc(kind.toLowerCase())} report is set up for ${esc(r.site.domain)}.
<a href="${esc(manageUrl)}" style="color:#6b7280">Change recipients or unsubscribe</a>.
${opts.branding && settings.branding_text ? `<br><a href="${esc(brandUrl)}" style="color:#6b7280">${esc(settings.branding_text)}</a>` : ""}
</td></tr>
</table></td></tr></table></body></html>`;

  return { subject, text, html };
}

// ── sending ──

export function parseRecipients(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,;\s]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 190),
    ),
  ].slice(0, 10);
}

export type SendReportResult = { ok: true; sent: number } | { ok: false; error: string };

/** Build and email one report to its recipients (one email per recipient). */
export async function sendReport(report: Pick<Report, "site_id" | "frequency" | "recipients">, opts: { test?: boolean; at?: number } = {}): Promise<SendReportResult> {
  const settings = await getSettings();
  if (!mailConfigured(settings)) return { ok: false, error: "Email is not configured on this platform." };
  const recipients = parseRecipients(report.recipients);
  if (!recipients.length) return { ok: false, error: "No valid recipient." };
  const db = await getDb();
  const site = await db
    .selectFrom("sites")
    .innerJoin("users", "users.id", "sites.user_id")
    .select(["sites.id", "sites.name", "sites.domain", "sites.timezone", "users.role", "users.plan_id", "users.plan_expires_at"])
    .where("sites.id", "=", report.site_id)
    .executeTakeFirst();
  if (!site) return { ok: false, error: "Website not found." };
  const entitlements = await getEntitlements({ role: site.role, plan_id: site.plan_id, plan_expires_at: site.plan_expires_at });
  const data = await collectReportData(site, report.frequency, opts.at);
  const mail = renderReport(data, settings, { branding: !entitlements.removeBranding, test: opts.test });
  let sent = 0;
  let lastError = "";
  for (const to of recipients) {
    try {
      await sendMail({ to, subject: mail.subject, text: mail.text, html: mail.html });
      sent += 1;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Sending failed";
    }
  }
  return sent ? { ok: true, sent } : { ok: false, error: lastError || "Sending failed" };
}

/** True when `report` is due: its period's send day has started and it wasn't sent for it yet. */
export function reportDue(report: Pick<Report, "frequency" | "last_sent_at" | "created_at">, timezone: string, at = Date.now()): { due: boolean; periodStart: number; period: ReportPeriod } {
  const period = lastCompletePeriod(report.frequency, timezone, at);
  const periodStart = dayStartMs(period.sendDay, timezone);
  const since = report.last_sent_at ?? report.created_at;
  return { due: at >= periodStart && Date.parse(since) < periodStart, periodStart, period };
}

export async function markReportSent(reportId: number): Promise<void> {
  const db = await getDb();
  await db.updateTable("reports").set({ last_sent_at: now() }).where("id", "=", reportId).execute();
}
