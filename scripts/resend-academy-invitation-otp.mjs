import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { verifyHostedAuthPolicy } from "./lib/hosted-auth-policy.mjs";

async function loadEnvironment() {
  const text = await readFile(".env.local", "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const separator = line.indexOf("=");
    process.env[line.slice(0, separator).trim()] ??= line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
  }
}

await loadEnvironment();
const emailFlag = process.argv.indexOf("--email");
const email = emailFlag >= 0 ? process.argv[emailFlag + 1]?.trim().toLowerCase() : null;
if (!email) throw new Error("Missing --email.");
if (!process.env.KAIMENTORS_OPERATOR_EMAIL || !process.env.KAIMENTORS_OPERATOR_PASSWORD) {
  throw new Error("Authenticated super-admin operator credentials are required.");
}

const projectRef = process.env.SUPABASE_PROJECT_REF
  ?? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const hostedPolicy = await verifyHostedAuthPolicy({
  accessToken: process.env.SUPABASE_ACCESS_TOKEN,
  projectRef,
});
const operator = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const { data: signIn, error: signInError } = await operator.auth.signInWithPassword({
  email: process.env.KAIMENTORS_OPERATOR_EMAIL,
  password: process.env.KAIMENTORS_OPERATOR_PASSWORD,
});
if (signInError || !signIn.user) throw new Error("Super-admin authentication failed.");

const { data: profile } = await operator.from("profiles").select("role").eq("id", signIn.user.id).maybeSingle();
if (profile?.role !== "super_admin") throw new Error("The authenticated operator is not a super admin.");

const { data: invitation, error: invitationError } = await operator
  .from("academy_invitations")
  .select("id,email,invited_user_id,trader_id,status,expires_at")
  .eq("email", email)
  .eq("status", "pending")
  .gt("expires_at", new Date().toISOString())
  .maybeSingle();
if (invitationError) throw invitationError;
if (!invitation) throw new Error("An active pending invitation was not found.");

const { data: authorization, error: authorizationError } = await operator.rpc(
  "authorize_academy_invitation_resend",
  { target_invitation_id: invitation.id },
);
await operator.auth.signOut();
if (authorizationError) throw authorizationError;

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { error: sendError } = await admin.auth.signInWithOtp({
  email,
  options: { shouldCreateUser: false },
});
await admin.from("auth_challenge_events").insert({
  user_id: authorization.invited_user_id,
  purpose: "invitation",
  event_type: sendError ? "provider_error" : "resend_requested",
  email_hash: createHash("sha256").update(email).digest("hex"),
  metadata: {
    authorization_event_id: authorization.authorization_event_id,
    ...(sendError ? { provider: "supabase_auth", error_code: "delivery_failed" } : {}),
  },
});
if (sendError) throw new Error("Supabase Auth could not resend the invitation code.");

console.log(JSON.stringify({
  hostedPolicyVerifiedAt: hostedPolicy.verifiedAt,
  resend: "accepted",
  authorizationEventId: authorization.authorization_event_id,
  preservedIdentity: {
    userId: authorization.invited_user_id,
    traderId: authorization.trader_id,
    invitationId: authorization.invitation_id,
    invitationStatus: invitation.status,
  },
}, null, 2));
