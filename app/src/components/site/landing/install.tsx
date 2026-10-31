import { CodeXml, Tag } from "lucide-react";
import { CopyButton } from "@/components/dashboard/copy";
import type { Translator } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";
import { SectionHeading } from "./section-heading";

/** Platforms with a step-by-step guide in the dashboard's install screen. */
const PLATFORMS: Array<{ name: string; mark: string; tile: string; small?: boolean }> = [
  { name: "WordPress", mark: "W", tile: "bg-[#21759b]" },
  { name: "Shopify", mark: "S", tile: "bg-[#5e8e3e]" },
  { name: "Wix", mark: "Wix", tile: "bg-[#111] dark:bg-[#2b2b2b]", small: true },
  { name: "Webflow", mark: "W", tile: "bg-[#4353ff]" },
  { name: "Next.js", mark: "N", tile: "bg-black ring-1 ring-white/15" },
];

export function Install({ t, site, scriptUrl }: { t: Translator; site: string; scriptUrl: string }) {
  const steps = [
    { title: t("home.step1Title"), text: t("home.step1Text") },
    { title: t("home.step2Title"), text: t("home.step2Text") },
    { title: t("home.step3Title"), text: t("home.step3Text") },
  ];
  const snippet = `<script defer src="${scriptUrl}" data-site="YOUR_KEY"></script>`;

  return (
    <section id="install" aria-labelledby="install-title" className="scroll-mt-16 py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading id="install-title" align="center" eyebrow={t("home.installEyebrow")} title={t("home.installTitle")} text={t("home.installText", { site })} />

        <ol className="relative mt-14 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-6">
          <span aria-hidden className="absolute inset-x-[16%] top-6 hidden h-px bg-gradient-to-r from-transparent via-primary-line to-transparent md:block" />
          {steps.map((s, i) => (
            <li key={s.title} className="relative text-center">
              <span className="relative mx-auto grid size-12 place-items-center rounded-2xl border border-primary-line bg-surface font-display text-lg font-bold text-primary-text shadow-[0_10px_30px_-12px_var(--primary)]">
                <bdi>{i + 1}</bdi>
              </span>
              <h3 className="mt-5 text-lg font-bold">{s.title}</h3>
              <p className="mx-auto mt-2 max-w-[34ch] text-sm leading-relaxed text-muted">{s.text}</p>
            </li>
          ))}
        </ol>

        <div className="mx-auto mt-14 max-w-3xl">
          <div className="overflow-hidden rounded-2xl border border-[#2a201b] bg-[#17110e] shadow-[0_30px_70px_-35px_rgba(124,45,18,0.6)]">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
              <span className="flex items-center gap-2 text-xs font-medium text-white/60">
                <CodeXml className="size-4 text-orange-300" aria-hidden />
                {t("home.snippetLabel")}
              </span>
              <CopyButton text={snippet} variant="ghost" className="text-white/75! hover:bg-white/10! hover:text-white!" />
            </div>
            <pre dir="ltr" className="overflow-x-auto px-5 py-5 text-start font-mono text-[13px] leading-relaxed max-sm:break-all max-sm:whitespace-pre-wrap sm:text-sm">
              <code>
                <span className="text-white/45">&lt;</span>
                <span className="text-orange-300">script</span> <span className="text-sky-300">defer</span> <span className="text-sky-300">src</span>
                <span className="text-white/45">=</span>
                <span className="text-emerald-300">&quot;{scriptUrl}&quot;</span> <span className="text-sky-300">data-site</span>
                <span className="text-white/45">=</span>
                <span className="text-emerald-300">&quot;YOUR_KEY&quot;</span>
                <span className="text-white/45">&gt;&lt;/</span>
                <span className="text-orange-300">script</span>
                <span className="text-white/45">&gt;</span>
              </code>
            </pre>
          </div>
          <p className="mt-3 text-center text-sm text-muted">{t("home.snippetNote")}</p>
        </div>

        <div className="mt-12 flex flex-col items-center gap-4">
          <p className="text-xs font-semibold tracking-[0.14em] text-muted uppercase">{t("home.worksWith")}</p>
          <ul className="flex max-w-5xl flex-wrap justify-center gap-2.5">
            {PLATFORMS.map((p) => (
              <li key={p.name} className="flex items-center gap-2 rounded-full border border-line bg-surface py-1.5 ps-1.5 pe-3.5 text-sm font-semibold shadow-sm">
                <span aria-hidden className={cn("grid size-6 place-items-center rounded-full font-display font-bold text-white", p.small ? "text-[8px]" : "text-[11px]", p.tile)}>
                  {p.mark}
                </span>
                {p.name}
              </li>
            ))}
            <li className="flex items-center gap-2 rounded-full border border-line bg-surface py-1.5 ps-1.5 pe-3.5 text-sm font-semibold shadow-sm">
              <span aria-hidden className="grid size-6 place-items-center rounded-full bg-[#246fdb] text-white">
                <Tag className="size-3.5" />
              </span>
              Google Tag Manager
            </li>
            <li className="flex items-center gap-2 rounded-full border border-line bg-surface py-1.5 ps-1.5 pe-3.5 text-sm font-semibold shadow-sm">
              <span aria-hidden className="grid size-6 place-items-center rounded-full bg-primary text-white">
                <CodeXml className="size-3.5" />
              </span>
              {t("home.anyHtml")}
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
