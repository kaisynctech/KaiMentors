import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function getMentorWorkspace() {
  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id,role,trader:traders(display_name)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!membership) return null;

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
