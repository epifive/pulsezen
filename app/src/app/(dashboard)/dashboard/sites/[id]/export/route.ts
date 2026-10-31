import { getCurrentUser } from "@/lib/auth/session";
import { getOwnedSite } from "@/lib/sites";
import { statsCsv } from "@/lib/stats-routes";

export const dynamic = "force-dynamic";

/** CSV export: ?tab=page (or ?dimension=page) for a breakdown, nothing for the chart. Owner only. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in again.", { status: 401 });
  const site = await getOwnedSite(Number((await params).id), user.id);
  if (!site) return new Response("Not found.", { status: 404 });
  return statsCsv(site, new URL(request.url));
}
