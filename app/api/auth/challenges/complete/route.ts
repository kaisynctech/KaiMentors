import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  purpose: z.enum(["signup", "recovery"]),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid authentication challenge." }, { status: 400 });
  }

  const admin = createAdminClient();
  const supabase = await createClient();
  if (!admin || !supabase) {
    return NextResponse.json({ error: "Authentication auditing is unavailable." }, { status: 503 });
  }

  const authorization = request.headers.get("authorization");
  const bearerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const {
    data: { user },
  } = bearerToken
    ? await admin.auth.getUser(bearerToken)
    : await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  const emailHash = createHash("sha256").update(user.email.toLowerCase()).digest("hex");
  const challengeWindow = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: requested } = await admin
    .from("auth_challenge_events")
    .select("created_at")
    .eq("user_id", user.id)
    .eq("purpose", parsed.data.purpose)
    .eq("email_hash", emailHash)
    .in("event_type", ["requested", "resend_requested"])
    .gte("created_at", challengeWindow)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!requested) {
    return NextResponse.json({ error: "A current authentication challenge was not found." }, { status: 409 });
  }

  const { data: completed } = await admin
    .from("auth_challenge_events")
    .select("id")
    .eq("user_id", user.id)
    .eq("purpose", parsed.data.purpose)
    .eq("email_hash", emailHash)
    .eq("event_type", "verified")
    .gte("created_at", requested.created_at)
    .limit(1)
    .maybeSingle();
  if (completed) {
    return NextResponse.json({ error: "This authentication challenge was already completed." }, { status: 409 });
  }

  const { error } = await admin.from("auth_challenge_events").insert({
    user_id: user.id,
    purpose: parsed.data.purpose,
    event_type: "verified",
    email_hash: emailHash,
  });
  if (error) {
    return NextResponse.json({ error: "Authentication auditing could not be completed." }, { status: 500 });
  }

  return NextResponse.json({ status: "recorded" });
}
