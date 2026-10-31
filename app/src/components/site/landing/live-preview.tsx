import "server-only";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { countryName, formatCount, formatDuration, formatPct, valueLabel } from "@/components/dashboard/stats-format";
import type { Translator } from "@/lib/i18n/messages";
import { compareAggregate, getBreakdown, getTimeseries, resolvePeriod } from "@/lib/query";
import { getRealtimeVisitors } from "@/lib/realtime";
import { loadSharedSite } from "@/lib/share";
import { localDay } from "@/lib/stats-dates";
import { AI_SOURCES } from "@/lib/sources";
import { buttonClass } from "@/components/ui/button";
import { DashboardBody, type PreviewData } from "./dashboard-card";
import { DashboardFrame, exampleDashboard } from "./hero-mockup";
import { SectionHeading } from "./section-heading";

export interface Showcase {
  token: string;
  domain: string;
  online: number;
  period: string;
  data: PreviewData;
  empty: boolean;
}

/**
 * The public shared dashboard chosen in Admin → Settings → Analytics (`showcase_share_token`),
 * with real numbers for the last 30 days. Null when unset, invalid, password-protected or failing.
 */
export async function loadShowcase(token: string, t: Translator, locale: string): Promise<Showcase | null> {
  const clean = token.trim();
  if (!clean) return null;
  try {
    const shared = await loadSharedSite(clean);
    if (!shared || shared.hasPassword) return null;
    const { site } = shared;
    const range = resolvePeriod("30d", { timezone: site.timezone, locale });
    const q = { siteId: site.id, from: range.from, to: range.to, timezone: site.timezone, filters: [] };
    const [agg, series, pages, sources, countries, online] = await Promise.all([
      compareAggregate(q),
      getTimeseries(q, "day", { withVisits: false }),
      getBreakdown(q, "page", { limit: 5 }),
      getBreakdown(q, "source", { limit: 5 }),
      getBreakdown(q, "country", { limit: 5 }),
      getRealtimeVisitors(site.id).catch(() => 0),
    ]);
    const { current, change } = agg;
    const metric = t("dash.metric.visitors");
    // Today is still running: its partial count would make the line dive at the end.
    const today = localDay(new Date(), site.timezone);
    const finishedDays = series.filter((p) => p.date < today);
    return {
      token: clean,
      domain: site.domain,
      online,
      period: range.label,
      empty: current.pageviews === 0,
      data: {
        kpis: [
          { label: t("dash.metric.visitors"), value: formatCount(current.visitors, locale, true), change: change.visitors },
          { label: t("dash.metric.pageviews"), value: formatCount(current.pageviews, locale, true), change: change.pageviews },
          { label: t("dash.metric.bounceRate"), value: formatPct(current.bounceRate, locale), change: change.bounceRate, lowerIsBetter: true },
          { label: t("dash.metric.visitDuration"), value: formatDuration(current.visitDuration, t), change: change.visitDuration },
        ],
        series: finishedDays.map((p) => p.visitors),
        lists: [
          { title: t("home.mock.topPages"), metric, rows: pages.map((r) => ({ label: valueLabel("page", r.value, t, locale), value: r.visitors, ltr: true })) },
          {
            title: t("home.mock.topSources"),
            metric,
            rows: sources.map((r) => ({ label: valueLabel("source", r.value, t, locale), value: r.visitors, ai: AI_SOURCES.has(r.value) })),
          },
          {
            title: t("dash.dim.country"),
            metric,
            hideOnMobile: true,
            rows: countries.map((r) => ({ label: countryName(r.value, locale), value: r.visitors, country: r.value })),
          },
        ],
      },
    };
  } catch {
    return null;
  }
}

/** "See it live": the showcase site's real numbers, or example data when none is set. */
export function LivePreview({ t, live, locale }: { t: Translator; live: Showcase | null; locale: string }) {
  const href = live ? `/share/${live.token}` : null;
  const points = [t("home.livePoint1"), t("home.livePoint2"), t("home.livePoint3")];
  return (
    <section aria-labelledby="live-title" className="relative overflow-hidden border-y border-line bg-surface py-24 sm:py-28">
      <div aria-hidden className="mat-grid absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading
          id="live-title"
          align="center"
          eyebrow={t("home.liveEyebrow")}
          title={t("home.liveTitle")}
          text={live ? t("home.liveTextReal") : t("home.liveText")}
        />
        <ul className="mx-auto mt-9 grid max-w-5xl grid-cols-1 gap-x-8 gap-y-3 text-sm text-muted sm:grid-cols-3">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-2.5">
              <span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-text">
                <Check className="size-3" aria-hidden strokeWidth={3} />
              </span>
              <span className="leading-relaxed">{p}</span>
            </li>
          ))}
        </ul>

        <div className="relative mx-auto mt-14 max-w-6xl">
          <div aria-hidden className="absolute -inset-x-10 -inset-y-6 -z-10 rounded-[3rem] bg-gradient-to-b from-primary/20 via-amber-300/10 to-transparent blur-3xl" />
          <DashboardFrame
            domain={live?.domain ?? "example.com"}
            period={live?.period ?? t("home.mock.period")}
            online={live ? (live.online > 0 ? `${formatCount(live.online, locale)} ${t("home.liveOnline")}` : null) : t("home.mock.online", { n: 38 })}
            badge={
              <span
                className={
                  live
                    ? "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-semibold text-white max-[420px]:hidden"
                    : "inline-flex shrink-0 items-center rounded-full border border-line bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-muted max-[420px]:hidden"
                }
              >
                {live ? <span aria-hidden className="size-1.5 rounded-full bg-white" /> : null}
                {live ? t("home.liveBadge") : t("home.liveExample")}
              </span>
            }
          >
            {live?.empty ? (
              <p className="px-6 py-24 text-center text-muted">{t("home.liveEmpty")}</p>
            ) : (
              <DashboardBody
                data={live?.data ?? exampleDashboard(t, locale, true)}
                locale={locale}
                aiLabel={t("home.mock.ai")}
                chartLabel={t("home.mock.chart")}
                gradientId="pz-live-area"
                chartHeight={150}
                wide
              />
            )}
          </DashboardFrame>
        </div>

        {href ? (
          <div className="mt-10 flex justify-center">
            <Link href={href} prefetch={false} className={buttonClass("primary", "lg", "group shadow-lg shadow-primary/25")}>
              {t("home.liveOpen")}
              <ArrowRight aria-hidden className="transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
