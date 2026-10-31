import "server-only";
import crypto from "node:crypto";
import type { Transaction } from "kysely";
import { getDb, now } from "./db";
import type { Database, Site } from "./db/schema";
import { normalizeSiteSettings, parseJson } from "@/analytics/normalize";
import type { SiteSettings } from "@/analytics/types";

/** A stored site with its settings parsed and validated. */
export interface SiteRecord {
  id: number;
  userId: number;
  name: string;
  domain: string;
  publicKey: string;
  timezone: string;
  settings: SiteSettings;
  shareToken: string | null;
  hasSharePassword: boolean;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toSiteRecord(row: Site): SiteRecord {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    domain: row.domain,
    publicKey: row.public_key,
    timezone: row.timezone,
    settings: normalizeSiteSettings(parseJson(row.settings)),
    shareToken: row.share_token,
    hasSharePassword: Boolean(row.share_password_hash),
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function randomToken(length: number): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.randomBytes(length), (b) => alphabet[b % alphabet.length]).join("");
}

/** Valid IANA time zone or "UTC". */
export function safeTimezone(tz: unknown): string {
  if (typeof tz !== "string" || !tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

export async function getUserSites(userId: number): Promise<SiteRecord[]> {
  const db = await getDb();
  return (await db.selectFrom("sites").selectAll().where("user_id", "=", userId).orderBy("id").execute()).map(toSiteRecord);
}

export async function countUserSites(userId: number): Promise<number> {
  const db = await getDb();
  const row = await db.selectFrom("sites").select((eb) => eb.fn.countAll<number>().as("n")).where("user_id", "=", userId).executeTakeFirst();
  return Number(row?.n ?? 0);
}

/** A site owned by `userId`, or undefined. Always use this for ids from user input (prevents IDOR). */
export async function getOwnedSite(siteId: number, userId: number): Promise<SiteRecord | undefined> {
  if (!Number.isInteger(siteId) || siteId < 1) return undefined;
  const db = await getDb();
  const row = await db.selectFrom("sites").selectAll().where("id", "=", siteId).where("user_id", "=", userId).executeTakeFirst();
  return row ? toSiteRecord(row) : undefined;
}

export async function getSite(siteId: number): Promise<SiteRecord | undefined> {
  const db = await getDb();
  const row = await db.selectFrom("sites").selectAll().where("id", "=", siteId).executeTakeFirst();
  return row ? toSiteRecord(row) : undefined;
}

export async function getSiteByKey(publicKey: string): Promise<SiteRecord | undefined> {
  if (!/^[A-Za-z0-9]{8,32}$/.test(publicKey)) return undefined;
  const db = await getDb();
  const row = await db.selectFrom("sites").selectAll().where("public_key", "=", publicKey).executeTakeFirst();
  return row ? toSiteRecord(row) : undefined;
}

export async function getSiteByShareToken(token: string): Promise<{ site: SiteRecord; passwordHash: string | null } | undefined> {
  if (!/^[A-Za-z0-9]{16,48}$/.test(token)) return undefined;
  const db = await getDb();
  const row = await db.selectFrom("sites").selectAll().where("share_token", "=", token).executeTakeFirst();
  return row ? { site: toSiteRecord(row), passwordHash: row.share_password_hash } : undefined;
}

export async function isDomainTaken(domain: string, userId: number, exceptSiteId?: number): Promise<boolean> {
  const db = await getDb();
  const row = await db
    .selectFrom("sites")
    .select("id")
    .where("domain", "=", domain)
    .where("user_id", "=", userId)
    .$if(exceptSiteId !== undefined, (qb) => qb.where("id", "!=", exceptSiteId!))
    .executeTakeFirst();
  return Boolean(row);
}

export async function createSite(userId: number, input: { name: string; domain: string; timezone: string }): Promise<number> {
  const db = await getDb();
  const ts = now();
  const result = await db
    .insertInto("sites")
    .values({
      user_id: userId,
      name: input.name.trim().slice(0, 120) || input.domain,
      domain: input.domain,
      public_key: randomToken(12),
      timezone: safeTimezone(input.timezone),
      settings: JSON.stringify(normalizeSiteSettings({})),
      share_token: null,
      share_password_hash: null,
      verified_at: null,
      created_at: ts,
      updated_at: ts,
    })
    .executeTakeFirstOrThrow();
  return Number(result.insertId);
}

export async function updateSite(siteId: number, input: { name?: string; domain?: string; timezone?: string; settings?: unknown }): Promise<void> {
  const db = await getDb();
  await db
    .updateTable("sites")
    .set({
      ...(input.name !== undefined ? { name: input.name.trim().slice(0, 120) } : {}),
      ...(input.domain !== undefined ? { domain: input.domain } : {}),
      ...(input.timezone !== undefined ? { timezone: safeTimezone(input.timezone) } : {}),
      ...(input.settings !== undefined ? { settings: JSON.stringify(normalizeSiteSettings(input.settings)) } : {}),
      updated_at: now(),
    })
    .where("id", "=", siteId)
    .execute();
}

/** Turn the public shared dashboard on (new token), off (null) or change its password (hash or null). */
export async function setSharing(siteId: number, input: { enabled: boolean; passwordHash?: string | null }): Promise<string | null> {
  const db = await getDb();
  const token = input.enabled ? randomToken(24) : null;
  await db
    .updateTable("sites")
    .set({ share_token: token, ...(input.passwordHash !== undefined ? { share_password_hash: input.passwordHash } : {}), updated_at: now() })
    .where("id", "=", siteId)
    .execute();
  return token;
}

/** settings row with the last local day rolled up for a site (see src/lib/rollups.ts). */
const rollupProgressKey = (siteId: number) => `rollup_until:${siteId}`;

/** Delete a site's statistics only (keeps the site and its settings). */
export async function resetSiteData(siteId: number): Promise<void> {
  const db = await getDb();
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("events").where("site_id", "=", siteId).execute();
    await trx.deleteFrom("rollup_daily").where("site_id", "=", siteId).execute();
    await trx.deleteFrom("settings").where("key", "=", rollupProgressKey(siteId)).execute();
    await trx.updateTable("sites").set({ verified_at: null, updated_at: now() }).where("id", "=", siteId).execute();
  });
}

/** Deletes a site and everything that belongs to it, inside the caller's transaction. */
export async function deleteSiteRows(trx: Transaction<Database>, siteId: number): Promise<void> {
  for (const table of ["events", "rollup_daily", "goals", "reports", "traffic_alerts"] as const) {
    await trx.deleteFrom(table).where("site_id", "=", siteId).execute();
  }
  await trx.updateTable("alert_log").set({ site_id: null }).where("site_id", "=", siteId).execute();
  await trx.deleteFrom("settings").where("key", "=", rollupProgressKey(siteId)).execute();
  await trx.deleteFrom("sites").where("id", "=", siteId).execute();
}

/** Delete a site and everything that belongs to it. */
export async function deleteSite(siteId: number): Promise<void> {
  const db = await getDb();
  await db.transaction().execute((trx) => deleteSiteRows(trx, siteId));
}
