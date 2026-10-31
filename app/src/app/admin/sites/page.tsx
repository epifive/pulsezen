import Link from "next/link";
import { Search } from "lucide-react";
import { Card, EmptyState, PageHeader, Pagination, Table, Td, Th } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { getDb } from "@/lib/db";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Websites" };

const PER_PAGE = 25;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

export default async function AdminSitesPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const page = Math.max(1, Number(params.page) || 1);
  const db = await getDb();

  let query = db.selectFrom("sites").innerJoin("users", "users.id", "sites.user_id");
  if (q) {
    query = query.where((eb) => eb.or([eb("sites.name", "like", `%${q}%`), eb("sites.domain", "like", `%${q}%`), eb("users.email", "like", `%${q}%`)]));
  }
  const [total, rows] = await Promise.all([
    query.select((eb) => eb.fn.countAll<number>().as("n")).executeTakeFirst(),
    query
      .select(["sites.id", "sites.name", "sites.domain", "sites.timezone", "sites.verified_at", "sites.created_at", "users.id as user_id", "users.email"])
      .orderBy("sites.id", "desc")
      .limit(PER_PAGE)
      .offset((page - 1) * PER_PAGE)
      .execute(),
  ]);
  const ids = rows.map((r) => r.id);
  const since30 = daysAgo(30);
  const [views, lastEvents] = ids.length
    ? await Promise.all([
        db
          .selectFrom("rollup_daily")
          .select(["site_id", (eb) => eb.fn.sum<number>("pageviews").as("n")])
          .where("site_id", "in", ids)
          .where("dimension", "=", "total")
          .where("day", ">=", since30)
          .groupBy("site_id")
          .execute(),
        db
          .selectFrom("events")
          .select(["site_id", (eb) => eb.fn.max("ts").as("ts")])
          .where("site_id", "in", ids)
          .groupBy("site_id")
          .execute(),
      ])
    : [[], []];
  const viewsBySite = new Map(views.map((v) => [v.site_id, Number(v.n ?? 0)]));
  const lastBySite = new Map(lastEvents.map((e) => [e.site_id, e.ts as string | null]));
  const count = Number(total?.n ?? 0);
  const pages = Math.max(1, Math.ceil(count / PER_PAGE));
  const href = (p: number) => `/admin/sites?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <>
      <PageHeader title="Websites" description={`${count.toLocaleString()} website${count === 1 ? "" : "s"}`} />
      <Card padded={false}>
        <div className="border-b border-line p-4">
          <form className="relative w-full sm:max-w-xs" action="/admin/sites">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search name, domain or owner"
              aria-label="Search websites"
              className="h-9 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-sm focus:border-primary focus:outline-none"
            />
          </form>
        </div>
        {rows.length ? (
          <Table minWidth={820}>
            <thead>
              <tr>
                <Th>Website</Th>
                <Th>Owner</Th>
                <Th className="text-right">Pageviews (30 days)</Th>
                <Th>Last event</Th>
                <Th>Tracking</Th>
                <Th>Added</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const last = lastBySite.get(s.id) ?? null;
                return (
                  <tr key={s.id}>
                    <Td>
                      <p className="font-medium">{s.name}</p>
                      <p className="text-xs text-muted" dir="ltr">
                        {s.domain} · {s.timezone}
                      </p>
                    </Td>
                    <Td>
                      <Link href={`/admin/users/${s.user_id}`} className="hover:text-primary">
                        {s.email}
                      </Link>
                    </Td>
                    <Td className="text-right tabular-nums">{(viewsBySite.get(s.id) ?? 0).toLocaleString()}</Td>
                    <Td className="text-muted">{last ? formatDate(last, true) : "Never"}</Td>
                    <Td>{s.verified_at ? <Badge tone="success">Verified</Badge> : <Badge>Not installed</Badge>}</Td>
                    <Td className="text-muted">{formatDate(s.created_at)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No websites found">{q ? "Try a different search." : "Websites appear here when users add them."}</EmptyState>
        )}
        <Pagination page={page} pages={pages} href={href} />
      </Card>
      <p className="mt-3 text-xs text-muted">Pageviews come from the daily summaries, so today is not included.</p>
    </>
  );
}
