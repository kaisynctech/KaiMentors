import "server-only";
import { headers } from "next/headers";
import { loadCustomSiteByResolution } from "@/lib/custom-sites";
import {
  isPlatformHostname,
  normalizeRequestHostname,
} from "@/lib/domains/hostnames";
import { resolveWebsiteDomain } from "@/lib/domains/resolution";

/** Hostname of the current request, as the middleware sees it. */
export async function requestHostname() {
  const headerList = await headers();
  return normalizeRequestHostname(
    headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "",
  );
}

/**
 * Public pages of the academy served on this custom domain, as absolute URLs
 * on its canonical hostname. Null on the platform host or an unknown domain.
 */
export async function academySitemapUrls(hostname: string) {
  if (!hostname || isPlatformHostname(hostname)) return null;
  const resolution = await resolveWebsiteDomain(hostname);
  if (!resolution) return null;

  const origin = `https://${resolution.canonical_hostname}`;
  const paths = new Set<string>(["/"]);
  const site = await loadCustomSiteByResolution(resolution, []);
  // A page that reuses another page's file (for example /apply -> verify.html)
  // is an alias, not a separate page.
  const seenFiles = new Set<string>();
  for (const page of site?.package.manifest.pages ?? []) {
    if (seenFiles.has(page.file)) continue;
    seenFiles.add(page.file);
    paths.add(page.path);
  }
  paths.add("/join-academy");
  paths.add("/login");
  return [...paths].map((path) => `${origin}${path === "/" ? "" : path}`);
}
