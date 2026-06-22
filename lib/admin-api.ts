import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function requirePlatformAdminApi() {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return profile?.role === "super_admin" ? { supabase, user } : null;
}
