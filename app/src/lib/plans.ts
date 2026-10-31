import "server-only";
import { getDb, now } from "./db";
import type { Plan } from "./db/schema";
import type { SessionUser } from "./auth/session";
import { getSettings } from "./settings";

export interface Entitlements {
  plan: Plan | null;
  /** True when the user has an active paid plan. */
  isPremium: boolean;
  /** Limits; 0 means unlimited. */
  maxSites: number;
  /** Pageviews + custom events per month. */
  maxMonthlyPageviews: number;
  /** Days raw events are kept; 0 = unlimited. */
  retentionDays: number;
  /** Stats REST API access. */
  allowApi: boolean;
  removeBranding: boolean;
  expiresAt: string | null;
}

/**
 * Limits used if no plan is marked as the free plan (the same as the default free plan).
 * Retention comes from Settings → Analytics (default 30 days, like the free plan).
 */
const FALLBACK_FREE = { maxSites: 1, maxMonthlyPageviews: 10_000, allowApi: false };

export async function getActivePlans(): Promise<Plan[]> {
  const db = await getDb();
  return db.selectFrom("plans").selectAll().where("is_active", "=", 1).orderBy("sort_order").orderBy("id").execute();
}

export async function getAllPlans(): Promise<Plan[]> {
  const db = await getDb();
  return db.selectFrom("plans").selectAll().orderBy("sort_order").orderBy("id").execute();
}

export async function getPlan(id: number): Promise<Plan | undefined> {
  const db = await getDb();
  return db.selectFrom("plans").selectAll().where("id", "=", id).executeTakeFirst();
}

export async function getFreePlan(): Promise<Plan | undefined> {
  const db = await getDb();
  return db.selectFrom("plans").selectAll().where("is_free", "=", 1).orderBy("id").executeTakeFirst();
}

export function hasActivePaidPlan(user: Pick<SessionUser, "plan_id" | "plan_expires_at"> | null): boolean {
  return Boolean(user?.plan_id && user.plan_expires_at && user.plan_expires_at > now());
}

function fromPlan(plan: Plan): Pick<Entitlements, "maxSites" | "maxMonthlyPageviews" | "retentionDays" | "allowApi" | "removeBranding"> {
  return {
    maxSites: plan.max_sites,
    maxMonthlyPageviews: plan.max_monthly_pageviews,
    retentionDays: plan.retention_days,
    allowApi: plan.allow_api === 1,
    removeBranding: plan.remove_branding === 1,
  };
}

export async function getEntitlements(user: Pick<SessionUser, "role" | "plan_id" | "plan_expires_at"> | null): Promise<Entitlements> {
  // Administrators run the platform, so their own websites are never limited.
  if (user?.role === "admin") {
    return { plan: null, isPremium: true, maxSites: 0, maxMonthlyPageviews: 0, retentionDays: 0, allowApi: true, removeBranding: true, expiresAt: null };
  }
  if (user && hasActivePaidPlan(user)) {
    const plan = await getPlan(user.plan_id!);
    if (plan && !plan.is_free) return { plan, isPremium: true, ...fromPlan(plan), expiresAt: user.plan_expires_at };
  }
  const free = await getFreePlan();
  const fallback = async () => ({ ...FALLBACK_FREE, retentionDays: Math.max(0, Math.floor((await getSettings()).default_retention_days || 0)), removeBranding: false });
  return {
    plan: free ?? null,
    isPremium: false,
    ...(free ? fromPlan(free) : await fallback()),
    expiresAt: null,
  };
}

/** True when `used` has reached a limit (0 = unlimited). */
export function atLimit(used: number, limit: number): boolean {
  return limit > 0 && used >= limit;
}

export function planFeatures(plan: Pick<Plan, "features">): string[] {
  return (plan.features ?? "")
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
}
