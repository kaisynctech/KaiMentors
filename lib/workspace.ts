import "server-only";
import type { User } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  isPlatformHostname,
  normalizeRequestHostname,
} from "@/lib/domains/hostnames";

export async function getMentorWorkspace() {
  const supabase = await createClient();
  if (!supabase) return null;

  // getSession() decodes the JWT from cookies locally — no network call.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return null;
  const user = session.user as User;

  // Determine whether this request originates from a custom domain or the platform.
  const headersList = await headers();
  const hostname = normalizeRequestHostname(
    headersList.get("x-forwarded-host") ??
      headersList.get("host") ??
      "",
  );
  const isCustomDomain = hostname !== "" && !isPlatformHostname(hostname);

  if (isCustomDomain) {
    // Custom domain: the workspace is determined solely by which domain is hosting
    // this request. The km_workspace cookie is not present on this domain — ignore it.
    const { data: domainRow } = await supabase
      .from("website_domains")
      .select("trader_id")
      .eq("hostname", hostname)
      .eq("status", "active")
      .maybeSingle();

    if (!domainRow?.trader_id) return null;

    const { data: memberRow } = await supabase
      .from("trader_members")
      .select("trader_id, role, trader:traders(display_name, timezone)")
      .eq("user_id", user.id)
      .eq("trader_id", domainRow.trader_id)
      .maybeSingle();

    if (!memberRow) return null;

    const { data: portal } = await supabase
      .from("portals")
      .select("id,trader_id,slug,portal_name,is_published,custom_domain")
      .eq("trader_id", domainRow.trader_id)
      .maybeSingle();
    if (!portal) return null;

    const trader = Array.isArray(memberRow.trader)
      ? memberRow.trader[0]
      : (memberRow.trader as { display_name: string; timezone?: string } | null);

    return {
      supabase,
      user,
      membership: memberRow,
      portal,
      traderId: memberRow.trader_id,
      role: memberRow.role as "owner" | "mentor",
      displayName: trader?.display_name ?? "Mentor workspace",
      timezone: trader?.timezone ?? "UTC",
      customDomain: true as const,
    };
  }

  // Platform domain: resolve workspace from km_workspace cookie, falling back to
  // the oldest membership.
  const { data: memberships } = await supabase
    .from("trader_members")
    .select("trader_id, role, trader:traders(display_name, timezone)")
    .eq("user_id", user.id)
    .order("created_at");

  if (!memberships?.length) return null;

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get("km_workspace")?.value ?? null;
  const membership =
    (cookieValue ? memberships.find((m) => m.trader_id === cookieValue) : null) ??
    memberships[0];

  const { data: portal } = await supabase
    .from("portals")
    .select("id,trader_id,slug,portal_name,is_published,custom_domain")
    .eq("trader_id", membership.trader_id)
    .maybeSingle();
  if (!portal) return null;

  const trader = Array.isArray(membership.trader)
    ? membership.trader[0]
    : (membership.trader as { display_name: string; timezone?: string } | null);

  return {
    supabase,
    user,
    membership,
    portal,
    traderId: membership.trader_id,
    role: membership.role as "owner" | "mentor",
    displayName: trader?.display_name ?? "Mentor workspace",
    timezone: trader?.timezone ?? "UTC",
    customDomain: false as const,
  };
}
