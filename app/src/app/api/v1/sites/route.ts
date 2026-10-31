import { apiGuard, apiJson } from "@/lib/stats-api";
import { getUserSites } from "@/lib/sites";

export const dynamic = "force-dynamic";

/** GET /api/v1/sites — the websites of the API key's owner. */
export async function GET(request: Request) {
  const guard = await apiGuard(request);
  if (!guard.ok) return guard.response;
  const sites = await getUserSites(guard.user.id);
  return apiJson({
    results: sites.map((s) => ({ id: s.id, name: s.name, domain: s.domain, timezone: s.timezone, created_at: s.createdAt, verified: Boolean(s.verifiedAt) })),
  });
}
