import { Activity, BellRing, Bot, Braces, Feather, Languages, Layers, Mail, Megaphone, Share2, ShieldCheck, Target } from "lucide-react";
import type { MessageKey, Translator } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";
import { SectionHeading } from "./section-heading";

const FEATURES: Array<{ icon: typeof Activity; key: string; accent?: string }> = [
  { icon: ShieldCheck, key: "privacy" },
  { icon: Feather, key: "script" },
  { icon: Activity, key: "realtime", accent: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400" },
  { icon: Bot, key: "ai", accent: "bg-violet-500/12 text-violet-700 dark:text-violet-300" },
  { icon: Target, key: "goals" },
  { icon: Megaphone, key: "utm" },
  { icon: Mail, key: "reports" },
  { icon: BellRing, key: "alerts" },
  { icon: Share2, key: "share" },
  { icon: Braces, key: "api" },
  { icon: Layers, key: "sites" },
  { icon: Languages, key: "lang" },
];

export function Features({ t }: { t: Translator }) {
  return (
    <section id="features" aria-labelledby="features-title" className="scroll-mt-16 py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading id="features-title" eyebrow={t("home.featuresEyebrow")} title={t("home.featuresTitle")} text={t("home.featuresText")} />
        <ul className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <li key={f.key} className="group relative bg-surface p-6 transition-colors hover:bg-paper/60 sm:p-7">
              <span
                className={cn(
                  "grid size-11 place-items-center rounded-xl ring-1 ring-inset ring-current/10 transition-transform group-hover:-translate-y-0.5 motion-reduce:group-hover:translate-y-0",
                  f.accent ?? "bg-primary-soft text-primary-text",
                )}
              >
                <f.icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-5 text-[17px] font-bold">{t(`home.f.${f.key}Title` as MessageKey)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{t(`home.f.${f.key}Text` as MessageKey)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
