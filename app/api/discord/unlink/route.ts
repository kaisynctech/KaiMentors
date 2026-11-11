import { NextResponse } from "next/server";
import { SHARESWORLDWIDE_SLUG } from "@/lib/discord";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) return NextResponse.redirect(new URL("/dashboard/settings?tab=integration&discord=unavailable", origin));

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", origin));

  const { data: portal } = await admin
    .from("portals")
    .select("trader_id")
    .eq("slug", SHARESWORLDWIDE_SLUG)
    .maybeSingle();
  if (!portal?.trader_id) {
    return NextResponse.redirect(new URL("/dashboard/settings?tab=integration&discord=unavailable", origin));
  }

  const { data: membership } = await admin
    .from("trader_members")
    .select("user_id")
    .eq("trader_id", portal.trader_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership) {
    await admin.from("academy_discord_servers").delete().eq("trader_id", portal.trader_id);
    return NextResponse.redirect(new URL("/dashboard/settings?tab=integration&discord=unlinked", origin));
  }

  await admin
    .from("student_discord_links")
    .delete()
    .eq("trader_id", portal.trader_id)
    .eq("student_user_id", user.id);
  return NextResponse.redirect(new URL("/student?portal=bandi-shares&discord=unlinked", origin));
}
