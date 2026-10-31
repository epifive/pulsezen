import "server-only";
import crypto from "node:crypto";
import { getDb } from "./db";

/**
 * Daily salts for the anonymous visitor hash. A new random salt is created for every
 * UTC day, so the same visitor gets an unrelated hash tomorrow and nobody (not even the
 * platform operator) can follow people across days. Salts older than yesterday are
 * deleted when a new day's salt is created (and again by the retention job); only the
 * current day's salt is needed for counting.
 */

const globalForSalts = globalThis as unknown as { __pulsezenSalts?: Map<string, Promise<string>> };
const cache = (globalForSalts.__pulsezenSalts ??= new Map());

/** "YYYY-MM-DD" (UTC) for a date. */
export function saltDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

async function loadOrCreate(day: string): Promise<string> {
  const db = await getDb();
  const existing = await db.selectFrom("salts").select("salt").where("day", "=", day).executeTakeFirst();
  if (existing) return existing.salt;
  const salt = crypto.randomBytes(32).toString("hex");
  try {
    await db.insertInto("salts").values({ day, salt }).execute();
    // A new day started: delete salts older than yesterday right away, so old visitor
    // hashes can't be recomputed even when no background jobs run.
    const yesterday = saltDay(new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000));
    await db.deleteFrom("salts").where("day", "<", yesterday).execute().catch(() => undefined);
    return salt;
  } catch {
    // Another process created it first (primary key conflict): use theirs.
    const row = await db.selectFrom("salts").select("salt").where("day", "=", day).executeTakeFirst();
    if (row) return row.salt;
    throw new Error(`Could not create the visitor salt for ${day}.`);
  }
}

/** The salt for a UTC day (get-or-create, cached in memory). */
export function getDailySalt(day = saltDay()): Promise<string> {
  let salt = cache.get(day);
  if (!salt) {
    salt = loadOrCreate(day);
    salt.catch(() => cache.delete(day));
    cache.set(day, salt);
    // Keep only today and yesterday in memory.
    for (const key of cache.keys()) if (key < saltDay(new Date(Date.now() - 2 * 86_400_000))) cache.delete(key);
  }
  return salt;
}

/** Anonymous visitor id: sha256(salt + ip + user agent + site), 32 hex characters. */
export function visitorHash(salt: string, ip: string, userAgent: string, siteId: number): string {
  return crypto.createHash("sha256").update(`${salt}${ip}${userAgent}${siteId}`).digest("hex").slice(0, 32);
}
