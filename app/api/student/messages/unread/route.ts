import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const traderId = searchParams.get("traderId");
  if (!traderId) return NextResponse.json({ count: 0 });

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ count: 0 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ count: 0 });

  const { data } = await supabase
    .from("conversation_members")
    .select("last_read_at, conversation:conversations(last_message_at)")
    .eq("user_id", user.id)
    .eq("trader_id", traderId);

  const count = (data ?? []).filter((row) => {
    const conv = Array.isArray(row.conversation)
      ? row.conversation[0]
      : row.conversation;
    if (!conv?.last_message_at) return false;
    if (!row.last_read_at) return true;
    return new Date(conv.last_message_at) > new Date(row.last_read_at);
  }).length;

  return NextResponse.json({ count });
}
