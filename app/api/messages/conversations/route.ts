import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const conversationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("direct"),
    applicationId: z.string().uuid(),
  }),
  z.object({
    type: z.literal("student_direct"),
    applicationId: z.string().uuid(),
    mentorUserId: z.string().uuid().optional(),
  }),
  z.object({
    type: z.literal("group"),
    title: z.string().trim().min(2).max(160),
    applicationIds: z.array(z.string().uuid()).min(1),
    allowStudentReplies: z.boolean().optional(),
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
      : parsed.data.type === "student_direct"
        ? await supabase.rpc("create_student_conversation", {
            target_application_id: parsed.data.applicationId,
            target_mentor_user_id: parsed.data.mentorUserId ?? null,
          })
        : await supabase.rpc("create_group_conversation", {
            target_title: parsed.data.title,
            target_application_ids: parsed.data.applicationIds,
            target_post_policy: parsed.data.allowStudentReplies
              ? "everyone"
              : "mentors_only",
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
