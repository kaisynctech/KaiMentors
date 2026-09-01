import { headers } from "next/headers";
import {
  isPlatformHostname,
  normalizeRequestHostname,
} from "@/lib/domains/hostnames";
import { resolveWebsiteDomain } from "@/lib/domains/resolution";
import { createClient } from "@/lib/supabase/server";

export interface StudentAcademyContext {
  basePath: "/academy" | "/student";
  joinAcademyPath: string;
  portalId: string | null;
  portalSlug: string | null;
  querySuffix: string;
  accessModel: "verification" | "subscription";
  studentPortalFeatures: Record<string, boolean>;
}

interface PortalAccessRow {
  access_model: "verification" | "subscription";
  student_portal_features: Record<string, boolean> | null;
}

// MB-115: neither existing branch below queries `portals` directly — the custom-domain
// path only gets portal_id/portal_slug back from resolveWebsiteDomain(), and the platform
// path never resolves a portal row (portalId is always null there; each page joins to
// portals itself via student_applications). This helper does a small, additive lookup so
// callers can read the portal's access model without every page duplicating the query.
// Read is RLS-gated by the "published portals are public" policy — an unpublished portal
// (e.g. KSI pre-launch) safely falls back to the verification defaults below.
async function getPortalAccess(
  portalId: string | null,
  portalSlug: string | null,
): Promise<{ accessModel: "verification" | "subscription"; studentPortalFeatures: Record<string, boolean> }> {
  const fallback = { accessModel: "verification" as const, studentPortalFeatures: {} };
  if (!portalId && !portalSlug) return fallback;

  const supabase = await createClient();
  if (!supabase) return fallback;

  let query = supabase
    .from("portals")
    .select("access_model, student_portal_features")
    .abortSignal(AbortSignal.timeout(10000));
  query = portalId ? query.eq("id", portalId) : query.eq("slug", portalSlug as string);

  const { data } = await query.maybeSingle();
  const row = data as PortalAccessRow | null;
  if (!row) return fallback;

  return {
    accessModel: row.access_model,
    studentPortalFeatures: row.student_portal_features ?? {},
  };
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
    const portalId = resolution?.portal_id ?? null;
    const portalSlug = resolution?.portal_slug ?? null;
    const { accessModel, studentPortalFeatures } = await getPortalAccess(
      portalId,
      portalSlug,
    );
    return {
      basePath: "/academy",
      joinAcademyPath: "/join-academy",
      portalId,
      portalSlug,
      querySuffix: "",
      accessModel,
      studentPortalFeatures,
    };
  }

  const portalSlug = requestedPortalSlug?.trim() || null;
  const { accessModel, studentPortalFeatures } = await getPortalAccess(
    null,
    portalSlug,
  );
  return {
    basePath: "/student",
    joinAcademyPath: portalSlug
      ? `/portal/${encodeURIComponent(portalSlug)}/join-academy`
      : "/login",
    portalId: null,
    portalSlug,
    querySuffix: portalSlug ? `?portal=${encodeURIComponent(portalSlug)}` : "",
    accessModel,
    studentPortalFeatures,
  };
}

export async function getStudentBasePath() {
  return (await getStudentAcademyContext()).basePath;
}

export { getStudentLoginHref } from "@/lib/academy-routes";
