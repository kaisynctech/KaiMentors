import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (...segments) => readFile(path.join(root, ...segments), "utf8");

test("Supabase OTP policy is six digits with a 15 minute expiry and one minute resend limit", async () => {
  const config = await read("supabase", "config.toml");
  assert.match(config, /otp_length\s*=\s*6/);
  assert.match(config, /otp_expiry\s*=\s*900/);
  assert.match(config, /max_frequency\s*=\s*"1m"/);
  for (const template of ["confirmation", "invite", "recovery", "magic_link", "email_change", "reauthentication"]) {
    assert.match(config, new RegExp(`\\[auth\\.email\\.template\\.${template}\\]`));
  }
});

test("all authentication templates contain only a manually entered OTP", async () => {
  for (const name of ["confirmation", "invite", "recovery", "magic_link", "email_change", "reauthentication"]) {
    const content = await read("supabase", "templates", `${name}.html`);
    assert.match(content, /\{\{ \.Token \}\}/);
    assert.doesNotMatch(content, /ConfirmationURL|TokenHash|SiteURL|RedirectTo|<a\b|https?:\/\//i);
    assert.match(content, /15 minutes/i);
  }
});

test("challenge requests are centralized, audited, throttled, and never persist OTP values", async () => {
  const route = await read("app", "api", "auth", "challenges", "request", "route.ts");
  const completion = await read("app", "api", "auth", "challenges", "complete", "route.ts");
  const migration = await read("supabase", "migrations", "202606190020_auth_challenge_audit.sql");
  assert.match(route, /RESEND_SECONDS = 60/);
  assert.match(route, /shouldCreateUser: false/);
  assert.match(route, /resetPasswordForEmail/);
  assert.match(route, /auth\.updateUser\(\{ email/);
  assert.match(migration, /email_hash/);
  assert.doesNotMatch(migration, /otp_value|token_value|verification_code/i);
  assert.match(completion, /event_type: "verified"/);
  assert.match(completion, /Bearer\\s\+/);
  assert.match(completion, /admin\.auth\.getUser\(bearerToken\)/);
  assert.match(completion, /z\.enum\(\["signup", "recovery"\]\)/);
  assert.match(completion, /15 \* 60 \* 1000/);
  assert.match(completion, /already completed/);
  assert.doesNotMatch(completion, /token_value|otp_value|verification_code/i);
});

test("missing canary completion can only be reconciled from provider evidence", async () => {
  const migration = await read("supabase", "migrations", "202606200023_reconcile_auth_challenge_completion.sql");
  const reconciliation = await read("scripts", "reconcile-auth-challenge-verification.mjs");
  assert.match(migration, /if not public\.is_super_admin\(\)/);
  assert.match(migration, /from auth\.users/);
  assert.match(migration, /email_confirmed_at/);
  assert.match(migration, /interval '15 minutes'/);
  assert.match(migration, /trader\.environment = 'acceptance_test'/);
  assert.match(migration, /portal\.slug = 'kaitrades'/);
  assert.match(migration, /auth_challenge_verification_reconciled/);
  assert.match(reconciliation, /signInWithPassword/);
  assert.match(reconciliation, /reconcile_auth_challenge_verification/);
  assert.doesNotMatch(reconciliation, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("invitation acceptance delegates to the unified transactional completion authority", async () => {
  const route = await read("app", "api", "academy-invitations", "accept", "route.ts");
  const migration = await read("supabase", "migrations", "202606200024_unified_account_setup_lifecycle.sql");
  assert.match(route, /account-setup\/complete\/route/);
  assert.match(migration, /invitation\.invited_user_id <> auth\.uid\(\)/);
  assert.match(migration, /invitation\.status <> 'pending'/);
  assert.match(migration, /invitation\.expires_at <= now\(\)/);
  assert.match(migration, /complete_account_setup/);
});

test("account setup, recovery, and email change provide code entry and resend", async () => {
  const setup = await read("components", "account-setup-flow.tsx");
  const recovery = await read("components", "password-recovery-form.tsx");
  const emailChange = await read("components", "owner-email-change-form.tsx");
  for (const content of [setup, recovery, emailChange]) assert.match(content, /one-time-code/);
  assert.match(setup, /Resend code/);
  assert.match(recovery, /requestAuthChallenge/);
  assert.match(emailChange, /type: "email_change"/);
  assert.match(emailChange, /currentCode/);
  assert.match(emailChange, /newCode/);
});

test("unified account setup is opaque, enumeration-safe, and server-authoritative", async () => {
  const migration = await read("supabase", "migrations", "202606200024_unified_account_setup_lifecycle.sql");
  const resolver = await read("lib", "account-setup.ts");
  const start = await read("app", "api", "account-setup", "start", "route.ts");
  const verify = await read("app", "api", "account-setup", "verify", "route.ts");
  const complete = await read("app", "api", "account-setup", "complete", "route.ts");
  assert.match(migration, /account_setup_sessions/);
  assert.match(migration, /token_hash text not null unique/);
  assert.match(migration, /email_hash text not null/);
  assert.doesNotMatch(migration, /otp_value|verification_code|token_value/i);
  for (const state of ["new_identity", "unverified_identity", "active_invitation", "expired_invitation", "verified_awaiting_password", "completed_account", "role_conflict", "email_correction", "inconsistent_state"]) assert.match(migration, new RegExp(state));
  assert.match(start, /RESEND_SECONDS = 60/);
  assert.match(start, /status: "accepted"/);
  assert.match(start, /shouldCreateUser: false/);
  assert.match(verify, /admin\.auth\.getUser\(accessToken\)/);
  assert.match(verify, /setupSession\.user_id !== user\.id/);
  assert.match(verify, /purpose", "account_setup"/);
  assert.match(verify, /if \(!setupSession\.verified_at\)/);
  assert.match(start, /state: "expired"/);
  assert.match(complete, /complete_account_setup/);
  assert.doesNotMatch(complete, /service.role|SUPABASE_SERVICE_ROLE_KEY/i);
  assert.match(resolver, /role_conflict/);
});

test("password creation follows successful verification across new account flows", async () => {
  const setup = await read("components", "account-setup-flow.tsx");
  const mentor = await read("components", "mentor-onboarding-form.tsx");
  const student = await read("components", "student-registration-form.tsx");
  const mentorApi = await read("app", "api", "trader", "onboard", "route.ts");
  const studentApi = await read("app", "api", "student", "register", "route.ts");
  // Mentor and account-setup: OTP verification precedes password creation (unchanged).
  assert.match(setup, /verifyOtp/);
  assert.ok(setup.indexOf("verifyOtp") < setup.indexOf("updateUser({ password }"));
  assert.doesNotMatch(mentorApi, /password: input\.password/);
  assert.match(mentor, /account-setup/);
  // Student EP-017 inline OTP: password is set at createUser time; OTP (type "signup") activates the unconfirmed account.
  assert.match(studentApi, /createUser/);
  assert.match(studentApi, /email_confirm: false/);
  assert.match(studentApi, /canSendAuthEmail/);
  assert.match(studentApi, /auth_challenge_events/);
  assert.match(studentApi, /student_registration/);
  assert.doesNotMatch(studentApi, /console\.log.*password|"password".*metadata|metadata.*"password"/i);
  // Neither form exposes password as a DOM input — student injects via formData.set in the submit handler.
  assert.doesNotMatch(mentor, /name="password"/);
  assert.doesNotMatch(student, /name="password"/);
  assert.match(student, /formData\.set\("password"/);
  assert.match(student, /type: "signup"/);
});

test("invitation renewal and owner email correction are super-admin-only and preserve identity", async () => {
  const migration = await read("supabase", "migrations", "202606200024_unified_account_setup_lifecycle.sql");
  const renewal = await read("app", "api", "admin", "academy-invitations", "renew", "route.ts");
  const correction = await read("app", "api", "admin", "traders", "owner-email", "route.ts");
  assert.match(migration, /renew_academy_invitation/);
  assert.match(migration, /begin_academy_owner_email_correction/);
  assert.match(migration, /if not public\.is_super_admin\(\)/g);
  assert.match(migration, /delete from auth\.sessions/);
  assert.match(migration, /trader\.owner_user_id/);
  assert.match(migration, /trader_members_one_owner_idx/);
  assert.match(renewal, /requirePlatformAdminApi/);
  assert.match(renewal, /authorize_academy_invitation_resend/);
  assert.match(correction, /updateUserById/);
  assert.match(correction, /begin_academy_owner_email_correction/);
});

test("bare invitation route never requires an email query parameter", async () => {
  const invitationPage = await read("app", "onboarding", "invitation", "page.tsx");
  const setupPage = await read("app", "account-setup", "page.tsx");
  assert.match(invitationPage, /redirect\("\/account-setup"\)/);
  assert.doesNotMatch(invitationPage, /searchParams|email\?/);
  assert.match(setupPage, /AccountSetupFlow/);
});

test("returning login remains password based and link generation is absent from runtime code", async () => {
  const login = await read("components", "login-form.tsx");
  const provision = await read("scripts", "provision-academy-invitation.mjs");
  const resend = await read("scripts", "resend-academy-invitation-otp.mjs");
  assert.match(login, /signInWithPassword/);
  assert.doesNotMatch(provision, /emailRedirectTo|generateLink|magiclink/);
  assert.match(resend, /verifyHostedAuthPolicy/);
  assert.match(resend, /invited_user_id/);
  assert.match(resend, /shouldCreateUser: false/);
  assert.doesNotMatch(resend, /emailRedirectTo|generateLink|magiclink/);
});

test("hosted policy verification cannot synthesize template success from CLI status", async () => {
  const policy = await read("scripts", "lib", "hosted-auth-policy.mjs");
  const verifier = await read("scripts", "verify-hosted-auth-config.mjs");
  const deployer = await read("scripts", "deploy-hosted-auth-templates.mjs");
  const resend = await read("scripts", "resend-academy-invitation-otp.mjs");
  assert.doesNotMatch(policy, /verifyHostedAuthPolicyWithCli|tokenOnly:\s*true|config is up to date/i);
  assert.match(policy, /mailer_otp_length/);
  assert.match(policy, /hasAuthenticationLink/);
  assert.match(verifier, /SUPABASE_ACCESS_TOKEN/);
  assert.match(deployer, /method: "PATCH"/);
  assert.match(deployer, /verifyHostedAuthPolicy/);
  assert.doesNotMatch(deployer, /console\.log\(content|template bodies/i);
  assert.match(resend, /SUPABASE_ACCESS_TOKEN/);
});

test("production email delivery is blocked until the acceptance-test canary passes", async () => {
  const policy = await read("lib", "auth-email-policy.ts");
  const request = await read("app", "api", "auth", "challenges", "request", "route.ts");
  const invitation = await read("app", "api", "admin", "academy-invitations", "route.ts");
  const migration = await read("supabase", "migrations", "202606200021_auth_email_canary_gate.sql");
  assert.match(policy, /acceptance_test/);
  assert.match(policy, /production_enabled/);
  assert.match(request, /auth_email_canary_gate/);
  assert.match(invitation, /Production academy invitations are paused/);
  assert.match(migration, /hosted_auth_policy_verification_failed/);
  assert.doesNotMatch(migration, /ConfirmationURL|TokenHash|email_body|otp_value/i);
});

test("production promotion is transactional, super-admin-only, evidence-backed, and idempotent", async () => {
  const migration = await read("supabase", "migrations", "202606200022_audited_auth_email_production_promotion.sql");
  const promotion = await read("scripts", "promote-auth-email-production.mjs");
  assert.match(migration, /if not public\.is_super_admin\(\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /management_api_content_inspection/);
  assert.match(migration, /target_received_code_only is not true/);
  assert.match(migration, /target_code_accepted is not true/);
  assert.match(migration, /event_type = 'verified'/);
  assert.match(migration, /trader\.environment = 'acceptance_test'/);
  assert.match(migration, /portal\.slug = 'kaitrades'/);
  assert.match(migration, /already_promoted/);
  assert.match(migration, /auth_email_delivery_promoted/);
  assert.match(promotion, /signInWithPassword/);
  assert.match(promotion, /verifyHostedAuthPolicy/);
  assert.match(promotion, /promote_auth_email_delivery/);
  assert.doesNotMatch(promotion, /service.role|SUPABASE_SERVICE_ROLE_KEY/i);
});

test("production invitation resend requires database authorization and enforces cooldown", async () => {
  const migration = await read("supabase", "migrations", "202606200022_audited_auth_email_production_promotion.sql");
  const resend = await read("scripts", "resend-academy-invitation-otp.mjs");
  assert.match(migration, /authorize_academy_invitation_resend/);
  assert.match(migration, /production_enabled/);
  assert.match(migration, /resend_authorized/);
  assert.match(migration, /interval '60 seconds'/);
  assert.match(migration, /invitation identity and academy ownership do not match/);
  assert.match(resend, /signInWithPassword/);
  assert.match(resend, /authorize_academy_invitation_resend/);
  assert.match(resend, /authorization_event_id/);
  assert.doesNotMatch(resend, /\.from\("platform_settings"\)/);
});
