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
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const sig = AbortSignal.timeout(10000);

  // Phase 1 — parallel: ownership check + email lookup
  const [ctx, { data: existingUserId }] = await Promise.all([
    getOwnerContext(supabase, traderId),
    supabase!.rpc("get_user_id_by_email", { input_email: email }).abortSignal(sig),
  ]);
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (ctx.role !== "owner") {
    return NextResponse.json(
      { error: "Only the workspace owner can invite mentors." },
      { status: 403 },
    );
  }
  if (email === ctx.user.email?.toLowerCase()) {
    return NextResponse.json({ error: "You cannot invite yourself." }, { status: 400 });
  }

  // Phase 2 — parallel: existing membership check + pending invitation check
  const [existingMemberResult, existingInvitationResult] = await Promise.all([
    existingUserId
      ? admin
          .from("trader_members")
          .select("id")
          .eq("trader_id", ctx.tid)
          .eq("user_id", existingUserId)
          .abortSignal(sig)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase!
      .from("workspace_invitations")
      .select("id")
      .eq("trader_id", ctx.tid)
      .eq("email", email)
      .is("accepted_at", null)
      .abortSignal(sig)
      .maybeSingle(),
  ]);
  if (existingMemberResult.data) {
    return NextResponse.json(
      { error: "This person is already in your workspace." },
      { status: 409 },
    );
  }
  if (existingInvitationResult.data) {
    return NextResponse.json(
      { error: "An invitation has already been sent to this email." },
      { status: 409 },
    );
  }

  // Phase 3 — insert invitation
  const { data: invitation, error: invErr } = await admin
    .from("workspace_invitations")
    .insert({ trader_id: ctx.tid, email, invited_by: ctx.user.id })
    .select("id")
    .abortSignal(sig)
    .single();

  if (invErr || !invitation) {
    return NextResponse.json({ error: "Could not create invitation." }, { status: 500 });
  }

  // Send invite email immediately — non-blocking
  after(async () => {
    try {
      const [{ data: portalRow }, { data: inviterProfile }] = await Promise.all([
        admin.from("portals").select("portal_name").eq("trader_id", ctx.tid).maybeSingle(),
        admin.from("profiles").select("full_name").eq("id", ctx.user.id).maybeSingle(),
      ]);
      const workspaceName = portalRow?.portal_name ?? "the workspace";
      const inviterName   = inviterProfile?.full_name ?? "Your colleague";
      const siteUrl       = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kaimentors.vercel.app";
      const joinUrl       = `${siteUrl}/join/${invitation.id}`;
      await sendWorkspaceInvitation({ to: email, workspaceName, inviterName, joinUrl });
    } catch {
      // Email failure must never affect the HTTP response
    }
  });

  return NextResponse.json({ invited: true }, { status: 201 });
}
