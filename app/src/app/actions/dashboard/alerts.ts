"use server";

import { revalidatePath } from "next/cache";
import { ownedChannelIds } from "@/lib/channels";
import { getDb, now } from "@/lib/db";
import { guardDashboard } from "@/lib/dashboard";
import { getT } from "@/lib/i18n/server";
import { getOwnedSite } from "@/lib/sites";
import type { TrafficAlertType } from "@/analytics/types";
import type { FormState } from "../types";
import { idOf, ids, str } from "./helpers";

const MAX_ALERTS_PER_SITE = 10;

/** Allowed thresholds per alert type: spike = × normal, drop = % of normal, silence = hours. */
const RANGES: Record<TrafficAlertType, [number, number]> = { spike: [2, 100], drop: [1, 99], silence: [1, 720] };

const pathOf = (siteId: number) => `/dashboard/sites/${siteId}/alerts`;

const isType = (v: string): v is TrafficAlertType => v === "spike" || v === "drop" || v === "silence";

/** A traffic alert of a site owned by `userId`, or undefined. */
async function ownedAlert(alertId: number, userId: number) {
  if (!Number.isInteger(alertId) || alertId < 1) return undefined;
  const db = await getDb();
  return db
    .selectFrom("traffic_alerts")
    .innerJoin("sites", "sites.id", "traffic_alerts.site_id")
    .selectAll("traffic_alerts")
    .where("traffic_alerts.id", "=", alertId)
    .where("sites.user_id", "=", userId)
    .executeTakeFirst();
}

/** Create (site_id) or update (alert_id) a traffic alert: type, threshold, channel_ids[]. */
export async function saveAlertAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const guard = await guardDashboard();
  if (!guard.ok) return { error: guard.error };
  const t = await getT();
  const editing = str(formData.get("alert_id")) !== "";
  const existing = editing ? await ownedAlert(idOf(formData.get("alert_id")), guard.user.id) : undefined;
  if (editing && !existing) return { error: t("dash.alerts.err.notFound") };

  const type = existing?.type ?? str(formData.get("type"));
  if (!isType(type)) return { error: t("dash.alerts.err.type") };
  const threshold = Number(str(formData.get("threshold")).trim());
  const [min, max] = RANGES[type];
  if (!Number.isInteger(threshold) || threshold < min || threshold > max) return { error: t(`dash.alerts.err.${type}`) };
  // Channel ids come from the browser: keep only the user's own channels.
  const channelIds = await ownedChannelIds(ids(formData.getAll("channel_ids")), guard.user.id);
  if (!channelIds.length) return { error: t("dash.alerts.err.channels") };
  const db = await getDb();

  if (existing) {
    await db
      .updateTable("traffic_alerts")
      .set({ threshold, channel_ids: JSON.stringify(channelIds), is_active: formData.get("active") === "on" ? 1 : 0 })
      .where("id", "=", existing.id)
      .execute();
    revalidatePath(pathOf(existing.site_id));
    return { success: t("dash.alerts.saved") };
  }

  const site = await getOwnedSite(idOf(formData.get("site_id")), guard.user.id);
  if (!site) return { error: t("dash.alerts.err.notFound") };
  const count = await db.selectFrom("traffic_alerts").select((eb) => eb.fn.countAll<number>().as("n")).where("site_id", "=", site.id).executeTakeFirst();
  if (Number(count?.n ?? 0) >= MAX_ALERTS_PER_SITE) return { error: t("dash.alerts.err.limit", { n: MAX_ALERTS_PER_SITE }) };
  await db
    .insertInto("traffic_alerts")
    .values({ site_id: site.id, type, threshold, channel_ids: JSON.stringify(channelIds), is_active: 1, last_triggered_at: null, created_at: now() })
    .execute();
  revalidatePath(pathOf(site.id));
  return { success: t("dash.alerts.created") };
}

export async function toggleAlertAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const guard = await guardDashboard();
  if (!guard.ok) return { error: guard.error };
  const t = await getT();
  const alert = await ownedAlert(idOf(formData.get("alert_id")), guard.user.id);
  if (!alert) return { error: t("dash.alerts.err.notFound") };
  const db = await getDb();
  await db.updateTable("traffic_alerts").set({ is_active: formData.get("active") === "1" ? 1 : 0 }).where("id", "=", alert.id).execute();
  revalidatePath(pathOf(alert.site_id));
  return {};
}

export async function deleteAlertAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const guard = await guardDashboard();
  if (!guard.ok) return { error: guard.error };
  const t = await getT();
  const alert = await ownedAlert(idOf(formData.get("alert_id")), guard.user.id);
  if (!alert) return { error: t("dash.alerts.err.notFound") };
  const db = await getDb();
  await db.deleteFrom("traffic_alerts").where("id", "=", alert.id).execute();
  revalidatePath(pathOf(alert.site_id));
  return { success: t("dash.alerts.deleted") };
}
