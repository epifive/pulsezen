import "server-only";
import { getDb, now } from "./db";

export interface GoalRecord {
  id: number;
  siteId: number;
  type: "pageview" | "event";
  /** Path pattern (* wildcard) for pageview goals, event name for event goals. */
  value: string;
  name: string;
  createdAt: string;
}

export const MAX_GOALS_PER_SITE = 50;

export async function getSiteGoals(siteId: number): Promise<GoalRecord[]> {
  const db = await getDb();
  const rows = await db.selectFrom("goals").selectAll().where("site_id", "=", siteId).orderBy("id").execute();
  return rows.map((r) => ({ id: r.id, siteId: r.site_id, type: r.type === "event" ? "event" : "pageview", value: r.value, name: r.name, createdAt: r.created_at }));
}

export async function createGoal(siteId: number, input: { type: "pageview" | "event"; value: string; name: string }): Promise<number> {
  const db = await getDb();
  const res = await db.insertInto("goals").values({ site_id: siteId, type: input.type, value: input.value, name: input.name, created_at: now() }).executeTakeFirstOrThrow();
  return Number(res.insertId);
}

export async function updateGoal(siteId: number, goalId: number, input: { type: "pageview" | "event"; value: string; name: string }): Promise<void> {
  const db = await getDb();
  await db.updateTable("goals").set({ type: input.type, value: input.value, name: input.name }).where("id", "=", goalId).where("site_id", "=", siteId).execute();
}

export async function deleteGoal(siteId: number, goalId: number): Promise<void> {
  const db = await getDb();
  await db.deleteFrom("goals").where("id", "=", goalId).where("site_id", "=", siteId).execute();
}

/** "/thank-you", "/blog/*" — a path pattern starting with "/" (empty when invalid). */
export function normalizeGoalPath(v: string): string {
  const value = v.trim().replace(/\s+/g, "");
  if (!value) return "";
  const path = value.startsWith("/") ? value : `/${value}`;
  return /^\/[^\s<>"']{0,199}$/.test(path) ? path : "";
}
