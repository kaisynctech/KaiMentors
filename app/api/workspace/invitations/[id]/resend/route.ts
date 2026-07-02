import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWorkspaceInvitation } from "@/lib/email";

async function getOwnerContext(supabase: Awaited<ReturnType<typeof createClient>>) {
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id, role")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!membership || membership.role !== "owner") return null;
  return { user, tid: membership.trader_id };
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const ctx = await getOwnerContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const { data: invitation } = await admin
    .from("workspace_invitations")
    .select("id, email, trader_id, accepted_at")
    .eq("id", id)
    .eq("trader_id", ctx.tid)
    .maybeSingle();

  if (!invitation) {
    return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
  }
  if (invitation.accepted_at) {
    return NextResponse.json({ error: "Invitation already accepted." }, { status: 409 });
  }

  const [{ data: portalRow }, { data: inviterProfile }] = await Promise.all([
    supabase!
      .from("portals")
      .select("portal_name")
      .eq("trader_id", ctx.tid)
      .maybeSingle(),
    supabase!
      .from("profiles")
      .select("full_name")
      .eq("id", ctx.user.id)
      .maybeSingle(),
  ]);

  const workspaceName = portalRow?.portal_name ?? "the workspace";
  const inviterName   = inviterProfile?.full_name ?? "Your colleague";
  const siteUrl       = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const joinUrl       = `${siteUrl}/join/${invitation.id}`;

  try {
    await sendWorkspaceInvitation({
      to: invitation.email,
      workspaceName,
      inviterName,
      joinUrl,
    });
  } catch {
    return NextResponse.json({ error: "Could not send invitation email." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
