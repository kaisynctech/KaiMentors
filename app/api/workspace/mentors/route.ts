import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function getOwnerContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  traderId: string,
) {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return null;
  const user = session.user;
  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id, role")
    .eq("user_id", user.id)
    .eq("trader_id", traderId)
    .maybeSingle();
  if (!membership) return null;
  return { user, tid: membership.trader_id, role: membership.role as "owner" | "mentor" };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const traderId = searchParams.get("traderId") ?? "";
  if (!traderId) return NextResponse.json({ error: "traderId required." }, { status: 400 });

  const supabase = await createClient();
  const ctx = await getOwnerContext(supabase, traderId);
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data: members } = await supabase!
    .from("trader_members")
    .select("user_id, role, created_at")
    .eq("trader_id", ctx.tid)
    .order("created_at");

  const memberIds = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = memberIds.length
    ? await supabase!.from("profiles").select("id, full_name, email").in("id", memberIds)
    : { data: [] };

  const membersWithProfiles = (members ?? []).map((m) => ({
    ...m,
    profile: profiles?.find((p) => p.id === m.user_id) ?? null,
  }));

  return NextResponse.json({
    members: membersWithProfiles,
    callerRole: ctx.role,
  });
}
