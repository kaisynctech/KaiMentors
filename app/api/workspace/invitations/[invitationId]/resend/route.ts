import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWorkspaceInvitation } from "@/lib/email";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ invitationId: string }> },
) {
  const { invitationId: id } = await params;

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const user = session.user;

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  // Fetch invitation — its trader_id is the ground truth
  const { data: invitation } = await admin
    .from("workspace_invitations")
    .select("id, email, trader_id, accepted_at")
    .eq("id", id)
    .maybeSingle();

  if (!invitation) return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
  if (invitation.accepted_at) {
    return NextResponse.json({ error: "Invitation already accepted." }, { status: 409 });
  }

  // Validate caller is owner of that invitation's workspace
  const { data: membership } = await supabase
    .from("trader_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("trader_id", invitation.trader_id)
    .maybeSingle();

  if (!membership || membership.role !== "owner") {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const [{ data: portalRow }, { data: inviterProfile }] = await Promise.all([
    supabase.from("portals").select("portal_name").eq("trader_id", invitation.trader_id).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);

  const workspaceName = portalRow?.portal_name ?? "the workspace";
  const inviterName   = inviterProfile?.full_name ?? "Your colleague";
  const siteUrl       = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const joinUrl       = `${siteUrl}/join/${invitation.id}`;

  const resendResponse = NextResponse.json({ ok: true });
  after(() =>
    sendWorkspaceInvitation({
      to: invitation.email,
      workspaceName,
      inviterName,
      joinUrl,
    }).catch(() => {}),
  );
  return resendResponse;
}
