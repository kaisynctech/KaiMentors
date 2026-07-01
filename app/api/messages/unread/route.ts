import { NextResponse } from "next/server";
import { getMentorWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const workspace = await getMentorWorkspace();
  if (!workspace) return NextResponse.json({ count: 0 });
  const { supabase, traderId } = workspace;
  const { data } = await supabase.rpc("get_unread_conversation_count", {
    p_trader_id: traderId,
  });
  return NextResponse.json({ count: Number(data ?? 0) });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { conversationId } = (await request.json().catch(() => ({}))) as { conversationId?: string };
  if (!conversationId) return NextResponse.json({ error: "conversationId required." }, { status: 400 });
  await supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
  return NextResponse.json({ ok: true });
}
