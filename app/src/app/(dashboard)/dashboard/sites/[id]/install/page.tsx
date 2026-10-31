import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { InstallGuide } from "@/components/dashboard/install-guide";
import { DashHeader } from "@/components/dashboard/ui";
import { loadSitePage } from "@/lib/dashboard-site";
import { getT } from "@/lib/i18n/server";
import { baseUrl } from "@/lib/request";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("dash.install.title") };
}

export default async function InstallPage({ params, searchParams }: Props) {
  const [{ id }, query, t] = await Promise.all([params, searchParams, getT()]);
  const { site } = await loadSitePage(id);
  const origin = await baseUrl();
  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/dashboard/sites/${site.id}/settings`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-primary">
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
        {t("dash.nav.settings")}
      </Link>
      <DashHeader
        title={query.new ? t("dash.install.titleNew", { name: site.name }) : t("dash.install.title")}
        description={t("dash.install.subtitle", { domain: site.domain })}
      />
      <InstallGuide siteId={site.id} scriptUrl={`${origin}/pz.js`} publicKey={site.publicKey} domain={site.domain} verified={Boolean(site.verifiedAt)} />
    </div>
  );
}
