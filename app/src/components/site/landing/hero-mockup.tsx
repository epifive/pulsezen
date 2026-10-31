import { Fragment, type ReactNode } from "react";
import { BellRing, Target } from "lucide-react";
import { countryName, formatDuration, formatPct } from "@/components/dashboard/stats-format";
import type { Translator } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";
import { exampleSeries } from "./chart";
import { DashboardBody, type PreviewData } from "./dashboard-card";

function compact(n: number, locale: string): string {
  try {
    return n.toLocaleString(locale, { notation: "compact", maximumFractionDigits: 1 });
  } catch {
    return n.toLocaleString("en");
  }
}

/** Example numbers for the hero illustration (and the live section when no showcase is set). */
export function exampleDashboard(t: Translator, locale: string, wide = false): PreviewData {
  const sources = {
    title: t("home.mock.topSources"),
    metric: t("dash.metric.visitors"),
    rows: [
      { label: "Google", value: 6412 },
      { label: "ChatGPT", value: 2184, ai: true },
      { label: t("dash.channel.direct"), value: 1960 },
      { label: "newsletter", value: 864, ltr: true },
      { label: "Perplexity", value: 512, ai: true },
    ],
  };
  const pages = {
    title: t("home.mock.topPages"),
    metric: t("dash.metric.visitors"),
    hideOnMobile: !wide,
    rows: [
      { label: "/", value: 8930, ltr: true },
      { label: "/pricing", value: 3215, ltr: true },
      { label: "/blog/cookieless-analytics", value: 2470, ltr: true },
      { label: "/features", value: 1388, ltr: true },
      { label: "/docs/install", value: 906, ltr: true },
    ],
  };
  const countries = {
    title: t("dash.dim.country"),
    metric: t("dash.metric.visitors"),
    hideOnMobile: true,
    rows: (
      [
        ["US", 7310],
        ["DE", 3120],
        ["GB", 2480],
        ["IN", 2096],
        ["FR", 1268],
      ] as const
    ).map(([code, value]) => ({ label: countryName(code, locale), value, country: code })),
  };
  return {
    kpis: [
      { label: t("dash.metric.visitors"), value: compact(24830, locale), change: 18 },
      { label: t("dash.metric.pageviews"), value: compact(71290, locale), change: 12 },
      { label: t("dash.metric.bounceRate"), value: formatPct(38, locale), change: -6, lowerIsBetter: true },
      { label: t("dash.metric.visitDuration"), value: formatDuration(161, t), change: 9 },
    ],
    series: exampleSeries(30, 680, 2),
    lists: wide ? [pages, sources, countries] : [sources, pages],
  };
}

/** Window chrome around a dashboard preview: traffic lights, domain, period and realtime count. */
export function DashboardFrame({
  domain,
  period,
  online,
  badge,
  children,
  className,
}: {
  domain: string;
  period: string;
  online: string | null;
  /** Shown after the domain ("Live data", "Example data"). */
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_40px_100px_-40px_rgba(124,45,18,0.55)] ring-1 ring-black/[0.02] dark:shadow-[0_40px_100px_-30px_rgba(0,0,0,0.9)]",
        className,
      )}
    >
      <div className="flex items-center gap-3 border-b border-line bg-paper/70 px-4 py-2.5">
        <span aria-hidden className="flex shrink-0 gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span dir="ltr" className="min-w-0 truncate font-display text-sm font-semibold">
          {domain}
        </span>
        {badge}
        <span className="ms-auto flex shrink-0 items-center gap-2">
          <span className="rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] font-medium text-muted max-[420px]:hidden">{period}</span>
          {online ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
              <span className="relative flex size-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/70 motion-reduce:animate-none" />
                <span className="relative size-1.5 rounded-full bg-emerald-500" />
              </span>
              {online}
            </span>
          ) : null}
        </span>
      </div>
      {children}
    </div>
  );
}

/** Shows `domain` inside a translated sentence as an isolated left-to-right run (stays readable in RTL). */
function IsolateDomain({ text, domain }: { text: string; domain: string }) {
  const parts = text.split(domain);
  if (parts.length === 1) return text;
  return parts.map((part, i) => (
    <Fragment key={i}>
      {part}
      {i < parts.length - 1 ? <bdi dir="ltr">{domain}</bdi> : null}
    </Fragment>
  ));
}

/** The hero illustration: an example dashboard with two notification cards floating around it. */
export function HeroMockup({ t, site, locale }: { t: Translator; site: string; locale: string }) {
  const data = exampleDashboard(t, locale);
  const toasts = [
    {
      icon: Target,
      tile: "bg-emerald-500",
      title: t("home.mock.goalTitle"),
      text: t("home.mock.goalText"),
      place: "-bottom-8 -start-10 xl:-start-16 [animation-delay:900ms]",
    },
    {
      icon: BellRing,
      tile: "bg-primary",
      title: t("home.mock.alertTitle"),
      text: t("home.mock.alertText"),
      // Anchored by its bottom edge: a longer (wrapped) translation grows upwards, not over the window.
      place: "bottom-[calc(100%+0.5rem)] -end-4 xl:-end-8 [animation-delay:1400ms]",
    },
  ];

  return (
    <div role="img" aria-label={t("home.mock.label", { site })} className="relative mx-auto w-full max-w-[640px] select-none">
      <div aria-hidden className="absolute -inset-8 -z-10 rounded-[3rem] bg-gradient-to-br from-primary/30 via-amber-400/15 to-transparent blur-3xl" />
      <DashboardFrame
        domain="example.com"
        period={t("home.mock.period")}
        online={t("home.mock.online", { n: 38 })}
        className="animate-tz-pop motion-reduce:animate-none"
      >
        <DashboardBody data={data} locale={locale} aiLabel={t("home.mock.ai")} chartLabel={t("home.mock.chart")} gradientId="pz-hero-area" animate />
      </DashboardFrame>

      {toasts.map((toast) => (
        <div
          key={toast.title}
          aria-hidden
          className={cn(
            "absolute z-10 hidden w-[300px] animate-[pz-toast_0.7s_cubic-bezier(0.2,0.9,0.3,1.2)_both] items-start gap-3 rounded-xl border border-line bg-surface/95 p-3 shadow-[0_18px_40px_-16px_rgba(15,23,42,0.35)] backdrop-blur motion-reduce:animate-none lg:flex dark:shadow-[0_18px_40px_-12px_rgba(0,0,0,0.8)]",
            toast.place,
          )}
        >
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg text-white", toast.tile)}>
            <toast.icon className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-start justify-between gap-2">
              {/* Wrap instead of truncating: an ellipsis would cut a Latin domain from the wrong end in RTL. */}
              <span dir="auto" className="line-clamp-2 min-w-0 text-start text-[13px] leading-snug font-semibold">
                <IsolateDomain text={toast.title} domain="example.com" />
              </span>
              <span className="shrink-0 pt-0.5 text-[10px] text-muted">{t("home.mock.now")}</span>
            </span>
            <span dir="auto" className="mt-0.5 line-clamp-2 block text-start text-[11px] leading-snug text-muted">
              <IsolateDomain text={toast.text} domain="example.com" />
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
