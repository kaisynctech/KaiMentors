import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requirePlatformAdmin() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,full_name,email")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "super_admin") redirect("/dashboard");

  return {
    profile,
    supabase,
    user,
    userLabel: profile.full_name || profile.email || "Super Admin",
  };
}
