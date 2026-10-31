import { ArrowDown, CookieIcon, EyeOff, Fingerprint, Lock, Scale, Server } from "lucide-react";
import type { Translator } from "@/lib/i18n/messages";
import { countryName } from "@/components/dashboard/stats-format";
import { SectionHeading } from "./section-heading";

const POINTS = [
  { icon: CookieIcon, title: "home.p1Title", text: "home.p1Text" },
  { icon: Fingerprint, title: "home.p2Title", text: "home.p2Text" },
  { icon: EyeOff, title: "home.p3Title", text: "home.p3Text" },
  { icon: Server, title: "home.p4Title", text: "home.p4Text" },
] as const;

/** Privacy promise on a dark panel, with a "what happens to a pageview" illustration. */
export function Privacy({ t, site, locale }: { t: Translator; site: string; locale: string }) {
  const incoming: Array<[string, string, boolean]> = [
    [t("home.hashIp"), "203.0.113.42", true],
    [t("home.hashUa"), "Mozilla/5.0 (Macintosh…)", true],
    [t("home.hashSalt"), "9f2c…e81a", false],
  ];
  const stored: Array<[string, string, boolean]> = [
    [t("home.hashId"), "a41f9c07d2", true],
    [t("dash.dim.page"), "/pricing", true],
    [t("dash.dim.source"), "Google", false],
    [t("dash.dim.country"), countryName("DE", locale), false],
    [t("dash.dim.device"), t("dash.device.desktop"), false],
  ];
  return (
    <section id="privacy" aria-labelledby="privacy-title" className="scroll-mt-16 px-4 sm:px-6">
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-[#1c1310] px-5 py-16 text-white ring-1 ring-white/5 sm:px-12 sm:py-20 dark:bg-[#170f0b]">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_top_right,black_10%,transparent_65%)]"
        />
        <div aria-hidden className="absolute -end-24 -top-32 size-[420px] rounded-full bg-primary/40 blur-[120px]" />
        <div aria-hidden className="absolute -bottom-40 -start-20 size-[360px] rounded-full bg-amber-500/15 blur-[120px]" />

        <div className="relative grid grid-cols-1 gap-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16">
          <div>
            <SectionHeading id="privacy-title" tone="inverted" eyebrow={t("home.privacyEyebrow")} title={t("home.privacyTitle")} text={t("home.privacyText", { site })} />
            <ul className="mt-10 grid grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-2">
              {POINTS.map((p) => (
                <li key={p.title}>
                  <span className="grid size-10 place-items-center rounded-xl bg-white/10 text-orange-300 ring-1 ring-white/10">
                    <p.icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 font-bold text-white">{t(p.title)}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/65">{t(p.text)}</p>
                </li>
              ))}
            </ul>
            <p className="mt-10 flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-relaxed text-white/70">
              <Scale className="mt-0.5 size-4 shrink-0 text-orange-300" aria-hidden />
              {t("home.privacyNote", { site })}
            </p>
          </div>

          <figure className="self-center rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur sm:p-6">
            <figcaption className="flex items-center gap-2 text-sm font-semibold text-white">
              <Lock className="size-4 text-orange-300" aria-hidden />
              {t("home.hashTitle")}
            </figcaption>

            <p className="mt-5 text-[11px] font-semibold tracking-[0.12em] text-white/50 uppercase">{t("home.hashIn")}</p>
            <dl className="mt-2 divide-y divide-white/10 rounded-xl border border-white/10 bg-black/20">
              {incoming.map(([label, value, discarded]) => (
                <div key={label} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                  <dt className="shrink-0 text-white/60">{label}</dt>
                  <dd className="flex min-w-0 items-center gap-2">
                    <span dir="ltr" className={discarded ? "truncate font-mono text-[12px] text-white/85 line-through decoration-white/30" : "truncate font-mono text-[12px] text-white/85"}>
                      {value}
                    </span>
                    <span className="shrink-0 rounded bg-white/10 px-1.5 py-px text-[10px] font-semibold text-white/60">
                      {discarded ? t("home.hashDiscarded") : t("home.hashDaily")}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>

            <div aria-hidden className="my-3 flex items-center justify-center gap-2 font-mono text-[11px] text-orange-300">
              <span className="h-px flex-1 bg-gradient-to-r from-transparent to-orange-300/40" />
              <span className="flex items-center gap-1.5 rounded-full border border-orange-300/30 bg-orange-300/10 px-2.5 py-1">
                <ArrowDown className="size-3" />
                SHA-256
              </span>
              <span className="h-px flex-1 bg-gradient-to-l from-transparent to-orange-300/40" />
            </div>

            <p className="text-[11px] font-semibold tracking-[0.12em] text-white/50 uppercase">{t("home.hashOut")}</p>
            <dl className="mt-2 divide-y divide-white/10 rounded-xl border border-orange-300/25 bg-orange-300/[0.06]">
              {stored.map(([label, value, mono]) => (
                <div key={label} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                  <dt className="shrink-0 text-white/60">{label}</dt>
                  <dd dir={mono ? "ltr" : undefined} className={mono ? "truncate font-mono text-[12px] text-orange-200" : "truncate font-medium text-white"}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </figure>
        </div>
      </div>
    </section>
  );
}
