import "server-only";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function getMentorWorkspace() {
  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: memberships } = await supabase
    .from("trader_members")
    .select("trader_id, role, trader:traders(display_name)")
    .eq("user_id", user.id)
    .order("created_at");

  if (!memberships?.length) return null;

  // Resolve active workspace from cookie, falling back to earliest membership.
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

  return {
    supabase,
    user: user as User,
    membership,
    portal,
    traderId: membership.trader_id,
  };
}
