import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
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
  const emailHash = createHash("sha256").update(email).digest("hex");
  const cutoff = new Date(Date.now() - RESEND_SECONDS * 1000).toISOString();

  const { data: recent } = await admin
    .from("auth_challenge_events")
    .select("id")
    .eq("email_hash", emailHash)
    .eq("purpose", "account_setup")
    .in("event_type", ["requested", "resend_requested"])
    .gte("created_at", cutoff)
    .limit(1)
    .maybeSingle();

  if (recent) {
    // Rate-limited — silently skip send, still return 202.
    return NextResponse.json({ status: "accepted" }, { status: 202 });
  }

  await admin.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });

  await admin.from("auth_challenge_events").insert({
    purpose: "account_setup",
    event_type: "resend_requested",
    email_hash: emailHash,
    metadata: {},
  });

  return NextResponse.json({ status: "accepted" }, { status: 202 });
}
