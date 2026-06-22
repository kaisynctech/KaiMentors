import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createAccountSetupToken,
  hashAccountSetupValue,
  resolveAccountSetupState,
} from "@/lib/account-setup";
import { canSendAuthEmail } from "@/lib/auth-email-policy";
import { createAdminClient } from "@/lib/supabase/admin";

const RESEND_SECONDS = 60;
const schema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Account setup is unavailable." }, { status: 503 });
  const email = parsed.data.email;
  const emailHash = hashAccountSetupValue(email);
  const cutoff = new Date(Date.now() - RESEND_SECONDS * 1000).toISOString();
  const { data: recent } = await admin
    .from("auth_challenge_events")
    .select("created_at")
    .eq("email_hash", emailHash)
    .eq("purpose", "account_setup")
    .in("event_type", ["requested", "resend_requested"])
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent) {
    const retryAfter = Math.max(1, RESEND_SECONDS - Math.floor((Date.now() - new Date(recent.created_at).getTime()) / 1000));
    await admin.from("auth_challenge_events").insert({
      purpose: "account_setup",
      event_type: "rate_limited",
      email_hash: emailHash,
      metadata: { retry_after_seconds: retryAfter },
    });
    return NextResponse.json(
      { error: `Please wait ${retryAfter} seconds before requesting another code.`, retryAfterSeconds: retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const resolved = await resolveAccountSetupState(admin, email);
  const setupToken = createAccountSetupToken();
  await admin.from("account_setup_sessions").update({
    state: "expired",
    expires_at: new Date().toISOString(),
  }).eq("email_hash", emailHash).is("completed_at", null).gt("expires_at", new Date().toISOString());
  const { data: setupSession, error: sessionError } = await admin
    .from("account_setup_sessions")
    .insert({
      token_hash: createHash("sha256").update(setupToken).digest("hex"),
      email_hash: emailHash,
      user_id: resolved.userId,
      invitation_id: resolved.invitation?.status === "pending"
        && new Date(resolved.invitation.expires_at).getTime() > Date.now()
        ? resolved.invitation.id
        : null,
      state: resolved.state,
      metadata: { initial_state: resolved.state },
    })
    .select("id")
    .single();
  if (sessionError || !setupSession) {
    return NextResponse.json({ error: "Account setup could not be started." }, { status: 500 });
  }

  let sendError: Error | null = null;
  const deliveryAllowed = resolved.userId
    ? await canSendAuthEmail(admin, resolved.userId)
    : false;
  if (resolved.userId && deliveryAllowed) {
    const { error } = await admin.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    sendError = error;
  }
  await admin.from("auth_challenge_events").insert({
    user_id: resolved.userId,
    purpose: "account_setup",
    event_type: resolved.userId && deliveryAllowed
      ? sendError ? "provider_error" : "requested"
      : "suppressed",
    email_hash: emailHash,
    metadata: {
      account_setup_session_id: setupSession.id,
      ...(sendError ? { provider: "supabase_auth", error_code: "delivery_failed" } : {}),
    },
  });

  return NextResponse.json({
    status: "accepted",
    setupToken,
    retryAfterSeconds: RESEND_SECONDS,
    message: "If the email matches an account that can be continued, a six-digit code has been sent.",
  }, { status: 202 });
}
