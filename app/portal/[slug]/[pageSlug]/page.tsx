import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WebsiteRenderer } from "@/components/website/website-renderer";
import { loadWebsiteBySlug } from "@/lib/website-builder";

interface WebsitePageProps {
  params: Promise<{ slug: string; pageSlug: string }>;
}

export async function generateMetadata({
  params,
}: WebsitePageProps): Promise<Metadata> {
  const { slug, pageSlug } = await params;
  const website = await loadWebsiteBySlug(slug, { pageSlug });
  if (!website) return { title: "Academy website" };
  const page = website.pages.find((entry) => entry.slug === pageSlug);
  return {
    title: page?.seo_title ?? `${page?.title} | ${website.portal.portal_name}`,
    description: page?.seo_description ?? page?.description,
  };
}

export default async function WebsitePage({ params }: WebsitePageProps) {
  const { slug, pageSlug } = await params;
  const website = await loadWebsiteBySlug(slug, { pageSlug });
  if (!website) notFound();
  return <WebsiteRenderer currentPageSlug={pageSlug} data={website} />;
}
