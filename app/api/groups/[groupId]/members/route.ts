import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({ groupId: z.string().uuid() });
const membersSchema = z.object({
  applicationIds: z.array(z.string().uuid()).max(1000),
});

export async function PUT(
  request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  const params = paramsSchema.safeParse(await context.params);
  const body = membersSchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) {
    return NextResponse.json(
      { error: "Please check the selected students." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Student groups are not configured." },
      { status: 503 },
    );
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("set_student_group_members", {
    target_group_id: params.data.groupId,
    target_application_ids: body.data.applicationIds,
  });
  if (error) {
    return NextResponse.json(
      { error: "Group membership could not be updated." },
      { status: 400 },
    );
  }

  return NextResponse.json({ memberCount: data });
}
