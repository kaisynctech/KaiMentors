import { headers } from "next/headers";
import {
  isPlatformHostname,
  normalizeRequestHostname,
} from "@/lib/domains/hostnames";
import { resolveWebsiteDomain } from "@/lib/domains/resolution";

export interface StudentAcademyContext {
  basePath: "/academy" | "/student";
  portalId: string | null;
  portalSlug: string | null;
  querySuffix: string;
}

export async function getStudentAcademyContext(
  requestedPortalSlug?: string | null,
): Promise<StudentAcademyContext> {
  const requestHeaders = await headers();
  const hostname = normalizeRequestHostname(
    requestHeaders.get("x-forwarded-host") ??
      requestHeaders.get("host") ??
      "localhost",
  );
  if (!isPlatformHostname(hostname)) {
    const resolution = await resolveWebsiteDomain(hostname);
    return {
      basePath: "/academy",
      portalId: resolution?.portal_id ?? null,
      portalSlug: resolution?.portal_slug ?? null,
      querySuffix: "",
    };
  }

  const portalSlug = requestedPortalSlug?.trim() || null;
  return {
    basePath: "/student",
    portalId: null,
    portalSlug,
    querySuffix: portalSlug ? `?portal=${encodeURIComponent(portalSlug)}` : "",
  };
}

export async function getStudentBasePath() {
  return (await getStudentAcademyContext()).basePath;
}
