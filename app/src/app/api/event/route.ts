import { handleEvent, preflightResponse } from "@/lib/ingest";
import { maybeLazyTick } from "@/lib/lazy-tick";

/**
 * Public event collection endpoint used by the tracking script (public/pz.js).
 *
 *   POST /api/event   body: TrackPayload (src/analytics/types.ts) as text/plain or JSON, max 2 KB
 *   -> 202 accepted (also for silently ignored bots / excluded traffic), no body
 *   -> 400 / 403 / 404 / 413 / 415 / 429 with { "error": "..." }
 *
 * CORS is open (Access-Control-Allow-Origin: *, no credentials): the page's hostname
 * is checked against the site's domains instead.
 *
 * Lazy mode: busy tracking also starts background ticks (at most one attempt every 15 s
 * per process, after the response), so jobs keep running without platform page views.
 */

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflightResponse();
}

export async function POST(request: Request) {
  const response = await handleEvent(request);
  maybeLazyTick();
  return response;
}
