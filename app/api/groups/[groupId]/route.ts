import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({ groupId: z.string().uuid() });

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid group ID." }, { status: 400 });
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
  const groupId = params.data.groupId;

  const { data: group } = await supabase
    .from("student_groups")
    .select("id,system_key")
    .eq("id", groupId)
    .eq("trader_id", tid)
    .maybeSingle();
  if (!group) {
    return NextResponse.json({ error: "Group not found." }, { status: 404 });
  }
  if (group.system_key !== null) {
    return NextResponse.json(
      { error: "System groups cannot be deleted." },
      { status: 409 },
    );
  }

  // 1. Remove all group memberships
  await supabase
    .from("student_group_members")
    .delete()
    .eq("group_id", groupId);

  // 2. Revoke course access grants assigned to this group
  await supabase
    .from("content_access_grants")
    .delete()
    .eq("trader_id", tid)
    .eq("group_id", groupId);

  // 3. Delete the group record
  const { error: deleteError } = await supabase
    .from("student_groups")
    .delete()
    .eq("id", groupId)
    .eq("trader_id", tid);

  if (deleteError) {
    return NextResponse.json(
      { error: "The group could not be deleted." },
      { status: 500 },
    );
  }

  return NextResponse.json({ deleted: groupId });
}
