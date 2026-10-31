"use server";

import { redirect } from "next/navigation";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { guardDashboard } from "@/lib/dashboard";
import { getT } from "@/lib/i18n/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { grantShareAccess, setSharePassword } from "@/lib/share";
import { getOwnedSite, getSiteByShareToken, setSharing } from "@/lib/sites";
import type { FormState } from "../types";
import { idOf, str } from "./helpers";

/** Turns the public dashboard on (new link) or off. */
export async function toggleSharingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const guard = await guardDashboard();
  if (!guard.ok) return { error: guard.error };
  const t = await getT();
  const site = await getOwnedSite(idOf(formData.get("site_id")), guard.user.id);
  if (!site) return { error: t("dash.err.siteNotFound") };
  const enable = formData.get("enable") === "1";
  if (enable && site.shareToken) return { success: t("dash.share.enabled") };
  await setSharing(site.id, enable ? { enabled: true } : { enabled: false, passwordHash: null });
  return { success: t(enable ? "dash.share.enabled" : "dash.share.disabled") };
}

/** A new secret link: the old one stops working. */
export async function regenerateShareLinkAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const guard = await guardDashboard();
  if (!guard.ok) return { error: guard.error };
  const t = await getT();
  const site = await getOwnedSite(idOf(formData.get("site_id")), guard.user.id);
  if (!site) return { error: t("dash.err.siteNotFound") };
  if (!site.shareToken) return { error: t("dash.share.off") };
  await setSharing(site.id, { enabled: true });
  return { success: t("dash.share.regenerated") };
}

/** Sets the optional password (empty + "remove" clears it). */
export async function setSharePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const guard = await guardDashboard();
  if (!guard.ok) return { error: guard.error };
  const t = await getT();
  const site = await getOwnedSite(idOf(formData.get("site_id")), guard.user.id);
  if (!site) return { error: t("dash.err.siteNotFound") };
  if (formData.get("remove") === "1") {
    await setSharePassword(site.id, null);
    return { success: t("dash.share.passwordRemoved") };
  }
  const password = str(formData.get("password"));
  if (password.length < 6 || password.length > 200) return { error: t("dash.err.sharePassword") };
  await setSharePassword(site.id, await hashPassword(password));
  return { success: t("dash.share.passwordSaved") };
}

/** Password form of a protected shared dashboard (public). */
export async function unlockShareAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const t = await getT();
  const token = str(formData.get("token"));
  const found = await getSiteByShareToken(token);
  if (!found || !found.passwordHash) return { error: t("share.err.notFound") };
  const ip = await clientIp();
  if (!rateLimit(`share-unlock:${ip}:${token}`, 10, 10 * 60_000)) return { error: t("share.err.tooMany") };
  if (!(await verifyPassword(str(formData.get("password")), found.passwordHash))) return { error: t("share.err.password") };
  await grantShareAccess(token, found.passwordHash);
  const embed = formData.get("embed") === "1";
  redirect(`/share/${token}${embed ? "/embed" : ""}`);
}
