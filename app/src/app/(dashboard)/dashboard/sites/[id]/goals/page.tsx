import type { Metadata } from "next";
import { FileText, Goal, MousePointerClick, Trash2 } from "lucide-react";
import { deleteGoalAction } from "@/app/actions/dashboard/goals";
import { ActionButton } from "@/components/dashboard/actions";
import { CopyButton } from "@/components/dashboard/copy";
import { GoalEdit, GoalForm } from "@/components/dashboard/goal-forms";
import { formatCount, formatPct } from "@/components/dashboard/stats-format";
import { CodeBlock, DashHeader, Empty, Panel } from "@/components/dashboard/ui";
import { loadSitePage } from "@/lib/dashboard-site";
import { getSiteGoals } from "@/lib/goals";
import { getT } from "@/lib/i18n/server";
import { getGoalConversions, resolvePeriod } from "@/lib/query";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("dash.goals.title") };
}

export default async function GoalsPage({ params }: Props) {
  const [{ id }, t] = await Promise.all([params, getT()]);
  const { site, locale } = await loadSitePage(id);
  const period = resolvePeriod("30d", { timezone: site.timezone });
  const [goals, conversions] = await Promise.all([
    getSiteGoals(site.id),
    getGoalConversions({ siteId: site.id, from: period.from, to: period.to, timezone: site.timezone, filters: [] }),
  ]);
  const byId = new Map(conversions.map((c) => [c.goalId, c]));
  const examples = [
    `pulsezen("Signup");`,
    `pulsezen("Signup", { props: { plan: "Pro" } });`,
    `pulsezen("Purchase", { revenue: { amount: 49.99, currency: "USD" } });`,
  ].join("\n");
  const cssExample = `<a href="/signup" class="pulsezen-event-name=Signup">Start free</a>`;

  return (
    <>
      <DashHeader title={t("dash.goals.title")} description={t("dash.goals.subtitle")} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Panel title={t("dash.goals.list")} description={t("dash.goals.listHint")} padded={false}>
            {goals.length ? (
              <ul className="divide-y divide-line">
                {goals.map((g) => {
                  const c = byId.get(g.id);
                  const Icon = g.type === "event" ? MousePointerClick : FileText;
                  return (
                    <li key={g.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-4">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary" aria-hidden>
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p dir="auto" className="font-medium">
                          {g.name}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {g.type === "event" ? t("dash.goals.typeEvent") : t("dash.goals.typePageview")}:{" "}
                          <code dir="ltr" className="rounded bg-paper px-1 py-0.5 font-mono text-[12px] text-ink">
                            {g.value}
                          </code>
                        </p>
                        <div className="mt-2">
                          <GoalEdit siteId={site.id} goal={{ id: g.id, type: g.type, value: g.value, name: g.name }} />
                        </div>
                      </div>
                      <div className="text-end">
                        <p className="font-semibold tabular-nums">
                          <bdi>{formatCount(c?.visitors ?? 0, locale)}</bdi>
                        </p>
                        <p className="text-xs text-muted">
                          {t("dash.goals.conversions30d")} · <bdi>{formatPct(c?.conversionRate ?? 0, locale, 1)}</bdi>
                        </p>
                      </div>
                      <ActionButton
                        action={deleteGoalAction}
                        fields={{ site_id: site.id, goal_id: g.id }}
                        variant="ghost"
                        label={t("dash.goals.delete", { name: g.name })}
                        confirmText={t("dash.goals.deleteConfirm", { name: g.name })}
                      >
                        <Trash2 aria-hidden />
                      </ActionButton>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty icon={<Goal />} title={t("dash.goals.emptyTitle")}>
                {t("dash.goals.emptyText")}
              </Empty>
            )}
          </Panel>

          <Panel title={t("dash.goals.howTitle")} description={t("dash.goals.howText")}>
            <div className="space-y-4 text-sm">
              <div>
                <p className="mb-2 font-medium">{t("dash.goals.howJs")}</p>
                <div className="relative">
                  <CodeBlock>{examples}</CodeBlock>
                  <CopyButton text={examples} className="absolute end-2 top-2" />
                </div>
              </div>
              <div>
                <p className="mb-2 font-medium">{t("dash.goals.howCss")}</p>
                <div className="relative">
                  <CodeBlock>{cssExample}</CodeBlock>
                  <CopyButton text={cssExample} className="absolute end-2 top-2" />
                </div>
              </div>
              <p className="text-muted">{t("dash.goals.howAuto")}</p>
            </div>
          </Panel>
        </div>
        <Panel title={t("dash.goals.addTitle")} className="lg:sticky lg:top-6">
          <GoalForm siteId={site.id} />
        </Panel>
      </div>
    </>
  );
}
