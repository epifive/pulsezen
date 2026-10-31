import "server-only";
import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { getDb, now } from "./db";
import { getEntitlements } from "./plans";
import { getSiteByShareToken, type SiteRecord } from "./sites";

/**
 * Public shared dashboards (/share/<token>). With a password, a visitor who typed it
 * gets an httpOnly cookie scoped to /share/<token>, signed with the stored password hash:
 * changing the password (or turning sharing off) invalidates every cookie at once.
 */

const COOKIE = "pz_share";
const ACCESS_DAYS = 7;

function sign(token: string, passwordHash: string, exp: number): string {
  return crypto.createHmac("sha256", passwordHash).update(`share:${token}:${exp}`).digest("base64url");
}

async function isHttps(): Promise<boolean> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0].trim() === "https";
  return (h.get("origin") ?? h.get("referer") ?? "").startsWith("https://");
}

export async function grantShareAccess(token: string, passwordHash: string): Promise<void> {
  const exp = Date.now() + ACCESS_DAYS * 86_400_000;
  const secure = await isHttps();
  (await cookies()).set(COOKIE, `${exp}.${sign(token, passwordHash, exp)}`, {
    httpOnly: true,
    secure,
    // Shared dashboards are often embedded in other sites' iframes.
    sameSite: secure ? "none" : "lax",
    path: `/share/${token}`,
    expires: new Date(exp),
  });
}

export async function hasShareAccess(token: string, passwordHash: string): Promise<boolean> {
  const value = (await cookies()).get(COOKIE)?.value ?? "";
  const [expText, sig] = value.split(".");
  const exp = Number(expText);
  if (!sig || !Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = Buffer.from(sign(token, passwordHash, exp));
  const actual = Buffer.from(sig);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export interface SharedSite {
  site: SiteRecord;
  /** The visitor may see the stats (no password, or the right one was entered). */
  unlocked: boolean;
  hasPassword: boolean;
  /** The owner's plan hides the "Powered by" link. */
  removeBranding: boolean;
}

/** The site behind a share token, or undefined when the link is invalid or sharing is off. */
export async function loadSharedSite(token: string): Promise<SharedSite | undefined> {
  const found = await getSiteByShareToken(token);
  if (!found) return undefined;
  const db = await getDb();
  const owner = await db.selectFrom("users").select(["role", "plan_id", "plan_expires_at", "status"]).where("id", "=", found.site.userId).executeTakeFirst();
  if (!owner || owner.status !== "active") return undefined;
  const entitlements = await getEntitlements(owner);
  const hasPassword = Boolean(found.passwordHash);
  const unlocked = !found.passwordHash || (await hasShareAccess(token, found.passwordHash));
  return { site: found.site, unlocked, hasPassword, removeBranding: entitlements.removeBranding };
}

/** Sets (hash) or removes (null) the share password without changing the link. */
export async function setSharePassword(siteId: number, passwordHash: string | null): Promise<void> {
  const db = await getDb();
  await db.updateTable("sites").set({ share_password_hash: passwordHash, updated_at: now() }).where("id", "=", siteId).execute();
}
