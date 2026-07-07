import "server-only";
import { headers } from "next/headers";
import { isPlatformHostname, normalizeRequestHostname } from "@/lib/domains/hostnames";
import { resolveWebsiteDomain } from "@/lib/domains/resolution";
import { createAdminClient } from "@/lib/supabase/admin";

export interface PwaPortalBranding {
  portalName: string;
  portalSlug: string | null;
  primaryColor: string;
  startUrl: string;
  iconQuery: string;
  isCustomDomain: boolean;
}

function shortName(name: string) {
  const trimmed = name.trim();
  if (trimmed.length <= 12) return trimmed;
  return `${trimmed.slice(0, 11).trim()}…`;
}

async function loadPortalBySlug(slug: string | null) {
  if (!slug) return null;
  const admin = createAdminClient();
  if (!admin) return null;

  const { data } = await admin
    .from("portals")
    .select("portal_name, slug, primary_color")
    .eq("slug", slug)
    .maybeSingle();

  return data;
}

async function loadPortalByTraderId(traderId: string | null) {
  if (!traderId) return null;
  const admin = createAdminClient();
  if (!admin) return null;

  const { data } = await admin
    .from("portals")
    .select("portal_name, slug, primary_color")
    .eq("trader_id", traderId)
    .maybeSingle();

  return data;
}

export async function getPwaPortalBranding(
  request?: Request,
  requestedPortalSlug?: string | null,
): Promise<PwaPortalBranding> {
  const requestHeaders = await headers();
  const hostname = normalizeRequestHostname(
    requestHeaders.get("x-forwarded-host") ??
      requestHeaders.get("host") ??
      "localhost",
  );
  const url = request ? new URL(request.url) : null;
  const portalFromQuery =
    requestedPortalSlug ??
    url?.searchParams.get("portal") ??
    null;

  if (!isPlatformHostname(hostname)) {
    const resolution = await resolveWebsiteDomain(hostname);
    const portal = resolution
      ? await loadPortalByTraderId(resolution.trader_id)
      : null;

    return {
      portalName: portal?.portal_name ?? "Academy",
      portalSlug: portal?.slug ?? resolution?.portal_slug ?? null,
      primaryColor: portal?.primary_color ?? "#111315",
      startUrl: "/academy",
      iconQuery: portal?.slug ? `?portal=${encodeURIComponent(portal.slug)}` : "",
      isCustomDomain: true,
    };
  }

  const portal = await loadPortalBySlug(portalFromQuery);
  const portalSlug = portal?.slug ?? portalFromQuery;
  const query = portalSlug ? `?portal=${encodeURIComponent(portalSlug)}` : "";

  return {
    portalName: portal?.portal_name ?? "Academy",
    portalSlug,
    primaryColor: portal?.primary_color ?? "#111315",
    startUrl: `/student${query}`,
    iconQuery: query,
    isCustomDomain: false,
  };
}

export function getPwaManifestFields(branding: PwaPortalBranding) {
  return {
    name: branding.portalName,
    short_name: shortName(branding.portalName),
    description: `${branding.portalName} academy portal`,
    start_url: branding.startUrl,
    scope: "/",
    display: "standalone" as const,
    background_color: "#ffffff",
    theme_color: branding.primaryColor,
    icons: [
      {
        src: `/api/pwa/icon/192${branding.iconQuery}`,
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: `/api/pwa/icon/512${branding.iconQuery}`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  };
}
