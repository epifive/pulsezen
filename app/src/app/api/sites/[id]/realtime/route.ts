import { getCurrentUser } from "@/lib/auth/session";
import { getRealtimeVisitors } from "@/lib/realtime";
import { getOwnedSite } from "@/lib/sites";

/** GET /api/sites/{id}/realtime -> { visitors } (distinct visitors in the last 5 minutes). Owner only. */

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to view this site." }, { status: 401, headers: noStore });
  const site = await getOwnedSite(Number((await params).id), user.id);
  if (!site) return Response.json({ error: "Site not found." }, { status: 404, headers: noStore });
  return Response.json({ visitors: await getRealtimeVisitors(site.id) }, { headers: noStore });
}
