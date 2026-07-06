export type AcademyEntryDestination =
  | "home"
  | "join-academy"
  | "login"
  | "academy";

interface AcademyRouteContext {
  portalSlug: string;
  customDomain?: boolean;
}

export function getAcademyEntryHref(
  context: AcademyRouteContext,
  destination: AcademyEntryDestination,
) {
  const portalSlug = encodeURIComponent(context.portalSlug);

  if (context.customDomain) {
    if (destination === "home") return "/";
    if (destination === "academy") return "/academy";
    return `/${destination}`;
  }

  if (destination === "home") return `/portal/${portalSlug}`;
  if (destination === "academy") return `/student?portal=${portalSlug}`;
  return `/portal/${portalSlug}/${destination}`;
}

export function getAcademyWebsitePageHref(
  context: AcademyRouteContext,
  pagePath: string,
) {
  const normalizedPath = pagePath === "/" ? "" : `/${pagePath.replace(/^\/+/, "")}`;
  if (context.customDomain) return normalizedPath || "/";
  return `${getAcademyEntryHref(context, "home")}${normalizedPath}`;
}

export function getCustomSitePreviewPath(
  slug: string,
  isCustomDomainContext: boolean,
): string {
  return isCustomDomainContext ? "/" : `/portal/${slug}`;
}

export function getPublicSiteEntryHref(
  slug: string,
  primarySiteHostname: string | null,
  isCustomDomainContext: boolean,
): string {
  if (isCustomDomainContext) return "/";
  if (primarySiteHostname) return `https://${primarySiteHostname}`;
  return `/portal/${slug}`;
}
