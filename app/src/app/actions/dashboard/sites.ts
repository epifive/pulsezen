"use server";

import { redirect } from "next/navigation";
import { normalizeDomain, normalizeSiteSettings } from "@/analytics/normalize";
import { guardDashboard } from "@/lib/dashboard";
import { getT } from "@/lib/i18n/server";
import { forgetSite } from "@/lib/ingest";
import { plural } from "@/lib/i18n/messages";
import { atLimit } from "@/lib/plans";
import { getRealtimeVisitors } from "@/lib/realtime";
import { rebuildRollupsAfterTimezoneChange } from "@/lib/rollups";
import { countUserSites, createSite, deleteSite, getOwnedSite, isDomainTaken, resetSiteData, safeTimezone, updateSite } from "@/lib/sites";
import type { FormState } from "../types";
import { idOf, str } from "./helpers";

export async function createSiteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const guard = await guardDashboard();
  if (!guard.ok) return { error: guard.error };
  const t = await getT();
  const domain = normalizeDomain(str(formData.get("domain")));
  if (!domain) return { error: t("dash.err.domain") };
  const name = str(formData.get("name")).trim().slice(0, 120) || domain;
  const timezone = safeTimezone(str(formData.get("timezone")));
  const max = guard.entitlements.maxSites;
  if (atLimit(await countUserSites(guard.user.id), max)) return { error: plural(t, "dash.err.siteLimit", max) };
  if (await isDomainTaken(domain, guard.user.id)) return { error: t("dash.err.domainTaken") };
  const id = await createSite(guard.user.id, { name, domain, timezone });
  redirect(`/dashboard/sites/${id}/install?new=1`);
}

export async function saveSiteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const guard = await guardDashboard();
  if (!guard.ok) return { error: guard.error };
  const t = await getT();
  const site = await getOwnedSite(idOf(formData.get("site_id")), guard.user.id);
  if (!site) return { error: t("dash.err.siteNotFound") };
  const domain = normalizeDomain(str(formData.get("domain")));
  if (!domain) return { error: t("dash.err.domain") };
  if (domain !== site.domain && (await isDomainTaken(domain, guard.user.id, site.id))) return { error: t("dash.err.domainTaken") };
  const name = str(formData.get("name")).trim();
  if (!name || name.length > 120) return { error: t("dash.err.siteName") };
  const timezone = safeTimezone(str(formData.get("timezone")));
  await updateSite(site.id, { name, domain, timezone });
  // Days are local calendar days: summaries that can be rebuilt are rebuilt in the new time zone.
  if (timezone !== site.timezone) await rebuildRollupsAfterTimezoneChange(site.id, site.timezone, timezone);
  // The ingest endpoint caches sites for a few seconds: apply the change at once.
  forgetSite(site.publicKey);
  return { success: t("dash.settings.saved") };
}

export async function saveTrackingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const guard = await guardDashboard();
  if (!guard.ok) return { error: guard.error };
  const t = await getT();
  const site = await getOwnedSite(idOf(formData.get("site_id")), guard.user.id);
  if (!site) return { error: t("dash.err.siteNotFound") };
  const settings = normalizeSiteSettings({
    extraDomains: str(formData.get("extraDomains")),
    excludePaths: str(formData.get("excludePaths")),
    excludeIps: str(formData.get("excludeIps")),
    allowLocalhost: formData.get("allowLocalhost") === "on",
    hashRouting: formData.get("hashRouting") === "on",
  });
  await updateSite(site.id, { settings });
  forgetSite(site.publicKey);
  return { success: t("dash.settings.saved") };
}

export async function resetSiteDataAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const guard = await guardDashboard();
  if (!guard.ok) return { error: guard.error };
  const t = await getT();
  const site = await getOwnedSite(idOf(formData.get("site_id")), guard.user.id);
  if (!site) return { error: t("dash.err.siteNotFound") };
  await resetSiteData(site.id);
  forgetSite(site.publicKey);
  return { success: t("dash.settings.resetDone") };
}

export async function deleteSiteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const guard = await guardDashboard();
  if (!guard.ok) return { error: guard.error };
  const t = await getT();
  const site = await getOwnedSite(idOf(formData.get("site_id")), guard.user.id);
  if (!site) return { error: t("dash.err.siteNotFound") };
  if (str(formData.get("confirm")).trim().toLowerCase() !== site.domain) return { error: t("dash.err.confirmDomain") };
  await deleteSite(site.id);
  forgetSite(site.publicKey);
  redirect("/dashboard?deleted=1");
}

/** Install page polling: has the first event arrived? */
export async function checkInstallAction(siteId: number): Promise<{ verified: boolean; visitors: number }> {
  const guard = await guardDashboard({ allowInDemo: true });
  if (!guard.ok) return { verified: false, visitors: 0 };
  const site = await getOwnedSite(Number(siteId), guard.user.id);
  if (!site) return { verified: false, visitors: 0 };
  const visitors = await getRealtimeVisitors(site.id).catch(() => 0);
  return { verified: Boolean(site.verifiedAt) || visitors > 0, visitors };
}
