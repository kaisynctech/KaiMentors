import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAccountSetupState } from "@/lib/account-setup";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ setupToken: z.string().min(40).max(100) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Account setup session is invalid." }, { status: 400 });
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const admin = createAdminClient();
  if (!admin || !accessToken) return NextResponse.json({ error: "Email verification is required." }, { status: 401 });
  const { data: { user } } = await admin.auth.getUser(accessToken);
  if (!user?.email) return NextResponse.json({ error: "Email verification is required." }, { status: 401 });

  const tokenHash = createHash("sha256").update(parsed.data.setupToken).digest("hex");
  const { data: setupSession } = await admin
    .from("account_setup_sessions")
    .select("id,user_id,email_hash,invitation_id,state,expires_at,verified_at,completed_at,attempt_count,metadata,created_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!setupSession || setupSession.user_id !== user.id || setupSession.completed_at || setupSession.state === "expired"
    || new Date(setupSession.expires_at).getTime() <= Date.now()
    || setupSession.email_hash !== createHash("sha256").update(user.email.toLowerCase()).digest("hex")) {
    return NextResponse.json({ error: "Account setup session is invalid or expired." }, { status: 409 });
  }
  if (setupSession.attempt_count >= 10) {
    return NextResponse.json({ error: "Account setup requires support review." }, { status: 429 });
  }

  const { data: requestedChallenge } = await admin
    .from("auth_challenge_events")
    .select("id")
    .eq("user_id", user.id)
    .eq("email_hash", setupSession.email_hash)
    .eq("purpose", "account_setup")
    .in("event_type", ["requested", "resend_requested"])
    .gte("created_at", setupSession.created_at)
    .lte("created_at", setupSession.expires_at)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!requestedChallenge) return NextResponse.json({ error: "A matching account setup challenge was not found." }, { status: 409 });

  const resolved = await resolveAccountSetupState(admin, user.email);
  const initialState = typeof setupSession.metadata === "object" && setupSession.metadata
    && "initial_state" in setupSession.metadata
    ? String(setupSession.metadata.initial_state)
    : setupSession.state;
  const now = new Date().toISOString();
  if (!setupSession.verified_at) {
    const { data: claimedVerification } = await admin.from("account_setup_sessions").update({
      state: "verified",
      verified_at: now,
      attempt_count: setupSession.attempt_count + 1,
      metadata: { initial_state: initialState, resolved_state: resolved.state },
    }).eq("id", setupSession.id).is("verified_at", null).select("id").maybeSingle();
    if (claimedVerification) {
      await admin.from("auth_challenge_events").insert({
        user_id: user.id,
        purpose: "account_setup",
        event_type: "verified",
        email_hash: setupSession.email_hash,
        metadata: { account_setup_session_id: setupSession.id },
      });
    }
  }

  const invitation = resolved.invitation;
  const activeInvitation = invitation?.status === "pending"
    && new Date(invitation.expires_at).getTime() > Date.now();
  const action = activeInvitation || initialState === "unverified_identity" || initialState === "verified_awaiting_password" || initialState === "email_correction"
    ? "create_password"
    : resolved.state === "completed_account"
      ? "sign_in"
      : resolved.state === "expired_invitation"
        ? "invitation_expired"
        : "support_review";
  return NextResponse.json({
    status: "verified",
    action,
    academyName: resolved.academyName ?? invitation?.display_name ?? null,
  });
}
