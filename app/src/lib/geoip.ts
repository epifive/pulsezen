import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import type { CityResponse } from "mmdb-lib";

/**
 * Visitor location (country / region / city). Never stores the IP address.
 *
 * 1. Edge headers: Vercel (x-vercel-ip-*) or Cloudflare (cf-ipcountry, plus cf-region /
 *    cf-ipcity when "Add visitor location headers" is enabled). Not used for proxied
 *    requests (a first-party proxy on the customer's website): there the headers describe
 *    the proxy server, not the visitor.
 * 2. Optional .mmdb file (MaxMind GeoLite2 / DB-IP City or Country Lite) configured in
 *    Admin → Settings (`geoip_db_path`), looked up with the visitor's IP. Loaded lazily and
 *    cached; a missing or broken file just means no location.
 */

export interface Geo {
  country: string;
  region: string;
  city: string;
}

const EMPTY: Geo = { country: "", region: "", city: "" };

function decode(v: string | null): string {
  if (!v) return "";
  try {
    return decodeURIComponent(v).trim();
  } catch {
    return v.trim();
  }
}

function country(v: string | null): string {
  const c = (v ?? "").trim().toUpperCase();
  // XX = unknown, T1 = Tor, A1/A2 = anonymous proxy / satellite.
  return /^[A-Z]{2}$/.test(c) && !["XX", "T1", "A1", "A2", "EU", "AP"].includes(c) ? c : "";
}

export function geoFromHeaders(h: Headers): Geo | null {
  const vercel = country(h.get("x-vercel-ip-country"));
  if (vercel) {
    return { country: vercel, region: decode(h.get("x-vercel-ip-country-region")).slice(0, 80), city: decode(h.get("x-vercel-ip-city")).slice(0, 120) };
  }
  const cf = country(h.get("cf-ipcountry"));
  if (cf) return { country: cf, region: decode(h.get("cf-region")).slice(0, 80), city: decode(h.get("cf-ipcity")).slice(0, 120) };
  return null;
}

interface ReaderLike {
  get(ip: string): CityResponse | null;
}

const globalForGeo = globalThis as unknown as {
  __pulsezenGeo?: { file: string; reader: ReaderLike | null; checkedAt: number; loading: Promise<ReaderLike | null> | null };
};

/** Retry a missing / broken database file after this long. */
const RETRY_MS = 10 * 60_000;

async function getReader(file: string): Promise<ReaderLike | null> {
  let state = globalForGeo.__pulsezenGeo;
  if (!state || state.file !== file) {
    state = globalForGeo.__pulsezenGeo = { file, reader: null, checkedAt: 0, loading: null };
  }
  if (state.reader) return state.reader;
  if (state.loading) return state.loading;
  if (Date.now() - state.checkedAt < RETRY_MS) return null;
  const s = state;
  s.checkedAt = Date.now();
  s.loading = (async () => {
    try {
      const resolved = path.resolve(file);
      if (!resolved.toLowerCase().endsWith(".mmdb")) return null;
      const buffer = await fs.readFile(resolved);
      const { Reader } = await import("mmdb-lib");
      s.reader = new Reader<CityResponse>(buffer);
      return s.reader;
    } catch (err) {
      console.warn(`[pulsezen] GeoIP database not loaded (${file}):`, err instanceof Error ? err.message : err);
      return null;
    } finally {
      s.loading = null;
    }
  })();
  return s.loading;
}

/**
 * `proxied`: the visitor's IP came from X-Forwarded-For and differs from the connecting
 * address (the event was relayed by a proxy), so the platform's geo headers are ignored.
 */
export async function lookupGeo(h: Headers, ip: string, dbPath: string, options: { proxied?: boolean } = {}): Promise<Geo> {
  const fromHeaders = options.proxied ? null : geoFromHeaders(h);
  if (fromHeaders) return fromHeaders;
  if (!dbPath.trim() || !ip || ip === "unknown") return EMPTY;
  try {
    const reader = await getReader(dbPath.trim());
    const r = reader?.get(ip);
    if (!r) return EMPTY;
    const c = country(r.country?.iso_code ?? r.registered_country?.iso_code ?? null);
    if (!c) return EMPTY;
    return {
      country: c,
      region: (r.subdivisions?.[0]?.names?.en ?? "").slice(0, 80),
      city: (r.city?.names?.en ?? "").slice(0, 120),
    };
  } catch {
    return EMPTY;
  }
}
