import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CoreAcademyPage } from "@/components/core-academy-page";
import { CustomSiteRenderer } from "@/components/custom-site-renderer";
import { WebsiteRenderer } from "@/components/website/website-renderer";
import { loadAcademyEntryBySlug } from "@/lib/academy-entry";
import { loadCustomSiteBySlug } from "@/lib/custom-sites";
import { loadWebsiteBySlug } from "@/lib/website-builder";
import { portalTitle } from "@/lib/metadata";

interface PortalPageProps { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: PortalPageProps): Promise<Metadata> {
  const { slug } = await params;
  const customSite = await loadCustomSiteBySlug(slug);
  if (customSite) {
    return {
      ...portalTitle(customSite.title),
      description: customSite.description ?? customSite.portal.hero_subtitle,
    };
  }
  const website = await loadWebsiteBySlug(slug);
  if (website) {
    const home = website.pages.find((page) => page.is_home);
    return {
      ...portalTitle(home?.seo_title ?? website.portal.portal_name),
      description: home?.seo_description ?? website.portal.hero_subtitle,
    };
  }
  const entry = await loadAcademyEntryBySlug(slug);
  return {
    ...portalTitle(entry?.portal.portal_name ?? "Academy website"),
    description: entry?.portal.academy_description ?? undefined,
  };
}

export default async function PortalPage({ params }: PortalPageProps) {
  const { slug } = await params;
  const customSite = await loadCustomSiteBySlug(slug);
  if (customSite) return <CustomSiteRenderer site={customSite} />;
  const website = await loadWebsiteBySlug(slug);
  if (website) {
    const homeSlug = website.pages.find((page) => page.is_home)?.slug ?? "home";
    return <WebsiteRenderer currentPageSlug={homeSlug} data={website} />;
  }
  const entry = await loadAcademyEntryBySlug(slug);
  if (!entry || entry.portal.website_delivery_mode !== "core_page") notFound();
  return <CoreAcademyPage portal={entry.portal} />;
}
