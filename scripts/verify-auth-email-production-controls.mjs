import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

async function loadEnvironment() {
  const text = await readFile(".env.local", "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const separator = line.indexOf("=");
    process.env[line.slice(0, separator).trim()] ??= line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
  }
}

await loadEnvironment();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonymous = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const fakePolicy = {
  verificationMethod: "management_api_content_inspection",
  verifiedAt: new Date().toISOString(),
  templates: {},
  otpLength: 6,
  otpExpirySeconds: 900,
  secureEmailChange: true,
};
const { error: anonymousPromotionError } = await anonymous.rpc("promote_auth_email_delivery", {
  target_canary_event_id: 1,
  target_hosted_policy: fakePolicy,
  target_received_code_only: true,
  target_code_accepted: true,
});
const { error: servicePromotionError } = await service.rpc("promote_auth_email_delivery", {
  target_canary_event_id: 1,
  target_hosted_policy: fakePolicy,
  target_received_code_only: true,
  target_code_accepted: true,
});

const { data: invitation, error: invitationError } = await service
  .from("academy_invitations")
  .select("id,invited_user_id,trader_id,status,portal:traders!academy_invitations_trader_id_fkey(owner_user_id)")
  .eq("status", "pending")
  .order("created_at", { ascending: false })
  .limit(1)
  .single();
if (invitationError) throw invitationError;
const { error: serviceAuthorizationError } = await service.rpc("authorize_academy_invitation_resend", {
  target_invitation_id: invitation.id,
});

if (!process.env.KAIMENTORS_OPERATOR_EMAIL || !process.env.KAIMENTORS_OPERATOR_PASSWORD) {
  throw new Error("Authenticated super-admin operator credentials are required.");
}
const operator = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: signIn, error: signInError } = await operator.auth.signInWithPassword({
  email: process.env.KAIMENTORS_OPERATOR_EMAIL,
  password: process.env.KAIMENTORS_OPERATOR_PASSWORD,
});
if (signInError || !signIn.user) throw new Error("Super-admin authentication failed.");

const { data: policy } = await operator
  .from("platform_settings")
  .select("value")
  .eq("key", "auth_email_delivery_policy")
  .single();
const { data: repeatedPromotion, error: repeatedPromotionError } = await operator.rpc("promote_auth_email_delivery", {
  target_canary_event_id: Number(policy.value.canary_event_id),
  target_hosted_policy: fakePolicy,
  target_received_code_only: true,
  target_code_accepted: true,
});
const { error: firstCooldownProbeError } = await operator.rpc("authorize_academy_invitation_resend", {
  target_invitation_id: invitation.id,
});
const { error: secondCooldownProbeError } = firstCooldownProbeError
  ? { error: firstCooldownProbeError }
  : await operator.rpc("authorize_academy_invitation_resend", {
      target_invitation_id: invitation.id,
    });
const { data: auditEvents, error: auditError } = await operator
  .from("audit_logs")
  .select("action")
  .in("action", [
    "auth_challenge_verification_reconciled",
    "hosted_auth_policy_verified",
    "auth_email_canary_accepted",
    "auth_email_delivery_promoted",
    "academy_invitation_resend_authorized",
  ]);
await operator.auth.signOut();
if (repeatedPromotionError || auditError) throw repeatedPromotionError ?? auditError;

const actions = new Set((auditEvents ?? []).map((event) => event.action));
const requiredActions = [
  "auth_challenge_verification_reconciled",
  "hosted_auth_policy_verified",
  "auth_email_canary_accepted",
  "auth_email_delivery_promoted",
  "academy_invitation_resend_authorized",
];
const result = {
  policyMode: policy.value.mode,
  anonymousPromotionDenied: Boolean(anonymousPromotionError),
  serviceRolePromotionDenied: Boolean(servicePromotionError),
  serviceRoleResendAuthorizationDenied: Boolean(serviceAuthorizationError),
  repeatedPromotionIdempotent: repeatedPromotion?.already_promoted === true,
  cooldownEnforced: Boolean(secondCooldownProbeError),
  auditChainComplete: requiredActions.every((action) => actions.has(action)),
  preservedIdentity: {
    userId: invitation.invited_user_id,
    traderId: invitation.trader_id,
    ownerUserId: invitation.portal?.owner_user_id ?? null,
    invitationId: invitation.id,
    invitationStatus: invitation.status,
  },
};
if (!Object.entries(result).filter(([key]) => key.endsWith("Denied") || key.endsWith("Idempotent") || key.endsWith("Enforced") || key.endsWith("Complete")).every(([, value]) => value === true)
  || result.policyMode !== "production_enabled"
  || result.preservedIdentity.userId !== result.preservedIdentity.ownerUserId) {
  throw new Error(`Production control verification failed: ${JSON.stringify(result)}`);
}
console.log(JSON.stringify(result, null, 2));
