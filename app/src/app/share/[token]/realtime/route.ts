import { getRealtimeVisitors } from "@/lib/realtime";
import { loadSharedSite } from "@/lib/share";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

/** GET /share/<token>/realtime → { visitors } for the shared dashboard's live counter. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const shared = await loadSharedSite((await params).token);
  if (!shared) return Response.json({ error: "Not found." }, { status: 404, headers: noStore });
  if (!shared.unlocked) return Response.json({ error: "Password required." }, { status: 401, headers: noStore });
  return Response.json({ visitors: await getRealtimeVisitors(shared.site.id) }, { headers: noStore });
}
