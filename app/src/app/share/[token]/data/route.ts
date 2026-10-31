import { loadSharedSite } from "@/lib/share";
import { breakdownJson } from "@/lib/stats-routes";

export const dynamic = "force-dynamic";

/** Breakdown tabs of a shared dashboard (needs the password cookie when the dashboard has one). */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const shared = await loadSharedSite((await params).token);
  if (!shared) return Response.json({ error: "Not found." }, { status: 404 });
  if (!shared.unlocked) return Response.json({ error: "Password required." }, { status: 401 });
  return breakdownJson(shared.site, new URL(request.url));
}
