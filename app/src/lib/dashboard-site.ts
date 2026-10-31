import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { SessionUser } from "./auth/session";
import { getDb } from "./db";
import { requireDashboardUser } from "./dashboard";
import { getLocale } from "./i18n/server";
import { getOwnedSite, type SiteRecord } from "./sites";

/**
 * For pages under /dashboard/sites/[id]: the signed-in owner, the site (404 when it
 * belongs to someone else) and the interface locale. Deduplicated per request.
 */
export const loadSitePage = cache(async (rawId: string): Promise<{ user: SessionUser; site: SiteRecord; locale: string; dir: "ltr" | "rtl" }> => {
  const user = await requireDashboardUser();
  const id = Number(rawId);
  const site = Number.isInteger(id) ? await getOwnedSite(id, user.id) : undefined;
  if (!site) notFound();
  const locale = await getLocale();
  return { user, site, locale: locale.code, dir: locale.dir };
});

/** Pageviews + custom events counted this month (UTC month, as the ingest endpoint counts them). */
export async function getMonthlyUsage(userId: number): Promise<number> {
  const db = await getDb();
  const row = await db
    .selectFrom("usage_monthly")
    .select(["pageviews", "events"])
    .where("user_id", "=", userId)
    .where("month", "=", new Date().toISOString().slice(0, 7))
    .executeTakeFirst();
  return Number(row?.pageviews ?? 0) + Number(row?.events ?? 0);
}
