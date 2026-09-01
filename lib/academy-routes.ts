export type AcademyEntryDestination =
  | "home"
  | "join-academy"
  | "login"
  | "academy";

interface AcademyRouteContext {
  portalSlug: string;
  customDomain?: boolean;
}

export const PORTAL_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

export function isSafeInternalPath(
  value: string | null | undefined,
): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//")
  );
}

export function isPortalSlug(value: string | null | undefined): value is string {
  return typeof value === "string" && PORTAL_SLUG_PATTERN.test(value);
}

export function isFakeStudentLoginPath(pathname: string): boolean {
  return (
    pathname === "/student/login" ||
    pathname.startsWith("/student/login/") ||
    pathname === "/academy/login" ||
    pathname.startsWith("/academy/login/")
  );
}

export function isLoginPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    isFakeStudentLoginPath(pathname) ||
    /^\/portal\/[^/]+\/login\/?$/i.test(pathname)
  );
}

export function parsePortalSlugFromHref(
  href: string | null | undefined,
): string | null {
  if (!isSafeInternalPath(href)) return null;
  try {
    const url = new URL(href, "https://kaimentors.invalid");
    const fromQuery = url.searchParams.get("portal");
    if (isPortalSlug(fromQuery)) return fromQuery.toLowerCase();
    const fromPath = url.pathname.match(
      /^\/portal\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/|$)/i,
    );
    if (fromPath && isPortalSlug(fromPath[1])) return fromPath[1].toLowerCase();
  } catch {
    return null;
  }
  return null;
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

export function studentHomeHref(
  portalSlug: string,
  customDomain = false,
): string {
  return getAcademyEntryHref({ portalSlug, customDomain }, "academy");
}

export function getStudentLoginHref(context: {
  basePath: "/academy" | "/student";
  portalSlug: string | null;
}): string {
  if (context.basePath === "/academy") return "/login";
  if (context.portalSlug) {
    return getAcademyEntryHref(
      { portalSlug: context.portalSlug, customDomain: false },
      "login",
    );
  }
  return "/login";
}

export function withPortalQuery(href: string, portalSlug: string): string {
  const url = new URL(href, "https://kaimentors.invalid");
  url.searchParams.set("portal", portalSlug);
  const search = url.searchParams.toString();
  return search ? `${url.pathname}?${search}` : url.pathname;
}

export function honourStudentNext(
  next: string | null | undefined,
  portalSlug: string,
  customDomain: boolean,
): string | null {
  if (!isSafeInternalPath(next)) return null;
  let url: URL;
  try {
    url = new URL(next, "https://kaimentors.invalid");
  } catch {
    return null;
  }

  if (customDomain) {
    if (isFakeStudentLoginPath(url.pathname) || url.pathname === "/login") {
      return "/academy";
    }
    if (url.pathname === "/student" || url.pathname.startsWith("/student/")) {
      return url.pathname.replace(/^\/student/, "/academy") || "/academy";
    }
    if (url.pathname === "/academy" || url.pathname.startsWith("/academy/")) {
      return isFakeStudentLoginPath(url.pathname) ? "/academy" : url.pathname;
    }
    return null;
  }

  if (isFakeStudentLoginPath(url.pathname)) {
    return studentHomeHref(portalSlug, false);
  }
  if (url.pathname === "/student" || url.pathname.startsWith("/student/")) {
    const requested = url.searchParams.get("portal");
    if (requested && requested.toLowerCase() !== portalSlug.toLowerCase()) {
      return null;
    }
    return withPortalQuery(`${url.pathname}${url.search}`, portalSlug);
  }
  return null;
}

export function honourMentorNext(
  next: string | null | undefined,
): string | null {
  if (!isSafeInternalPath(next)) return null;
  let url: URL;
  try {
    url = new URL(next, "https://kaimentors.invalid");
  } catch {
    return null;
  }

  if (
    isLoginPath(url.pathname) ||
    url.pathname === "/student" ||
    url.pathname.startsWith("/student/") ||
    url.pathname === "/academy" ||
    url.pathname.startsWith("/academy/")
  ) {
    return null;
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export function getAcademyWebsitePageHref(
  context: AcademyRouteContext,
  pagePath: string,
) {
  const normalizedPath =
    pagePath === "/" ? "" : `/${pagePath.replace(/^\/+/, "")}`;
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
