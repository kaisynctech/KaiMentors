import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { canSendAuthEmail } from "@/lib/auth-email-policy";

const RESEND_SECONDS = 60;
const schema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  purpose: z.enum(["invitation", "signup", "recovery", "email_change"]),
  resend: z.boolean().default(false),
});

function hashEmail(email: string) {
  return createHash("sha256").update(email).digest("hex");
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the email challenge request." }, { status: 400 });
  }
  const admin = createAdminClient();
  const supabase = await createClient();
  if (!admin || !supabase) {
    return NextResponse.json({ error: "Email verification is unavailable." }, { status: 503 });
  }
  const input = parsed.data;
  const emailHash = hashEmail(input.email);
  const cutoff = new Date(Date.now() - RESEND_SECONDS * 1000).toISOString();
  const { data: recent } = await admin
    .from("auth_challenge_events")
    .select("created_at")
    .eq("email_hash", emailHash)
    .eq("purpose", input.purpose)
    .in("event_type", ["requested", "resend_requested"])
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent) {
    const retryAfter = Math.max(
      1,
      RESEND_SECONDS - Math.floor((Date.now() - new Date(recent.created_at).getTime()) / 1000),
    );
    await admin.from("auth_challenge_events").insert({
      purpose: input.purpose,
      event_type: "rate_limited",
      email_hash: emailHash,
      metadata: { retry_after_seconds: retryAfter },
    });
    return NextResponse.json(
      { error: `Please wait ${retryAfter} seconds before requesting another code.`, retryAfterSeconds: retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id,role")
    .ilike("email", input.email)
    .maybeSingle();
  let userId = profile?.id ?? null;
  let allowed = false;
  let sendError: Error | null = null;

  if (input.purpose === "invitation") {
    const { data: invitation } = await admin
      .from("academy_invitations")
      .select("invited_user_id")
      .eq("email", input.email)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    allowed = Boolean(invitation?.invited_user_id && invitation.invited_user_id === profile?.id);
    userId = invitation?.invited_user_id ?? userId;
  } else if (input.purpose === "signup") {
    allowed = Boolean(profile && (profile.role === "trader" || profile.role === "student"));
  } else if (input.purpose === "recovery") {
    allowed = Boolean(profile);
  } else {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    const { data: ownership } = await supabase
      .from("trader_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();
    if (!ownership) return NextResponse.json({ error: "Workspace owner access is required." }, { status: 403 });
    const { data: duplicate } = await admin.from("profiles").select("id").ilike("email", input.email).neq("id", user.id).maybeSingle();
    if (duplicate) return NextResponse.json({ error: "That email address is already in use." }, { status: 409 });
    allowed = true;
    userId = user.id;
  }

  const deliveryAllowed = await canSendAuthEmail(admin, userId);
  if (!deliveryAllowed) {
    await admin.from("auth_challenge_events").insert({
      user_id: userId,
      purpose: input.purpose,
      event_type: "suppressed",
      email_hash: emailHash,
      metadata: { reason: "auth_email_canary_gate" },
    });
    return NextResponse.json(
      { error: "Email verification is temporarily limited to the acceptance-test environment." },
      { status: 503 },
    );
  }

  if (allowed) {
    if (input.purpose === "recovery") {
      const { error } = await admin.auth.resetPasswordForEmail(input.email);
      sendError = error;
    } else if (input.purpose === "email_change") {
      const { error } = await supabase.auth.updateUser({ email: input.email });
      sendError = error;
    } else {
      const { error } = await admin.auth.signInWithOtp({
        email: input.email,
        options: { shouldCreateUser: false },
      });
      sendError = error;
    }
  }

  await admin.from("auth_challenge_events").insert({
    user_id: userId,
    purpose: input.purpose,
    event_type: !allowed ? "suppressed" : sendError ? "provider_error" : input.resend ? "resend_requested" : "requested",
    email_hash: emailHash,
    metadata: sendError ? { provider: "supabase_auth", error_code: "delivery_failed" } : {},
  });

  if (allowed && sendError) {
    return NextResponse.json({ error: "The verification code could not be sent." }, { status: 502 });
  }
  return NextResponse.json(
    { status: "accepted", retryAfterSeconds: RESEND_SECONDS },
    { status: 202 },
  );
}
