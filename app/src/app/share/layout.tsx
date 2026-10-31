import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BrandStyle } from "@/components/site/brand-style";
import { HtmlLang } from "@/components/site/html-lang";
import { I18nProvider } from "@/lib/i18n/client";
import { getClientMessages, getLocale } from "@/lib/i18n/server";
import { getSettings } from "@/lib/settings";
import { uploadUrl } from "@/lib/site";

// Public shared dashboards show live data.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  const favicon = uploadUrl(settings.favicon);
  return {
    robots: { index: false, follow: false },
    referrer: "no-referrer",
    icons: favicon ? { icon: favicon } : { icon: "/icon.svg" },
  };
}

export default async function ShareLayout({ children }: { children: ReactNode }) {
  const [settings, locale, messages] = await Promise.all([getSettings(), getLocale(), getClientMessages()]);
  return (
    <I18nProvider messages={messages}>
      <HtmlLang code={locale.code} dir={locale.dir} />
      <BrandStyle color={settings.primary_color} />
      <div dir={locale.dir} lang={locale.code} className="min-h-dvh bg-paper text-ink">
        {children}
      </div>
    </I18nProvider>
  );
}
