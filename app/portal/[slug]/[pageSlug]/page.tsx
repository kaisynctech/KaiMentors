import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomSiteJoinPage } from "@/components/custom-site-join-page";
import { CustomSiteRenderer } from "@/components/custom-site-renderer";
import { WebsiteRenderer } from "@/components/website/website-renderer";
import {
  loadCustomSiteBySlug,
  loadCustomSiteJoinBySlug,
} from "@/lib/custom-sites";
import { loadWebsiteBySlug } from "@/lib/website-builder";
import { portalTitle } from "@/lib/metadata";

interface WebsitePageProps {
  params: Promise<{ slug: string; pageSlug: string }>;
}

export async function generateMetadata({
  params,
}: WebsitePageProps): Promise<Metadata> {
  const { slug, pageSlug } = await params;
  if (pageSlug === "join-academy") {
    const joinData = await loadCustomSiteJoinBySlug(slug);
    if (joinData) {
      return {
        ...portalTitle(`Join ${joinData.portal.portal_name}`),
        description: "Apply for private academy access.",
      };
    }
  }
  const customSite = await loadCustomSiteBySlug(slug, [pageSlug]);
  if (customSite) {
    return {
      ...portalTitle(customSite.title),
      description: customSite.description,
    };
  }
  const website = await loadWebsiteBySlug(slug, { pageSlug });
  if (!website) return portalTitle("Academy website");
  const page = website.pages.find((entry) => entry.slug === pageSlug);
  return {
    ...portalTitle(page?.seo_title ?? `${page?.title} | ${website.portal.portal_name}`),
    description: page?.seo_description ?? page?.description,
  };
}

export default async function WebsitePage({ params }: WebsitePageProps) {
  const { slug, pageSlug } = await params;
  if (pageSlug === "join-academy") {
    const joinData = await loadCustomSiteJoinBySlug(slug);
    if (joinData) return <CustomSiteJoinPage data={joinData} />;
  }
  const customSite = await loadCustomSiteBySlug(slug, [pageSlug]);
  if (customSite) {
    return <CustomSiteRenderer site={customSite} />;
  }
  const website = await loadWebsiteBySlug(slug, { pageSlug });
  if (!website) notFound();
  return <WebsiteRenderer currentPageSlug={pageSlug} data={website} />;
}
