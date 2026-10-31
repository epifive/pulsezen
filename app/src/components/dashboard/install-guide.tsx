"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { CircleCheck, Loader2 } from "lucide-react";
import { checkInstallAction } from "@/app/actions/dashboard/sites";
import { ButtonLink } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";
import { CopyButton, CopyField } from "./copy";
import { CodeBlock } from "./ui";

type Platform = "html" | "wordpress" | "shopify" | "wix" | "webflow" | "nextjs" | "gtm";

const PLATFORMS: Array<{ id: Platform; label: string; steps: MessageKey[] }> = [
  { id: "html", label: "HTML", steps: ["dash.install.html1", "dash.install.html2"] },
  { id: "wordpress", label: "WordPress", steps: ["dash.install.wp1", "dash.install.wp2", "dash.install.wp3"] },
  { id: "shopify", label: "Shopify", steps: ["dash.install.shopify1", "dash.install.shopify2", "dash.install.shopify3"] },
  { id: "wix", label: "Wix", steps: ["dash.install.wix1", "dash.install.wix2", "dash.install.wix3"] },
  { id: "webflow", label: "Webflow", steps: ["dash.install.webflow1", "dash.install.webflow2", "dash.install.webflow3"] },
  { id: "nextjs", label: "Next.js", steps: ["dash.install.next1", "dash.install.next2"] },
  { id: "gtm", label: "Google Tag Manager", steps: ["dash.install.gtm1", "dash.install.gtm2", "dash.install.gtm3"] },
];

/** Snippet, per-platform instructions and a live "waiting for the first visit" check. */
export function InstallGuide({
  siteId,
  scriptUrl,
  publicKey,
  domain,
  verified: initiallyVerified,
}: {
  siteId: number;
  scriptUrl: string;
  publicKey: string;
  domain: string;
  verified: boolean;
}) {
  const t = useT();
  const [platform, setPlatform] = useState<Platform>("html");
  const [verified, setVerified] = useState(initiallyVerified);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const snippet = `<script defer src="${scriptUrl}" data-site="${publicKey}"></script>`;
  const nextSnippet = `import Script from "next/script";\n\n// app/layout.tsx, inside <body>\n<Script defer src="${scriptUrl}" data-site="${publicKey}" strategy="afterInteractive" />`;
  const current = PLATFORMS.find((p) => p.id === platform)!;

  useEffect(() => {
    if (verified) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await checkInstallAction(siteId);
        if (!stopped && res.verified) {
          setVerified(true);
          return;
        }
      } catch {
        // Try again on the next tick.
      }
      if (!stopped) timer = setTimeout(poll, 5000);
    };
    timer = setTimeout(poll, 3000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [siteId, verified]);

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    let next = -1;
    if (e.key === (rtl ? "ArrowLeft" : "ArrowRight")) next = (i + 1) % PLATFORMS.length;
    else if (e.key === (rtl ? "ArrowRight" : "ArrowLeft")) next = (i - 1 + PLATFORMS.length) % PLATFORMS.length;
    if (next < 0) return;
    e.preventDefault();
    setPlatform(PLATFORMS[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="font-sans text-base font-semibold tracking-normal">{t("dash.install.step1")}</h2>
        <p className="mt-1 text-sm text-muted">{t("dash.install.snippetText")}</p>
        <CopyField value={snippet} label={t("dash.install.snippet")} multiline className="mt-4" />
        <p className="mt-2 text-xs text-muted">{t("dash.install.lightweight")}</p>
      </section>

      <section className="rounded-xl border border-line bg-surface">
        <div className="border-b border-line px-5 pt-4">
          <h2 className="font-sans text-base font-semibold tracking-normal">{t("dash.install.step2")}</h2>
          <div role="tablist" aria-label={t("dash.install.platforms")} className="-mb-px mt-3 flex gap-4 overflow-x-auto [scrollbar-width:none]">
            {PLATFORMS.map((p, i) => (
              <button
                key={p.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`pf-tab-${p.id}`}
                aria-selected={p.id === platform}
                aria-controls="pf-panel"
                tabIndex={p.id === platform ? 0 : -1}
                onClick={() => setPlatform(p.id)}
                onKeyDown={(e) => onTabKey(e, i)}
                className={cn(
                  "shrink-0 border-b-2 pb-2.5 text-sm font-medium whitespace-nowrap",
                  p.id === platform ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div id="pf-panel" role="tabpanel" aria-labelledby={`pf-tab-${platform}`} className="p-5">
          <ol className="list-decimal space-y-2 ps-5 text-sm">
            {current.steps.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ol>
          {platform === "nextjs" ? (
            <div className="relative mt-4">
              <CodeBlock>{nextSnippet}</CodeBlock>
              <CopyButton text={nextSnippet} className="absolute end-2 top-2" />
            </div>
          ) : null}
          <p className="mt-4 text-xs text-muted">
            {t("dash.install.spa")}{" "}
            <a href="#install-options" className="text-primary hover:underline">
              {t("dash.install.optionsLink")}
            </a>
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-5" aria-live="polite">
        <h2 className="font-sans text-base font-semibold tracking-normal">{t("dash.install.step3")}</h2>
        {verified ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/40">
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-900 dark:text-emerald-200">
              <CircleCheck className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              {t("dash.install.verified")}
            </p>
            <ButtonLink href={`/dashboard/sites/${siteId}`}>{t("dash.install.viewDashboard")}</ButtonLink>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-dashed border-line bg-paper p-4">
            <p className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="size-5 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
              {t("dash.install.waiting", { domain })}
            </p>
            <Link href={`/dashboard/sites/${siteId}`} className="text-sm font-medium text-muted hover:text-primary">
              {t("dash.install.skip")}
            </Link>
          </div>
        )}
      </section>

      <section id="install-options" className="rounded-xl border border-line bg-surface p-5">
        <h2 className="font-sans text-base font-semibold tracking-normal">{t("dash.install.optionsTitle")}</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {(
            [
              ["data-exclude=\"/admin/*\"", "dash.install.optExclude"],
              ["data-hash", "dash.install.optHash"],
              ["data-404", "dash.install.opt404"],
              ["data-outbound=\"false\"", "dash.install.optOutbound"],
              ["data-respect-dnt", "dash.install.optDnt"],
            ] as Array<[string, MessageKey]>
          ).map(([attr, key]) => (
            <li key={attr} className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
              <code dir="ltr" className="shrink-0 rounded bg-paper px-1.5 py-0.5 font-mono text-[12px]">
                {attr}
              </code>
              <span className="text-muted">{t(key)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
