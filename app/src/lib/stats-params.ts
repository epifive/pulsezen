import "server-only";
import { getDataStart, resolvePeriod, type ResolvedPeriod } from "./query";
import type { SiteRecord } from "./sites";
import type { StatsQuery } from "@/analytics/types";
import type { StatsParams } from "./stats-url";

export { parseStatsParams, statsSearch, type StatsParams } from "./stats-url";

/** The StatsQuery and resolved period of a site view. */
export async function buildStatsQuery(site: Pick<SiteRecord, "id" | "timezone">, params: StatsParams, locale?: string): Promise<{ q: StatsQuery; period: ResolvedPeriod }> {
  const since = params.period === "all" ? await getDataStart(site.id, site.timezone) : null;
  const period = resolvePeriod(params.period, { from: params.from, to: params.to, timezone: site.timezone, since, locale });
  return { q: { siteId: site.id, from: period.from, to: period.to, timezone: site.timezone, filters: params.filters }, period };
}
