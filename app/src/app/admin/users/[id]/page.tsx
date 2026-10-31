import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader, Table, Td, Th } from "@/components/admin/ui";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { GATEWAY_LABELS } from "@/lib/payments";
import { getAllPlans, getEntitlements } from "@/lib/plans";
import { formatDate, formatMoney } from "@/lib/utils";
import { UserForm } from "../user-form";

export const metadata = { title: "Edit user" };

export default async function EditUserPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const [{ id }, { created }] = await Promise.all([params, searchParams]);
  const db = await getDb();
  const user = await db.selectFrom("users").selectAll().where("id", "=", Number(id)).executeTakeFirst();
  if (!user) notFound();
  const month = new Date().toISOString().slice(0, 7);
  const [me, plans, payments, siteCount, usage, entitlements] = await Promise.all([
    getCurrentUser(),
    getAllPlans(),
    db.selectFrom("payments").selectAll().where("user_id", "=", user.id).orderBy("id", "desc").limit(20).execute(),
    db.selectFrom("sites").select((eb) => eb.fn.countAll<number>().as("n")).where("user_id", "=", user.id).executeTakeFirst(),
    db.selectFrom("usage_monthly").select(["pageviews", "events"]).where("user_id", "=", user.id).where("month", "=", month).executeTakeFirst(),
    getEntitlements(user),
  ]);
  const sitesUsed = Number(siteCount?.n ?? 0);
  const monthUsed = Number(usage?.pageviews ?? 0) + Number(usage?.events ?? 0);
  const limit = (n: number) => (n ? n.toLocaleString() : "Unlimited");

  return (
    <>
      <PageHeader
        title={user.name}
        description={
          <>
            Joined {formatDate(user.created_at)}.{" "}
            <Link href="/admin/users" className="text-primary hover:underline">
              Back to users
            </Link>
          </>
        }
      />
      {created ? <Alert tone="success" className="mb-4">User created.</Alert> : null}
      <UserForm
        isSelf={me?.id === user.id}
        plans={plans.filter((p) => !p.is_free).map((p) => ({ id: p.id, name: p.name }))}
        user={{
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          planId: user.plan_id ?? 0,
          planExpires: user.plan_expires_at ? user.plan_expires_at.slice(0, 10) : "",
        }}
      />
      <Card
        title="Websites and usage"
        className="mt-6 max-w-3xl"
        actions={
          sitesUsed ? (
            <Link href={`/admin/sites?${new URLSearchParams({ q: user.email })}`} className="text-sm text-primary hover:underline">
              View websites
            </Link>
          ) : null
        }
      >
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted">Websites</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">
              {sitesUsed.toLocaleString()} <span className="text-sm font-normal text-muted">/ {limit(entitlements.maxSites)}</span>
            </dd>
          </div>
          <div>
            <dt className="text-muted">Pageviews + events this month</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">
              {monthUsed.toLocaleString()} <span className="text-sm font-normal text-muted">/ {limit(entitlements.maxMonthlyPageviews)}</span>
            </dd>
            {entitlements.maxMonthlyPageviews > 0 && monthUsed >= entitlements.maxMonthlyPageviews * 0.8 ? (
              <Badge tone={monthUsed >= entitlements.maxMonthlyPageviews ? "danger" : "warning"} className="mt-1">
                {Math.floor((monthUsed / entitlements.maxMonthlyPageviews) * 100)}% used
              </Badge>
            ) : null}
          </div>
          <div>
            <dt className="text-muted">Plan</dt>
            <dd className="mt-1 text-lg font-semibold">{user.role === "admin" ? "Administrator" : (entitlements.plan?.name ?? "Free")}</dd>
            <dd className="text-xs text-muted">Raw data kept: {entitlements.retentionDays ? `${entitlements.retentionDays} days` : "unlimited"}</dd>
          </div>
        </dl>
      </Card>
      <Card title="Payments" padded={false} className="mt-6 max-w-3xl">
        {payments.length ? (
          <Table minWidth={520}>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Method</Th>
                <Th>Amount</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <Td>{formatDate(p.created_at)}</Td>
                  <Td>{GATEWAY_LABELS[p.provider]}</Td>
                  <Td className="tabular-nums">{formatMoney(p.amount, p.currency)}</Td>
                  <Td>
                    <Badge tone={p.status === "paid" ? "success" : p.status === "pending" ? "warning" : "danger"} className="capitalize">
                      {p.status}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="p-5 text-sm text-muted">No payments.</p>
        )}
      </Card>
    </>
  );
}
