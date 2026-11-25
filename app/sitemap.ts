import type { MetadataRoute } from "next";
import { academySitemapUrls, requestHostname } from "@/lib/seo";

// On an academy's custom domain this lists that academy's public pages.
// The platform host has no public academy pages of its own to list.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const urls = await academySitemapUrls(await requestHostname());
  return (urls ?? []).map((url) => ({ url }));
}
