"use server";

import { normalizeEventName } from "@/analytics/normalize";
import { guardDashboard } from "@/lib/dashboard";
import { createGoal, deleteGoal, getSiteGoals, MAX_GOALS_PER_SITE, normalizeGoalPath, updateGoal } from "@/lib/goals";
import { getT } from "@/lib/i18n/server";
import type { Translator } from "@/lib/i18n/messages";
import { getOwnedSite } from "@/lib/sites";
import type { FormState } from "../types";
import { idOf, str } from "./helpers";

function readGoal(formData: FormData, t: Translator): { error: string } | { type: "pageview" | "event"; value: string; name: string } {
  const type = str(formData.get("type")) === "event" ? "event" : "pageview";
  const value = type === "event" ? normalizeEventName(str(formData.get("event"))) : normalizeGoalPath(str(formData.get("path")));
  if (!value) return { error: t(type === "event" ? "dash.err.goalEvent" : "dash.err.goalPath") };
  const name = str(formData.get("name")).trim().slice(0, 120) || (type === "event" ? value : t("dash.goals.visitName", { path: value }));
  return { type, value, name };
}

export async function createGoalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const guard = await guardDashboard();
  if (!guard.ok) return { error: guard.error };
  const t = await getT();
  const site = await getOwnedSite(idOf(formData.get("site_id")), guard.user.id);
  if (!site) return { error: t("dash.err.siteNotFound") };
  const goal = readGoal(formData, t);
  if ("error" in goal) return goal;
  const goals = await getSiteGoals(site.id);
  if (goals.length >= MAX_GOALS_PER_SITE) return { error: t("dash.err.goalLimit", { n: MAX_GOALS_PER_SITE }) };
  if (goals.some((g) => g.name.toLowerCase() === goal.name.toLowerCase())) return { error: t("dash.err.goalName") };
  await createGoal(site.id, goal);
  return { success: t("dash.goals.created") };
}

export async function updateGoalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const guard = await guardDashboard();
  if (!guard.ok) return { error: guard.error };
  const t = await getT();
  const site = await getOwnedSite(idOf(formData.get("site_id")), guard.user.id);
  if (!site) return { error: t("dash.err.siteNotFound") };
  const goalId = idOf(formData.get("goal_id"));
  const goals = await getSiteGoals(site.id);
  if (!goals.some((g) => g.id === goalId)) return { error: t("dash.err.goalNotFound") };
  const goal = readGoal(formData, t);
  if ("error" in goal) return goal;
  if (goals.some((g) => g.id !== goalId && g.name.toLowerCase() === goal.name.toLowerCase())) return { error: t("dash.err.goalName") };
  await updateGoal(site.id, goalId, goal);
  return { success: t("dash.goals.saved") };
}

export async function deleteGoalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const guard = await guardDashboard();
  if (!guard.ok) return { error: guard.error };
  const t = await getT();
  const site = await getOwnedSite(idOf(formData.get("site_id")), guard.user.id);
  if (!site) return { error: t("dash.err.siteNotFound") };
  await deleteGoal(site.id, idOf(formData.get("goal_id")));
  return { success: t("dash.goals.deleted") };
}
