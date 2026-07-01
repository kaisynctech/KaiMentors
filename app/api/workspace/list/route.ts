import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ workspaces: [] });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ workspaces: [] }, { status: 401 });

  const { data } = await supabase
    .from("trader_members")
    .select("trader_id, role, trader:traders(display_name)")
    .eq("user_id", user.id)
    .order("created_at");

  const workspaces = (data ?? []).map((m) => ({
    traderId: m.trader_id,
    role: m.role,
    displayName: Array.isArray(m.trader)
      ? (m.trader[0]?.display_name ?? "Workspace")
      : ((m.trader as { display_name: string } | null)?.display_name ?? "Workspace"),
  }));

  const cookieStore = await cookies();
  const activeId = cookieStore.get("km_workspace")?.value ?? null;
  return NextResponse.json({ workspaces, activeId });
}
