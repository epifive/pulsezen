import { getCurrentUser } from "@/lib/auth/session";
import { getOwnedSite } from "@/lib/sites";
import { breakdownJson } from "@/lib/stats-routes";

export const dynamic = "force-dynamic";

/** Breakdown tabs loaded on demand by the site dashboard. Owner only. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  const site = await getOwnedSite(Number((await params).id), user.id);
  if (!site) return Response.json({ error: "Not found." }, { status: 404 });
  return breakdownJson(site, new URL(request.url));
}
