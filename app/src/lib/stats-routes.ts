import "server-only";
import { isDimension } from "@/analytics/normalize";
import { findTab, type StatsTab } from "@/components/dashboard/stats-tabs";
import { normalizeEventName } from "@/analytics/normalize";
import { getPropertyBreakdown, getTimeseries, MAX_BREAKDOWN_LIMIT, type BreakdownItem } from "./query";
import { buildStatsQuery } from "./stats-params";
import { parseStatsParams } from "./stats-url";
import { loadTabRows } from "./stats-view";
import type { SiteRecord } from "./sites";

/** The tab named by ?tab= or, for the API-style ?dimension=, a plain tab on that dimension. */
export function tabFromSearch(search: URLSearchParams): StatsTab | null {
  const tab = findTab(search.get("tab"));
  if (tab) return tab;
  const dimension = search.get("dimension");
  if (isDimension(dimension)) return { key: dimension, dimension, label: "dash.dim.page", metric: "dash.metric.visitors", value: "visitors" };
  return null;
}

const noStore = { "Cache-Control": "no-store" };

/**
 * GET …/data?tab=…&period=…&f=… → { rows } (breakdown tabs loaded on demand).
 * GET …/data?event=NAME[&prop=KEY]&period=…&f=… → { rows, approximate, truncated }: the
 * property names of a custom event, or the values of one property.
 */
export async function breakdownJson(site: SiteRecord, url: URL): Promise<Response> {
  const limit = Math.min(MAX_BREAKDOWN_LIMIT, Math.max(1, Number(url.searchParams.get("limit")) || 9));
  if (url.searchParams.has("event")) {
    const event = normalizeEventName(url.searchParams.get("event"));
    if (!event) return Response.json({ error: "Unknown event." }, { status: 400, headers: noStore });
    const { q } = await buildStatsQuery(site, parseStatsParams(url.searchParams));
    const result = await getPropertyBreakdown(q, event, url.searchParams.get("prop"), { limit, search: url.searchParams.get("search") ?? "" });
    return Response.json(result, { headers: noStore });
  }
  const tab = tabFromSearch(url.searchParams);
  if (!tab) return Response.json({ error: "Unknown tab." }, { status: 400, headers: noStore });
  const { q } = await buildStatsQuery(site, parseStatsParams(url.searchParams));
  const rows = await loadTabRows(q, tab, { limit, search: url.searchParams.get("search") ?? "" });
  return Response.json({ rows }, { headers: noStore });
}

function csvCell(v: string | number): string {
  let s = String(v);
  // Spreadsheet formula injection: never start a cell with = + - @.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Byte order mark: lets Excel open the UTF-8 file with the right encoding. */
const BOM = String.fromCharCode(0xfeff);

const toCsv = (rows: Array<Array<string | number>>) => `${rows.map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;

function fileName(site: SiteRecord, part: string, from: string, to: string): string {
  return `${site.domain.replace(/[^a-z0-9.-]/gi, "_")}-${part}-${from}-${to}.csv`;
}

/** GET …/export?tab=… (or ?dimension=…) → CSV of the breakdown; without a tab → CSV of the chart. */
export async function statsCsv(site: SiteRecord, url: URL): Promise<Response> {
  const params = parseStatsParams(url.searchParams);
  const { q, period } = await buildStatsQuery(site, params);
  const tab = tabFromSearch(url.searchParams);
  let rows: Array<Array<string | number>>;
  let part: string;

  if (!tab) {
    part = "visitors";
    const points = await getTimeseries(q, period.granularity);
    rows = [["date", "visitors", "visits", "pageviews", "views_per_visit", "bounce_rate", "visit_duration"]];
    for (const p of points) rows.push([p.date, p.visitors, p.visits, p.pageviews, p.viewsPerVisit, p.bounceRate, p.visitDuration]);
  } else {
    part = tab.key;
    const all: BreakdownItem[] = [];
    // Up to 10,000 rows, read in pages of 100.
    for (let page = 0; page < 100; page++) {
      const batch = await loadTabRows(q, tab, { limit: MAX_BREAKDOWN_LIMIT, offset: page * MAX_BREAKDOWN_LIMIT });
      all.push(...batch);
      if (batch.length < MAX_BREAKDOWN_LIMIT || tab.dimension === "goal") break;
    }
    const d = tab.dimension;
    if (d === "goal" || d === "event") {
      rows = [["name", "unique_conversions", "total_conversions", ...(d === "goal" ? ["conversion_rate"] : []), "revenue"]];
      for (const r of all) rows.push([r.value, r.visitors, r.events ?? 0, ...(d === "goal" ? [r.conversionRate ?? 0] : []), ((r.revenueCents ?? 0) / 100).toFixed(2)]);
    } else if (d === "page" || d === "hostname") {
      rows = [["name", "visitors", "pageviews"]];
      for (const r of all) rows.push([r.value, r.visitors, r.pageviews]);
    } else {
      rows = [["name", "visitors", "visits", "pageviews", "bounce_rate", "visit_duration"]];
      for (const r of all) rows.push([r.value, r.visitors, r.visits ?? 0, r.pageviews, r.bounceRate ?? 0, r.visitDuration ?? 0]);
    }
  }

  return new Response(`${BOM}${toCsv(rows)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName(site, part, period.from, period.to)}"`,
      ...noStore,
    },
  });
}
