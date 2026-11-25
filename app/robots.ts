import type { MetadataRoute } from "next";
import { academySitemapUrls, requestHostname } from "@/lib/seo";

// Each academy domain gets its own robots.txt pointing at its own sitemap.
// Private areas (dashboards, student portal, APIs, account flows) stay out
// of search results on every host.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const hostname = await requestHostname();
  const academyUrls = await academySitemapUrls(hostname);
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/admin",
        "/student",
        "/academy",
        "/api/",
        "/account-setup",
        "/recover",
        "/onboarding",
      ],
    },
    ...(academyUrls
      ? { sitemap: `${new URL(academyUrls[0]).origin}/sitemap.xml` }
      : {}),
  };
}
