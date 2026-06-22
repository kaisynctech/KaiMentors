import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdminApi } from "@/lib/admin-api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  invitationId: z.string().uuid(),
  reason: z.string().trim().min(10).max(500),
});

export async function POST(request: Request) {
  const actor = await requirePlatformAdminApi();
  if (!actor) return NextResponse.json({ error: "Super admin access is required." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Check the renewal details." }, { status: 400 });
  const { data: renewed, error: renewalError } = await actor.supabase.rpc("renew_academy_invitation", {
    target_invitation_id: parsed.data.invitationId,
    target_reason: parsed.data.reason,
  });
  if (renewalError || !renewed) return NextResponse.json({ error: "Invitation renewal was not authorized." }, { status: 409 });
  const { data: authorization, error: authorizationError } = await actor.supabase.rpc("authorize_academy_invitation_resend", {
    target_invitation_id: parsed.data.invitationId,
  });
  if (authorizationError || !authorization) return NextResponse.json({ error: "Invitation renewed; resend is temporarily unavailable." }, { status: 409 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Invitation delivery is unavailable." }, { status: 503 });
  const { data: invitation } = await admin.from("academy_invitations").select("email,invited_user_id").eq("id", parsed.data.invitationId).single();
  if (!invitation) return NextResponse.json({ error: "Invitation identity could not be resolved." }, { status: 409 });
  const { error: sendError } = await admin.auth.signInWithOtp({ email: invitation.email, options: { shouldCreateUser: false } });
  await admin.from("auth_challenge_events").insert({
    user_id: invitation.invited_user_id,
    purpose: "invitation",
    event_type: sendError ? "provider_error" : "resend_requested",
    email_hash: createHash("sha256").update(invitation.email).digest("hex"),
    metadata: {
      authorization_event_id: authorization.authorization_event_id,
      renewal: true,
      ...(sendError ? { provider: "supabase_auth", error_code: "delivery_failed" } : {}),
    },
  });
  if (sendError) return NextResponse.json({ error: "Invitation renewed, but its code could not be sent." }, { status: 502 });
  return NextResponse.json({ status: "renewed", expiresAt: renewed.expires_at });
}
