import { NextResponse, after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWorkspaceInvitation } from "@/lib/email";

async function getOwnerContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  traderId: string,
) {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return null;
  const user = session.user;
  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id, role")
    .eq("user_id", user.id)
    .eq("trader_id", traderId)
    .maybeSingle();
  if (!membership) return null;
  return { user, tid: membership.trader_id, role: membership.role as "owner" | "mentor" };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const traderId = searchParams.get("traderId") ?? "";
  if (!traderId) return NextResponse.json({ error: "traderId required." }, { status: 400 });

  const supabase = await createClient();
  const ctx = await getOwnerContext(supabase, traderId);
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const [{ data: members }, { data: invitations }] = await Promise.all([
    supabase!
      .from("trader_members")
      .select("user_id, role, created_at")
      .eq("trader_id", ctx.tid)
      .order("created_at"),
    supabase!
      .from("workspace_invitations")
      .select("id, email, created_at")
      .eq("trader_id", ctx.tid)
      .is("accepted_at", null)
      .order("created_at"),
  ]);

  const memberIds = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = memberIds.length
    ? await supabase!.from("profiles").select("id, full_name, email").in("id", memberIds)
    : { data: [] };

  const membersWithProfiles = (members ?? []).map((m) => ({
    ...m,
    profile: profiles?.find((p) => p.id === m.user_id) ?? null,
  }));

  return NextResponse.json({
    members: membersWithProfiles,
    pendingInvitations: invitations ?? [],
    callerRole: ctx.role,
  });
}

const inviteSchema = z.object({
  traderId: z.string().uuid(),
  email: z.string().email().toLowerCase().trim(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A valid email address and traderId are required." },
      { status: 400 },
    );
  }

  const { traderId, email } = parsed.data;

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  // getSession() is local — reads the JWT from cookies, zero network cost.
  // We need the caller ID for the after() email block.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const callerId = session.user.id;

  // Single round-trip: all auth checks + invitation insert happen inside the
  // SECURITY DEFINER function on the Postgres server.
  const { data: result, error: rpcErr } = await supabase
    .rpc("invite_mentor_to_workspace", {
      p_trader_id: traderId,
      p_email:     email,
    })
    .abortSignal(AbortSignal.timeout(10000));

  if (rpcErr) {
    return NextResponse.json(
      { error: "Could not process invitation." },
      { status: 500 },
    );
  }

  const res = result as {
    ok?: boolean;
    invitation_id?: string;
    error?: string;
    http_status?: number;
  };

  if (!res?.ok) {
    const httpStatus = res?.http_status ?? 400;
    const message =
      res?.error === "already_member"
        ? "This person is already in your workspace."
        : res?.error === "already_invited"
          ? "An invitation has already been sent to this email."
          : res?.error === "self_invite"
            ? "You cannot invite yourself."
            : res?.error === "unauthorized"
              ? "Unauthorized."
              : "Could not create invitation.";
    return NextResponse.json({ error: message }, { status: httpStatus });
  }

  const invitationId = res.invitation_id;
  const admin = createAdminClient();

  // Email fires after the HTTP response is committed — never blocks.
  after(async () => {
    if (!admin || !invitationId) return;
    try {
      const [{ data: portalRow }, { data: inviterProfile }] = await Promise.all([
        admin.from("portals").select("portal_name").eq("trader_id", traderId).maybeSingle(),
        admin.from("profiles").select("full_name").eq("id", callerId).maybeSingle(),
      ]);
      const workspaceName = portalRow?.portal_name ?? "the workspace";
      const inviterName   = inviterProfile?.full_name ?? "Your colleague";
      const siteUrl       = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kaimentors.vercel.app";
      const joinUrl       = `${siteUrl}/join/${invitationId}`;
      await sendWorkspaceInvitation({ to: email, workspaceName, inviterName, joinUrl });
    } catch {
      // Email failure must never affect the HTTP response.
    }
  });

  return NextResponse.json({ invited: true, invitationId }, { status: 201 });
}
