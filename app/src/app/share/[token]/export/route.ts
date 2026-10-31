import { loadSharedSite } from "@/lib/share";
import { statsCsv } from "@/lib/stats-routes";

export const dynamic = "force-dynamic";

/** CSV export from a shared dashboard. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const shared = await loadSharedSite((await params).token);
  if (!shared) return new Response("Not found.", { status: 404 });
  if (!shared.unlocked) return new Response("Password required.", { status: 401 });
  return statsCsv(shared.site, new URL(request.url));
}
