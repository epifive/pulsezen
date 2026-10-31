import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AiTraffic } from "@/components/site/landing/ai-traffic";
import { Faq } from "@/components/site/landing/faq";
import { Features } from "@/components/site/landing/features";
import { FinalCta } from "@/components/site/landing/final-cta";
import { Hero, ProofStrip } from "@/components/site/landing/hero";
import { Install } from "@/components/site/landing/install";
import { LivePreview, loadShowcase } from "@/components/site/landing/live-preview";
import { PricingTeaser, type TeaserPlan } from "@/components/site/landing/pricing-teaser";
import { Privacy } from "@/components/site/landing/privacy";
import { PostCard } from "@/components/site/post-card";
import { getLatestPosts } from "@/lib/blog";
import { getT, localSetting } from "@/lib/i18n/server";
import { getActivePlans } from "@/lib/plans";
import { absoluteUrl, getSiteContext } from "@/lib/site";

export default async function HomePage() {
  const { settings, user, blogVisible, locale } = await getSiteContext();
  const t = await getT();
  const [heroTitle, heroSubtitle, posts, plans, showcase] = await Promise.all([
    localSetting(settings, "home_hero_title"),
    localSetting(settings, "home_hero_subtitle"),
    blogVisible ? getLatestPosts(3) : Promise.resolve([]),
    getActivePlans(),
    loadShowcase(settings.showcase_share_token, t, locale.code),
  ]);

  const signedIn = Boolean(user);
  const site = settings.site_name;
  const teaserPlans: TeaserPlan[] = plans.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    priceMonthly: p.price_monthly,
    isFree: p.is_free === 1,
    isFeatured: p.is_featured === 1,
    maxSites: p.max_sites,
    maxMonthlyPageviews: p.max_monthly_pageviews,
    retentionDays: p.retention_days,
  }));

  return (
    <>
      <Hero
        t={t}
        title={heroTitle}
        subtitle={heroSubtitle}
        signedIn={signedIn}
        demoHref={showcase ? `/share/${showcase.token}` : null}
        site={site}
        locale={locale.code}
      />
      {settings.show_stats_on_home ? <ProofStrip t={t} /> : null}
      <Features t={t} />
      <LivePreview t={t} live={showcase} locale={locale.code} />
      <AiTraffic t={t} site={site} locale={locale.code} />
      <Privacy t={t} site={site} locale={locale.code} />
      <Install t={t} site={site} scriptUrl={absoluteUrl(settings, "/pz.js")} />
      <PricingTeaser t={t} plans={teaserPlans} currency={settings.currency} locale={locale.code} />
      <Faq t={t} site={site} contact={settings.contact_enabled} />

      {posts.length ? (
        <section aria-labelledby="posts-title" className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="posts-title" className="text-3xl font-bold tracking-tight">
              {t("home.latestPosts")}
            </h2>
            <Link href="/blog" className="group inline-flex items-center gap-1.5 font-semibold text-primary-text hover:underline">
              {t("home.allPosts")}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" aria-hidden />
            </Link>
          </div>
          <ul className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <li key={post.id}>
                <PostCard post={post} readMore={t("blog.readMore")} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <FinalCta t={t} signedIn={signedIn} />
    </>
  );
}
