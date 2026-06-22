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
const hasCodeOnlyAttestation = process.argv.includes("--confirm-received-code-only");
const hasAcceptedAttestation = process.argv.includes("--confirm-code-accepted");
if (!hasCodeOnlyAttestation || !hasAcceptedAttestation) {
  throw new Error("Both received-email and accepted-code attestations are required.");
}

const operatorEmail = process.env.KAIMENTORS_OPERATOR_EMAIL;
const operatorPassword = process.env.KAIMENTORS_OPERATOR_PASSWORD;
if (!operatorEmail || !operatorPassword) {
  throw new Error("KAIMENTORS_OPERATOR_EMAIL and KAIMENTORS_OPERATOR_PASSWORD are required.");
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
  email: operatorEmail,
  password: operatorPassword,
});
if (signInError || !signIn.user) throw new Error("Super-admin authentication failed.");

const { data: profile } = await operator
  .from("profiles")
  .select("role")
  .eq("id", signIn.user.id)
  .maybeSingle();
if (profile?.role !== "super_admin") throw new Error("The authenticated operator is not a super admin.");

const { data: events, error: eventError } = await operator
  .from("auth_challenge_events")
  .select("id,user_id,created_at")
  .eq("purpose", "signup")
  .eq("event_type", "verified")
  .not("user_id", "is", null)
  .order("created_at", { ascending: false })
  .limit(100);
if (eventError) throw eventError;

let canaryEventId = null;
for (const event of events ?? []) {
  const { data: application } = await operator
    .from("student_applications")
    .select("trader:traders!inner(environment),portal:portals!inner(slug)")
    .eq("student_user_id", event.user_id)
    .eq("trader.environment", "acceptance_test")
    .eq("portal.slug", "kaitrades")
    .limit(1)
    .maybeSingle();
  if (application) {
    canaryEventId = event.id;
    break;
  }
}
if (!canaryEventId) throw new Error("A verified KaiTrades signup canary event was not found.");

const { data: promotion, error: promotionError } = await operator.rpc("promote_auth_email_delivery", {
  target_canary_event_id: canaryEventId,
  target_hosted_policy: hostedPolicy,
  target_received_code_only: true,
  target_code_accepted: true,
});
await operator.auth.signOut();
if (promotionError) throw promotionError;

console.log(JSON.stringify({
  mode: promotion.mode,
  alreadyPromoted: promotion.already_promoted,
  promotedAt: promotion.promoted_at,
  canaryEventId: promotion.canary_event_id ?? canaryEventId,
  hostedPolicy: {
    verificationMethod: hostedPolicy.verificationMethod,
    verifiedAt: hostedPolicy.verifiedAt,
    otpLength: hostedPolicy.otpLength,
    otpExpirySeconds: hostedPolicy.otpExpirySeconds,
    templateCount: Object.keys(hostedPolicy.templates).length,
  },
}, null, 2));
