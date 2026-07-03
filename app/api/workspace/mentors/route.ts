import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const ctx = await getOwnerContext(supabase, traderId);
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

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const sig = AbortSignal.timeout(8000);

  // Check if the email belongs to an existing user
  const { data: existingUserId } = await supabase!
    .rpc("get_user_id_by_email", { input_email: email })
    .abortSignal(sig);

  if (existingUserId) {
    const { error: memberError } = await admin
      .from("trader_members")
      .insert({ trader_id: ctx.tid, user_id: existingUserId, role: "mentor" })
      .abortSignal(sig);

    if (memberError) {
      if (memberError.code === "23505") {
        return NextResponse.json(
          { error: "This person is already in your workspace." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: "Could not add mentor." }, { status: 500 });
    }

    return NextResponse.json({ added: true, invited: false });
  }

  // New user — check for an existing pending invitation
  const { data: existing } = await supabase!
    .from("workspace_invitations")
    .select("id")
    .eq("trader_id", ctx.tid)
    .eq("email", email)
    .is("accepted_at", null)
    .abortSignal(sig)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "An invitation has already been sent to this email." },
      { status: 409 },
    );
  }

  const { data: invitation, error: invErr } = await admin
    .from("workspace_invitations")
    .insert({ trader_id: ctx.tid, email, invited_by: ctx.user.id })
    .select("id")
    .abortSignal(sig)
    .single();

  if (invErr || !invitation) {
    return NextResponse.json({ error: "Could not create invitation." }, { status: 500 });
  }

  return NextResponse.json({ added: false, invited: true }, { status: 201 });
}
