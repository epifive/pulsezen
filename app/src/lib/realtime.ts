import "server-only";
import { getDb } from "./db";
import { pendingEvents } from "./ingest";

/** Window for "visitors right now". */
export const REALTIME_WINDOW_SEC = 5 * 60;

/**
 * Visitors on the site right now: distinct anonymous visitor hashes with an event in the
 * last 5 minutes, including events still waiting in this process's write queue.
 */
export async function getRealtimeVisitors(siteId: number): Promise<number> {
  const since = new Date(Date.now() - REALTIME_WINDOW_SEC * 1000).toISOString();
  const db = await getDb();
  const rows = await db
    .selectFrom("events")
    .select("session_hash")
    .distinct()
    .where("site_id", "=", siteId)
    .where("ts", ">=", since)
    .execute();
  const hashes = new Set(rows.map((r) => r.session_hash));
  for (const row of pendingEvents(siteId, since)) hashes.add(row.session_hash);
  return hashes.size;
}
