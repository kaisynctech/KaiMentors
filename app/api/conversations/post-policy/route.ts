import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  conversationId: z.string().uuid(),
  postPolicy: z.enum(["mentors_only", "everyone"]),
});

export async function PATCH(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { error } = await supabase.rpc("set_conversation_post_policy", {
    target_conversation_id: parsed.data.conversationId,
    target_post_policy: parsed.data.postPolicy,
  });

  if (error) {
    return NextResponse.json(
      { error: "You cannot change posting rules for this conversation." },
      { status: 403 },
    );
  }

  return NextResponse.json({ postPolicy: parsed.data.postPolicy });
}
