import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({ applicationId: z.string().uuid() });

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid application ID." }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 403 });
  }
  const tid = membership.trader_id;
  const appId = params.data.applicationId;

  const { data: application } = await supabase
    .from("student_applications")
    .select("id,student_user_id")
    .eq("id", appId)
    .eq("trader_id", tid)
    .maybeSingle();
  if (!application) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  // 1. Remove from all group memberships
  await supabase
    .from("student_group_members")
    .delete()
    .eq("application_id", appId);

  // 2. Revoke individual content access grants
  if (application.student_user_id) {
    await supabase
      .from("content_access_grants")
      .delete()
      .eq("trader_id", tid)
      .eq("student_user_id", application.student_user_id);
  }

  // 3. Delete the application record (lesson_progress kept as audit trail)
  const { error: deleteError } = await supabase
    .from("student_applications")
    .delete()
    .eq("id", appId)
    .eq("trader_id", tid);

  if (deleteError) {
    return NextResponse.json(
      { error: "The student could not be deleted." },
      { status: 500 },
    );
  }

  return NextResponse.json({ deleted: appId });
}
