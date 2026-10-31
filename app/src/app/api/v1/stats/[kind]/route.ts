import { isDimension, normalizeEventName } from "@/analytics/normalize";
import type { Granularity } from "@/analytics/types";
import { compareAggregate, getAggregate, getBreakdownResult, getPropertyBreakdown, getTimeseries, MAX_BREAKDOWN_LIMIT } from "@/lib/query";
import { getOwnedSite } from "@/lib/sites";
import { apiError, apiGuard, apiJson } from "@/lib/stats-api";
import { daysBetween } from "@/lib/stats-dates";
import { buildStatsQuery, parseStatsParams } from "@/lib/stats-params";

export const dynamic = "force-dynamic";

const KINDS = ["aggregate", "timeseries", "breakdown"] as const;

/**
 * GET /api/v1/stats/{aggregate|timeseries|breakdown}
 *   ?site_id=1&period=30d (today, yesterday, 7d, 30d, month, last_month, 12m, all, custom)
 *   &from=YYYY-MM-DD&to=YYYY-MM-DD (custom) &f=country:is:DE (repeatable; ops is, is_not, contains)
 *   aggregate:  &compare=1
 *   timeseries: &interval=hour|day|month
 *   breakdown:  &dimension=page&limit=10&page=1&search=blog
 *               &dimension=event_prop&event=Purchase[&prop=plan]  (property names / values of a custom event)
 */
export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!(KINDS as readonly string[]).includes(kind)) return apiError(404, "Unknown endpoint. Use aggregate, timeseries or breakdown.");
  const guard = await apiGuard(request);
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const siteId = Number(url.searchParams.get("site_id"));
  const site = Number.isInteger(siteId) ? await getOwnedSite(siteId, guard.user.id) : undefined;
  if (!site) return apiError(404, "Site not found. Pass the id of one of your sites as site_id (see GET /api/v1/sites).");

  const statsParams = parseStatsParams(url.searchParams);
  if (statsParams.period === "custom" && (!url.searchParams.get("from") || !url.searchParams.get("to"))) {
    return apiError(400, "period=custom needs from and to (YYYY-MM-DD).");
  }
  const { q, period } = await buildStatsQuery(site, statsParams);
  const meta = { site_id: site.id, timezone: site.timezone, period: period.period, from: period.from, to: period.to, filters: q.filters };

  if (kind === "aggregate") {
    if (statsParams.compare) {
      const { current, previous, change, previousRange } = await compareAggregate(q);
      const { approximate, ...results } = current;
      const { approximate: _a, ...prev } = previous;
      void _a;
      return apiJson({ ...meta, approximate, results, previous: { ...previousRange, results: prev }, change });
    }
    const { approximate, ...results } = await getAggregate(q);
    return apiJson({ ...meta, approximate, results });
  }

  if (kind === "timeseries") {
    const span = daysBetween(period.from, period.to) + 1;
    const wanted = url.searchParams.get("interval");
    let granularity: Granularity = period.granularity;
    if (wanted === "hour" || wanted === "day" || wanted === "month") {
      if ((wanted === "hour" && span > 7) || (wanted === "day" && span > 400)) return apiError(400, "Interval too small for this range (hour: up to 7 days, day: up to 400 days).");
      granularity = wanted;
    } else if (wanted) return apiError(400, "interval must be hour, day or month.");
    return apiJson({ ...meta, interval: granularity, results: await getTimeseries(q, granularity) });
  }

  const dimension = url.searchParams.get("dimension");
  const limit = Math.min(MAX_BREAKDOWN_LIMIT, Math.max(1, Number(url.searchParams.get("limit")) || 10));
  const page = Math.max(1, Math.floor(Number(url.searchParams.get("page")) || 1));
  const options = { limit, offset: (page - 1) * limit, search: url.searchParams.get("search") ?? "" };
  if (dimension === "event_prop") {
    const event = normalizeEventName(url.searchParams.get("event"));
    if (!event) return apiError(400, "dimension=event_prop needs event (the custom event name, e.g. event=Purchase).");
    const prop = (url.searchParams.get("prop") ?? "").trim() || null;
    const { rows, approximate, truncated } = await getPropertyBreakdown(q, event, prop, options);
    return apiJson({ ...meta, dimension, event, prop, page, limit, approximate, truncated, results: rows });
  }
  if (!isDimension(dimension)) return apiError(400, "Pass a valid dimension, e.g. page, source, country, browser, goal, event_prop.");
  const { rows, approximate } = await getBreakdownResult(q, dimension, options);
  return apiJson({ ...meta, dimension, page, limit, approximate, results: rows });
}
