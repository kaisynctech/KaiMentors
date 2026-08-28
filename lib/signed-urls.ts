import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * MB-125: generate signed URLs for multiple storage paths in a single API
 * call instead of N sequential createSignedUrl round-trips. @supabase/
 * storage-js is at 2.108.1 in this project (confirmed via package.json
 * before writing this, well past the 2.4.0 version that added
 * createSignedUrls) so the bulk API is used directly -- no fallback to a
 * Promise.all of individual calls is needed.
 *
 * Deliberately a separate file from lib/storage.ts: getPortalBrandingUrl
 * there is imported by client components (e.g. portal-branding-form.tsx),
 * and this module needs a service-role-capable client plus a
 * "server-only" guard -- putting both in one file broke the client build
 * (found and fixed before starting on MB-125 proper: a prior uncommitted
 * edit had merged them, deleting getPortalBrandingUrl and adding
 * "server-only" to the same module, which fails to compile for every
 * client component that imports it).
 *
 * Returns a Map<path, signedUrl | null> -- a path that fails to sign (or
 * wasn't in the input, e.g. null/undefined filtered out) maps to null
 * rather than being absent, so callers can use `.get(path) ?? null`
 * uniformly without an extra has() check.
 */
export async function signedUrls(
  client: SupabaseClient,
  bucket: string,
  paths: (string | null | undefined)[],
  expiresIn = 3600,
): Promise<Map<string, string | null>> {
  const validPaths = [...new Set(paths.filter((p): p is string => !!p))];
  if (validPaths.length === 0) return new Map();

  const { data } = await client.storage.from(bucket).createSignedUrls(validPaths, expiresIn);
  const map = new Map<string, string | null>();
  (data ?? []).forEach((d) => {
    if (d.path) map.set(d.path, d.signedUrl ?? null);
  });
  return map;
}
