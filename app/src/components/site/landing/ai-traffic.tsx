import { Bot, Check, Info, TrendingUp } from "lucide-react";
import { formatPct } from "@/components/dashboard/stats-format";
import type { MessageKey, Translator } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";
import { SectionHeading } from "./section-heading";

const CHANNELS: Array<{ key: string; pct: number }> = [
  { key: "search", pct: 41 },
  { key: "direct", pct: 24 },
  { key: "ai", pct: 14 },
  { key: "social", pct: 10 },
  { key: "referral", pct: 7 },
  { key: "email", pct: 4 },
];

const ASSISTANTS: Array<[string, number, string]> = [
  ["ChatGPT", 2184, "bg-[#10a37f]"],
  ["Perplexity", 512, "bg-[#1f6f78]"],
  ["Gemini", 341, "bg-[#4f7df3]"],
  ["Claude", 228, "bg-[#d97757]"],
  ["Copilot", 163, "bg-[#2c7be5]"],
];

export function AiTraffic({ t, site, locale }: { t: Translator; site: string; locale: string }) {
  const points = [t("home.aiPoint1"), t("home.aiPoint2"), t("home.aiPoint3")];
  const maxAssistant = ASSISTANTS[0][1];
  return (
    <section id="ai-traffic" aria-labelledby="ai-title" className="scroll-mt-16 overflow-hidden py-24 sm:py-28">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
        <div>
          <SectionHeading id="ai-title" eyebrow={t("home.aiEyebrow")} title={t("home.aiTitle")} text={t("home.aiText", { site })} />
          <ul className="mt-8 space-y-3.5">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-violet-500/15 text-violet-700 dark:text-violet-300">
                  <Check className="size-3" aria-hidden strokeWidth={3} />
                </span>
                <span className="leading-relaxed">{p}</span>
              </li>
            ))}
          </ul>
          <p className="mt-7 flex items-start gap-2 text-sm leading-relaxed text-muted">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("home.aiNote")}
          </p>
        </div>

        <div className="relative lg:order-first">
          <div aria-hidden className="absolute -inset-8 -z-10 rounded-[3rem] bg-gradient-to-tr from-violet-500/15 via-primary/10 to-transparent blur-3xl" />
          <div className="grid items-start gap-4 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-[0_30px_60px_-40px_rgba(15,23,42,0.45)]">
              <p className="text-sm font-semibold">{t("home.aiCardTitle")}</p>
              <ul className="mt-4 space-y-2.5">
                {CHANNELS.map((c) => {
                  const ai = c.key === "ai";
                  return (
                    <li key={c.key} className={cn("rounded-lg", ai && "-mx-2 bg-violet-500/8 px-2 py-1.5 ring-1 ring-violet-500/25")}>
                      <div className="flex items-baseline justify-between gap-3 text-[13px]">
                        <span className={cn("flex min-w-0 items-center gap-1.5 truncate", ai ? "font-semibold text-violet-700 dark:text-violet-300" : "text-ink")}>
                          {ai ? <Bot className="size-3.5 shrink-0" aria-hidden /> : null}
                          {t(`dash.channel.${c.key}` as MessageKey)}
                        </span>
                        <bdi className="shrink-0 font-semibold tabular-nums">{formatPct(c.pct, locale)}</bdi>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line/70">
                        <div className={cn("h-full rounded-full", ai ? "bg-violet-500" : "bg-primary/70")} style={{ width: `${c.pct * 2}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="flex flex-col gap-4">
              <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-600 to-violet-800 p-5 text-white shadow-[0_30px_60px_-30px_rgba(109,40,217,0.7)]">
                <p className="text-sm font-medium text-white/75">{t("dash.channel.ai")}</p>
                <p className="mt-1 flex items-baseline gap-2">
                  <bdi className="font-display text-4xl font-bold tracking-tight tabular-nums">{(3428).toLocaleString(locale)}</bdi>
                  <span className="inline-flex items-center gap-0.5 rounded-md bg-white/15 px-1.5 py-0.5 text-xs font-semibold">
                    <TrendingUp className="size-3" aria-hidden />
                    <bdi dir="ltr">+64%</bdi>
                  </span>
                </p>
                <p className="mt-1 text-xs text-white/65">{t("home.aiGrowth")}</p>
                <svg viewBox="0 0 200 40" className="mt-4 h-10 w-full" preserveAspectRatio="none" aria-hidden>
                  <path
                    d="M0 34 C20 33 30 30 45 31 S70 26 85 27 S110 20 125 21 S150 12 165 13 S185 5 200 4"
                    fill="none"
                    stroke="white"
                    strokeOpacity="0.9"
                    strokeWidth="2"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              </div>

              <div className="rounded-2xl border border-line bg-surface p-5">
                <p className="text-sm font-semibold">{t("home.aiCardSources")}</p>
                <ul className="mt-3 space-y-2">
                  {ASSISTANTS.map(([name, value, tile]) => (
                    <li key={name} className="flex items-center gap-2.5 text-[13px]">
                      <span aria-hidden className={cn("grid size-5 shrink-0 place-items-center rounded-md text-[10px] font-bold text-white", tile)}>
                        {name[0]}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
                      <span aria-hidden className="h-1.5 w-12 overflow-hidden rounded-full bg-line/70 max-[380px]:hidden">
                        <span className="block h-full rounded-full bg-violet-500" style={{ width: `${(value / maxAssistant) * 100}%` }} />
                      </span>
                      <bdi className="w-11 shrink-0 text-end font-semibold tabular-nums">{value.toLocaleString(locale)}</bdi>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
