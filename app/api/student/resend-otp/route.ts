import { NextResponse } from "next/server";
import { z } from "zod";
import { hashAccountSetupValue } from "@/lib/account-setup";
import { canSendAuthEmail } from "@/lib/auth-email-policy";
import { createAdminClient } from "@/lib/supabase/admin";

const RESEND_SECONDS = 60;

const schema = z.object({
  email: z.string().trim().email().max(320).transform((v) => v.toLowerCase()),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  // Always return 202 — don't leak whether the email exists.
  if (!parsed.success) return NextResponse.json({ status: "accepted" }, { status: 202 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ status: "accepted" }, { status: 202 });

  const email = parsed.data.email;
  const emailHash = hashAccountSetupValue(email);
  const cutoff = new Date(Date.now() - RESEND_SECONDS * 1000).toISOString();

  const { data: recent } = await admin
    .from("auth_challenge_events")
    .select("id")
    .eq("email_hash", emailHash)
    .eq("purpose", "student_registration")
    .in("event_type", ["requested", "resend_requested"])
    .gte("created_at", cutoff)
    .limit(1)
    .maybeSingle();

  if (recent) {
    // Rate-limited — silently skip send, still return 202.
    return NextResponse.json({ status: "accepted" }, { status: 202 });
  }

  // Look up user ID for audit trail (best-effort — v2 has no getUserByEmail).
  const { data: userList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const authUser = userList?.users.find((u) => u.email?.toLowerCase() === email);
  const userId = authUser?.id ?? null;

  const deliveryAllowed = await canSendAuthEmail(admin, userId);
  if (!deliveryAllowed) {
    await admin.from("auth_challenge_events").insert({
      user_id: userId,
      purpose: "student_registration",
      event_type: "suppressed",
      email_hash: emailHash,
      metadata: { reason: "auth_email_canary_gate" },
    });
    return NextResponse.json({ status: "accepted" }, { status: 202 });
  }

  const { error: sendError } = await admin.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });

  await admin.from("auth_challenge_events").insert({
    user_id: userId,
    purpose: "student_registration",
    event_type: sendError ? "provider_error" : "resend_requested",
    email_hash: emailHash,
    metadata: sendError
      ? { provider: "supabase_auth", error_code: "delivery_failed" }
      : {},
  });

  return NextResponse.json({ status: "accepted" }, { status: 202 });
}
