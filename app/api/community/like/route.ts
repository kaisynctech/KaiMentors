import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  traderId:   z.string().uuid(),
  targetType: z.enum(["gallery_item", "trade_post"]),
  targetId:   z.string().uuid(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { traderId, targetType, targetId } = parsed.data;

  const { data: membership } = await supabase
    .from("student_applications")
    .select("id")
    .eq("student_user_id", user.id)
    .eq("trader_id", traderId)
    .limit(1)
    .maybeSingle();

  const { data: mentorMembership } = await supabase
    .from("trader_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("trader_id", traderId)
    .maybeSingle();

  if (!membership && !mentorMembership) {
    return NextResponse.json({ error: "Not a member of this academy." }, { status: 403 });
  }

  const { data: existing } = await supabase
    .from("community_likes")
    .select("id")
    .eq("user_id", user.id)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .maybeSingle();

  if (existing) {
    await supabase.from("community_likes").delete().eq("id", existing.id);
    return NextResponse.json({ liked: false });
  }

  await supabase.from("community_likes").insert({
    user_id:     user.id,
    trader_id:   traderId,
    target_type: targetType,
    target_id:   targetId,
  });

  return NextResponse.json({ liked: true });
}
