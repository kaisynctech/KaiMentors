import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CustomSiteJoinPage } from "@/components/custom-site-join-page";
import { CoreAcademyPage } from "@/components/core-academy-page";
import { CustomSiteRenderer } from "@/components/custom-site-renderer";
import { WebsiteRenderer } from "@/components/website/website-renderer";
import {
  loadCustomSiteByResolution,
  loadCustomSiteJoinByResolution,
} from "@/lib/custom-sites";
import { resolveWebsiteDomain } from "@/lib/domains/resolution";
import { loadWebsiteBySlug } from "@/lib/website-builder";
import { loadAcademyEntryByResolution } from "@/lib/academy-entry";
import { portalTitle } from "@/lib/metadata";

interface CustomDomainWebsitePageProps {
  params: Promise<{ hostname: string; path?: string[] }>;
}

async function loadCustomDomainWebsite(
  hostname: string,
  path: string[] | undefined,
) {
  if (path && path.length > 1) return null;
  const resolution = await resolveWebsiteDomain(hostname);
  if (!resolution) return null;

  if (path?.[0] === "join-academy") {
    const joinData = await loadCustomSiteJoinByResolution(resolution);
    if (joinData) return { resolution, joinData, pageSlug: "join-academy" };
  }

  const customSite = await loadCustomSiteByResolution(resolution, path);
  if (customSite) {
    return {
      resolution,
      customSite,
      pageSlug: path?.[0] ?? customSite.page.slug,
    };
  }

  const pageSlug = path?.[0];
  const website = await loadWebsiteBySlug(resolution.portal_slug, { pageSlug });
  if (website) return { resolution, website, pageSlug };
  if (pageSlug) return null;
  const corePage = await loadAcademyEntryByResolution(resolution);
  if (!corePage || corePage.portal.website_delivery_mode !== "core_page") return null;
  return { resolution, corePage, pageSlug };
}

export async function generateMetadata({
  params,
}: CustomDomainWebsitePageProps): Promise<Metadata> {
  const { hostname, path } = await params;
  const result = await loadCustomDomainWebsite(hostname, path);
  if (!result) return portalTitle("Academy website");
  if ("joinData" in result && result.joinData) {
    return {
      ...portalTitle(`Join ${result.joinData.portal.portal_name}`),
      description: "Apply for private academy access.",
      alternates: {
        canonical: `https://${result.resolution.canonical_hostname}/join-academy`,
      },
    };
  }
  if ("customSite" in result && result.customSite) {
    return {
      ...portalTitle(result.customSite.title),
      description: result.customSite.description,
      alternates: {
        canonical: `https://${result.resolution.canonical_hostname}${
          result.customSite.page.path === "/" ? "" : result.customSite.page.path
        }`,
      },
    };
  }
  if ("corePage" in result && result.corePage) {
    return {
      ...portalTitle(result.corePage.portal.portal_name),
      description: result.corePage.portal.academy_description ?? undefined,
    };
  }
  const page = result.pageSlug
    ? result.website.pages.find((entry) => entry.slug === result.pageSlug)
    : result.website.pages.find((entry) => entry.is_home);
  return {
    ...portalTitle(page?.seo_title ?? `${page?.title} | ${result.website.portal.portal_name}`),
    description:
      page?.seo_description ??
      page?.description ??
      result.website.portal.hero_subtitle,
    alternates: {
      canonical: `https://${result.resolution.canonical_hostname}${
        result.pageSlug ? `/${result.pageSlug}` : ""
      }`,
    },
  };
}

export default async function CustomDomainWebsitePage({
  params,
}: CustomDomainWebsitePageProps) {
  const { hostname, path } = await params;
  const result = await loadCustomDomainWebsite(hostname, path);
  if (!result) notFound();

  if (result.resolution.should_redirect) {
    redirect(
      `https://${result.resolution.canonical_hostname}${
        result.pageSlug ? `/${result.pageSlug}` : ""
      }`,
    );
  }

  if ("joinData" in result && result.joinData) {
    return <CustomSiteJoinPage customDomain data={result.joinData} />;
  }

  if ("customSite" in result && result.customSite) {
    return <CustomSiteRenderer customDomain site={result.customSite} />;
  }

  if ("corePage" in result && result.corePage) {
    return <CoreAcademyPage customDomain portal={result.corePage.portal} />;
  }

  const currentPageSlug =
    result.pageSlug ??
    result.website.pages.find((page) => page.is_home)?.slug ??
    "home";
  return (
    <WebsiteRenderer
      currentPageSlug={currentPageSlug}
      customDomain
      data={result.website}
    />
  );
}
