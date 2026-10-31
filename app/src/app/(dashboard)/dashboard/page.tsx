import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, Code2, Plus, Sparkles } from "lucide-react";
import { Sparkline } from "@/components/dashboard/charts";
import { AddSiteForm } from "@/components/dashboard/site-forms";
import { formatCount } from "@/components/dashboard/stats-format";
import { DashHeader, Panel } from "@/components/dashboard/ui";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { requireDashboardUser } from "@/lib/dashboard";
import { getLocale, getT } from "@/lib/i18n/server";
import { plural } from "@/lib/i18n/messages";
import { atLimit, getEntitlements } from "@/lib/plans";
import { getTimeseries, resolvePeriod } from "@/lib/query";
import { getRealtimeVisitors } from "@/lib/realtime";
import { getUserSites } from "@/lib/sites";
import { timezoneList } from "@/lib/stats-dates";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("dash.nav.overview") };
}

type Props = { searchParams: Promise<{ deleted?: string }> };

export default async function DashboardOverview({ searchParams }: Props) {
  const user = await requireDashboardUser();
  const [t, locale, sites, entitlements, query] = await Promise.all([getT(), getLocale(), getUserSites(user.id), getEntitlements(user), searchParams]);

  if (!sites.length) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">
            <Sparkles className="size-6" aria-hidden />
          </span>
          <h1 className="text-3xl font-bold">{t("dash.onboarding.title", { name: user.name.split(" ")[0] || user.name })}</h1>
          <p className="mx-auto mt-2 max-w-xl text-muted">{t("dash.onboarding.text")}</p>
        </div>
        <ol className="mb-6 grid gap-3 sm:grid-cols-3">
          {(["dash.onboarding.step1", "dash.onboarding.step2", "dash.onboarding.step3"] as const).map((key, i) => (
            <li key={key} className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4 text-sm">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-white">{i + 1}</span>
              <span className="pt-1">{t(key)}</span>
            </li>
          ))}
        </ol>
        <Panel title={t("dash.sites.add")} description={t("dash.sites.addText")}>
          <AddSiteForm timezones={timezoneList()} atLimit={false} />
        </Panel>
      </div>
    );
  }

  const cards = await Promise.all(
    sites.map(async (site) => {
      const period = resolvePeriod("7d", { timezone: site.timezone });
      const [series, now] = await Promise.all([
        getTimeseries({ siteId: site.id, from: period.from, to: period.to, timezone: site.timezone, filters: [] }, "day", { withVisits: false }),
        getRealtimeVisitors(site.id).catch(() => 0),
      ]);
      const total = series.reduce((sum, p) => sum + p.visitors, 0);
      return { site, series, now, total, today: series.at(-1)?.visitors ?? 0 };
    }),
  );
  const full = atLimit(sites.length, entitlements.maxSites);

  return (
    <>
      <DashHeader
        title={t("dash.overview.title")}
        description={plural(t, "dash.overview.count", sites.length, { n: sites.length })}
        actions={
          full ? (
            <ButtonLink href="/pricing" variant="outline">
              {t("dash.sites.upgrade")}
            </ButtonLink>
          ) : (
            <ButtonLink href="/dashboard/sites/new">
              <Plus aria-hidden />
              {t("dash.sites.add")}
            </ButtonLink>
          )
        }
      />
      {query.deleted ? (
        <Alert tone="success" className="mb-5">
          {t("dash.sites.deleted")}
        </Alert>
      ) : null}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ site, series, now, total, today }) => (
          <li key={site.id} className="group relative flex flex-col rounded-xl border border-line bg-surface p-5 transition-colors hover:border-primary-line">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-sm font-bold text-primary uppercase" aria-hidden>
                  {site.name.slice(0, 1)}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate font-sans text-base font-semibold tracking-normal">
                    <Link href={`/dashboard/sites/${site.id}`} className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none" dir="auto">
                      {site.name}
                    </Link>
                  </h2>
                  <p dir="ltr" className="truncate text-start text-xs text-muted">
                    {site.domain}
                  </p>
                </div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-paper px-2 py-0.5 text-xs font-medium" title={t("dash.overview.nowHint")}>
                <span className={now > 0 ? "size-2 rounded-full bg-emerald-500" : "size-2 rounded-full bg-line"} aria-hidden />
                {plural(t, "dash.overview.now", now, { n: formatCount(now, locale.code) })}
              </span>
            </div>
            {site.verifiedAt || total > 0 ? (
              <>
                <div className="mt-5 flex items-end justify-between gap-3">
                  <div>
                    <p className="font-display text-3xl font-bold tabular-nums">
                      <bdi>{formatCount(total, locale.code, true)}</bdi>
                    </p>
                    <p className="text-xs text-muted">{t("dash.overview.visitors7d")}</p>
                  </div>
                  <p className="text-end text-xs text-muted">
                    {t("dash.overview.today")} <bdi className="font-semibold text-ink tabular-nums">{formatCount(today, locale.code)}</bdi>
                  </p>
                </div>
                <Sparkline points={series.map((p) => p.visitors)} label={t("dash.overview.sparkline", { name: site.name })} className="mt-3 h-12" />
              </>
            ) : (
              <div className="mt-5 flex flex-1 flex-col justify-end">
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Code2 className="size-4" aria-hidden />
                  {t("dash.overview.notInstalled")}
                </p>
                <Link href={`/dashboard/sites/${site.id}/install`} className="relative z-10 mt-2 text-sm font-semibold text-primary hover:underline">
                  {t("dash.site.installCta")}
                </Link>
              </div>
            )}
          </li>
        ))}
        {!full ? (
          <li>
            <Link
              href="/dashboard/sites/new"
              className="flex h-full min-h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line p-5 text-sm font-medium text-muted transition-colors hover:border-primary-line hover:text-primary"
            >
              <span className="grid size-10 place-items-center rounded-full bg-paper">
                <Plus className="size-5" aria-hidden />
              </span>
              {t("dash.sites.add")}
            </Link>
          </li>
        ) : null}
      </ul>
      <p className="mt-6 flex items-center gap-2 text-xs text-muted">
        <BarChart3 className="size-3.5" aria-hidden />
        {t("dash.overview.note")}
      </p>
    </>
  );
}
