import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Globe } from "lucide-react";
import { Logo } from "@/components/site/logo";
import { ThemeToggle, type ThemeChoice } from "@/components/site/theme";
import { intParam } from "@/lib/dash-format";
import { getLocale, getT } from "@/lib/i18n/server";
import { getRealtimeVisitors } from "@/lib/realtime";
import { getSettings } from "@/lib/settings";
import { absoluteUrl, uploadUrl } from "@/lib/site";
import { loadSharedSite } from "@/lib/share";
import { parseStatsParams } from "@/lib/stats-url";
import { ShareUnlockForm } from "./share-unlock-form";
import { SiteStats } from "./site-stats";
import { StatsDetails } from "./stats-details";
import { findTab } from "./stats-tabs";

type Query = Record<string, string | string[] | undefined>;

/**
 * A public shared dashboard (/share/<token>, /share/<token>/embed for iframes, and their
 * /details pages): read-only stats, optional password, "Powered by" unless the owner's plan removes it.
 */
export async function SharedView({ token, query, embed, details = false }: { token: string; query: Query; embed: boolean; details?: boolean }) {
  const shared = await loadSharedSite(token);
  if (!shared) notFound();
  const [t, settings, locale] = await Promise.all([getT(), getSettings(), getLocale()]);
  const { site } = shared;
  const root = `/share/${token}`;
  const base = embed ? `${root}/embed` : root;
  const params = parseStatsParams(query);

  let body: ReactNode;
  if (!shared.unlocked) {
    body = (
      <div className="grid min-h-[60vh] place-items-center py-10">
        <ShareUnlockForm token={token} embed={embed} siteName={site.name} />
      </div>
    );
  } else if (details) {
    const tab = findTab(typeof query.tab === "string" ? query.tab : null) ?? findTab("page")!;
    body = (
      <StatsDetails
        site={site}
        params={params}
        tab={tab}
        page={intParam(query.page, 1, 200)}
        search={typeof query.search === "string" ? query.search.slice(0, 200) : ""}
        basePath={base}
        exportPath={`${root}/export`}
        locale={locale.code}
      />
    );
  } else {
    const realtime = await getRealtimeVisitors(site.id).catch(() => null);
    body = (
      <SiteStats
        site={site}
        params={params}
        basePath={base}
        dataUrl={`${root}/data`}
        realtimeUrl={`${root}/realtime`}
        realtimeNow={realtime}
        locale={locale.code}
        title={
          <div className="min-w-0">
            <h1 dir="auto" className="truncate text-2xl font-bold">
              {site.name}
            </h1>
            <p dir="ltr" className="text-start text-sm text-muted">
              {site.domain}
            </p>
          </div>
        }
      />
    );
  }

  const brandingUrl = settings.branding_url || absoluteUrl(settings, "/");
  const branding = shared.removeBranding ? null : (
    <a href={brandingUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary">
      {settings.branding_text || t("share.poweredBy", { name: settings.site_name })}
    </a>
  );

  if (embed) {
    return (
      <div className="px-3 py-4 sm:px-5">
        {body}
        {branding ? <div className="mt-6 flex justify-center">{branding}</div> : null}
      </div>
    );
  }

  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-8">
          {shared.removeBranding ? (
            <span className="inline-flex items-center gap-2 text-sm font-semibold">
              <Globe className="size-4 text-primary" aria-hidden />
              <span dir="ltr">{site.domain}</span>
            </span>
          ) : (
            <Logo siteName={settings.site_name} logo={uploadUrl(settings.logo)} logoDark={uploadUrl(settings.logo_dark)} href={brandingUrl} />
          )}
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-paper px-2.5 py-1 text-xs font-medium text-muted max-sm:hidden">{t("share.badge")}</span>
            <ThemeToggle defaultTheme={settings.default_theme as ThemeChoice} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">{body}</main>
      {branding ? <footer className="flex justify-center pb-8">{branding}</footer> : null}
    </>
  );
}

export async function sharedMetadata(token: string) {
  const [shared, t] = await Promise.all([loadSharedSite(token), getT()]);
  return { title: shared ? t("share.title", { name: shared.site.name }) : t("share.err.notFound"), robots: { index: false, follow: false } };
}
