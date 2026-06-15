import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { WebsiteRenderer } from "@/components/website/website-renderer";
import { resolveWebsiteDomain } from "@/lib/domains/resolution";
import { loadWebsiteBySlug } from "@/lib/website-builder";

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

  const pageSlug = path?.[0];
  const website = await loadWebsiteBySlug(resolution.portal_slug, { pageSlug });
  if (!website) return null;
  return { resolution, website, pageSlug };
}

export async function generateMetadata({
  params,
}: CustomDomainWebsitePageProps): Promise<Metadata> {
  const { hostname, path } = await params;
  const result = await loadCustomDomainWebsite(hostname, path);
  if (!result) return { title: "Academy website" };
  const page = result.pageSlug
    ? result.website.pages.find((entry) => entry.slug === result.pageSlug)
    : result.website.pages.find((entry) => entry.is_home);
  return {
    title: page?.seo_title ?? `${page?.title} | ${result.website.portal.portal_name}`,
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
