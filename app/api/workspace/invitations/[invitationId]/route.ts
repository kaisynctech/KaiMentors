import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ invitationId: string }> },
) {
  const params = z
    .object({ invitationId: z.string().uuid() })
    .safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid ID." }, { status: 400 });

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  // Look up invitation first — its trader_id is the ground truth
  const { data: invitation } = await supabase
    .from("workspace_invitations")
    .select("id, trader_id, accepted_at")
    .eq("id", params.data.invitationId)
    .is("accepted_at", null)
    .maybeSingle();

  if (!invitation) return NextResponse.json({ error: "Invitation not found." }, { status: 404 });

  // Validate caller is owner of that invitation's workspace
  const { data: membership } = await supabase
    .from("trader_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("trader_id", invitation.trader_id)
    .maybeSingle();

  if (!membership || membership.role !== "owner") {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }

  const { error } = await supabase
    .from("workspace_invitations")
    .delete()
    .eq("id", params.data.invitationId)
    .eq("trader_id", invitation.trader_id);

  if (error) return NextResponse.json({ error: "Could not cancel invitation." }, { status: 500 });
  return NextResponse.json({ cancelled: params.data.invitationId });
}
