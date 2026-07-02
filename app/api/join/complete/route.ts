import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  invitationId: z.string().uuid(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { invitationId, firstName, lastName } = parsed.data;
  const fullName = `${firstName} ${lastName}`;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server error." }, { status: 503 });
  }

  const { data: invitation } = await admin
    .from("workspace_invitations")
    .select("id, trader_id, email, accepted_at")
    .eq("id", invitationId)
    .maybeSingle();

  if (!invitation) {
    return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
  }
  if (invitation.accepted_at) {
    return NextResponse.json({ error: "Invitation already accepted." }, { status: 409 });
  }
  if (invitation.email.toLowerCase() !== (user.email ?? "").toLowerCase()) {
    return NextResponse.json({ error: "Email mismatch." }, { status: 403 });
  }

  await Promise.all([
    admin.from("profiles").upsert(
      { id: user.id, full_name: fullName },
      { onConflict: "id" },
    ),
    admin.from("trader_members").upsert(
      { trader_id: invitation.trader_id, user_id: user.id, role: "mentor" },
      { onConflict: "trader_id,user_id", ignoreDuplicates: true },
    ),
    admin
      .from("workspace_invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invitationId),
  ]);

  return NextResponse.json({ ok: true });
}
