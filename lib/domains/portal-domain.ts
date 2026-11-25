import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The live custom domain for an academy, or null if it has none.
 * Prefers the primary hostname; otherwise the first active one.
 */
export async function activeCustomDomainForPortalSlug(
  slug: string,
): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;

  const { data: portal } = await admin
    .from("portals")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!portal) return null;

  const { data: domains } = await admin
    .from("website_domains")
    .select("hostname,is_primary")
    .eq("portal_id", portal.id)
    .eq("status", "active")
    .order("is_primary", { ascending: false })
    .order("hostname", { ascending: true })
    .limit(1);

  return domains?.[0]?.hostname ?? null;
}

/**
 * Absolute URL on the academy's custom domain for a platform /portal/<slug>
 * request, or null when the academy has no live custom domain.
 */
export async function customDomainUrlForPortal(
  slug: string,
  path: string,
  search?: Record<string, string | undefined>,
): Promise<string | null> {
  const hostname = await activeCustomDomainForPortalSlug(slug);
  if (!hostname) return null;
  const url = new URL(path, `https://${hostname}`);
  for (const [key, value] of Object.entries(search ?? {})) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}
