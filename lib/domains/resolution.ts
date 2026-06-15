import { createClient } from "@/lib/supabase/server";

export interface ResolvedWebsiteDomain {
  portal_id: string;
  trader_id: string;
  portal_slug: string;
  hostname: string;
  canonical_hostname: string;
  should_redirect: boolean;
}

export async function resolveWebsiteDomain(hostname: string) {
  const supabase = await createClient();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc("resolve_public_website_domain", {
    target_hostname: hostname,
  });
  if (error) return null;

  const result = Array.isArray(data) ? data[0] : data;
  return (result as ResolvedWebsiteDomain | undefined) ?? null;
}
