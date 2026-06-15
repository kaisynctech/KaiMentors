import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const conversationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("direct"),
    applicationId: z.string().uuid(),
  }),
  z.object({
    type: z.literal("announcement"),
    title: z.string().trim().min(2).max(160),
  }),
]);

export async function POST(request: Request) {
  const parsed = conversationSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check the conversation details." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Messaging is not configured." },
      { status: 503 },
    );
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const result =
    parsed.data.type === "direct"
      ? await supabase.rpc("create_direct_conversation", {
          target_application_id: parsed.data.applicationId,
        })
      : await supabase.rpc("create_announcement_conversation", {
          target_title: parsed.data.title,
        });

  if (result.error) {
    return NextResponse.json(
      { error: "The conversation could not be created." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { conversationId: result.data },
    { status: 201 },
  );
}
