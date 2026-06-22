# Authentication

## OTP-Only Email Challenges

All email authentication challenges use a manually entered six-digit OTP. Authentication emails must render `{{ .Token }}` and must not render `ConfirmationURL`, `TokenHash`, anchors, or clickable authentication actions. Tokens expire after 900 seconds. Application resend controls and Supabase Auth both enforce a 60-second minimum interval.

Returning access remains password-based through `signInWithPassword`; OTP is used only for email verification, invitations, recovery, and email changes.

Supabase hosted template selection is action-specific. `signInWithOtp` sends **Confirm signup** when the user is missing or unconfirmed and **Magic Link** when the user is confirmed. Admin invite sends **Invite user**; password reset sends **Password recovery**; secure email update sends **Change email** to the relevant addresses; nonce renewal sends **Reauthentication**. A pre-created unconfirmed academy owner therefore receives the Confirm signup template, not Invite user or Magic Link.

Supported code-entry flows:

- Mentor and student setup: `/account-setup` sends an `email` OTP, verifies it, and only then permits the user to choose a password.
- Academy invitation: `/onboarding/invitation` redirects to the same bare `/account-setup` state machine. It accepts only the existing active invitation whose `invited_user_id` and email match the authenticated user.
- Password recovery: `/recover` sends the Supabase `recovery` challenge, verifies the recovery OTP, then permits a password update.
- Owner email change: `/dashboard/settings` sends secure email-change challenges. The owner manually enters codes delivered to both the current and new addresses before the profile email is synchronized.

Interactive sends and resends pass through `/api/auth/challenges/request`. Initial super-admin invitation sends remain server-only, and operational invitation resends use `scripts/resend-academy-invitation-otp.mjs`, which refuses to send until hosted template policy read-back succeeds. Responses for signup, invitation, and recovery do not disclose whether an account exists. Successful signup and recovery completion is recorded by the authenticated `/api/auth/challenges/complete` endpoint; invitations and email changes record completion in their tenant-aware endpoints. Audit rows store a SHA-256 email hash, purpose, event type, optional user ID, and non-secret metadata; OTP values are never stored or logged.

## Academy Owner Invitations

Only a super admin may initiate academy provisioning. Supabase Auth creates an unconfirmed immutable user, then `provision_invited_academy` atomically creates all database-owned workspace records and the invitation. The owner verifies the emailed OTP at `/onboarding/invitation`, sets a password, and accepts the invitation. Subsequent mentor access uses email and password.

Branded student login accepts `student` profiles only and additionally requires an existing `student_applications` row for the requested academy `trader_id`. A student may belong to multiple academies but each branded login validates the requested tenant independently. Trader and super-admin accounts are signed out of branded login and sent to no student destination.

Workspace owners change email through `/dashboard/settings`. Supabase secure email change sends separate OTPs to the current and new addresses. Profile synchronization occurs only after both codes are verified, preserving auth user ID, tenant ID, memberships, content, and history.

## Unified Resume Account Setup

`/account-setup` begins with email entry and never places the email in the URL. Before verification, its response and copy do not reveal whether an identity, invitation, tenant, or application exists. The server resolves one of the supported internal states: new identity, unverified identity, active or expired invitation, verified identity awaiting a password, completed account, role conflict, email correction, or inconsistent data requiring review.

Each setup attempt receives an opaque random token. Only its SHA-256 hash and lifecycle metadata are stored in `account_setup_sessions`; OTP values are never stored. Verification requires an authenticated Supabase user whose ID and normalized-email hash match the setup session and whose purpose-bound `account_setup` challenge falls within that session's validity window. Resend invalidates older incomplete setup sessions. Completion runs through the authenticated `complete_account_setup` function and cannot use the service role.

Passwords are absent from mentor onboarding and student registration requests. Password creation is exposed only after successful OTP verification. Completed accounts return to password sign-in. Expired invitations are renewed in place only through the audited super-admin operation; ownership email correction preserves the Auth user ID and tenant graph, revokes existing sessions, and requires the corrected address to be verified through account setup.

Last updated: 2026-06-20

## Provider

KaiMentors uses Supabase Auth for identity, password authentication, session cookies, and user records. Application-specific role and profile data lives in `public.profiles`.

## Current Sign-In Flow

The current production flow is password-based:

1. User opens `/login`.
2. The `LoginForm` calls `supabase.auth.signInWithPassword`.
3. The app reads `profiles.role`.
4. Users are routed by role:
   - `super_admin` -> `/admin`
   - `trader` -> `/dashboard`
   - `student` -> `/student`

Branded student login routes use the same password sign-in but restrict accepted accounts to `student`.

Canonical branded routes:

- `/portal/[slug]/login` on the KaiMentors platform domain.
- `/login` on a resolved custom academy domain.

Mentor and super-admin accounts are rejected from branded student login and must use the KaiMentors platform login.

`lib/academy-routes.ts` is the canonical route builder for academy home, Join Academy, Sign In, student area, and custom-package page navigation. It preserves `/portal/[slug]` on platform routes and uses domain-relative routes on verified custom domains.

KaiTrades uses the same authentication system as every academy. It has no fixture-only authentication bypass, duplicate login form, or package-owned registration implementation.

## Mentor Workspace Creation

Mentors create workspaces through `/onboarding`.

Required fields:

- Full name
- Academy/display name
- Legal/business name
- Portal slug
- Email

The API route `/api/trader/onboard`:

1. Validates input with Zod.
2. Checks for an existing profile.
3. Checks portal slug uniqueness.
4. Creates a Supabase Auth user without a password using the service role with `email_confirm: false`.
5. Calls `provision_trader` to create the profile, trader workspace, owner membership, and portal.
6. Deletes the Auth user if provisioning fails.

## Student User Creation

Students register from a public portal, builder website, custom site package, custom domain, or approved external website link that points into a KaiMentors-controlled route.

Canonical registration routes:

- `/portal/[slug]/join-academy`
- `/join-academy` on a resolved custom academy domain

Registration creates the student identity and student application server-side. The registration API resolves tenant context from the custom-domain hostname when present, or from the platform portal slug. It does not trust browser-submitted `portalId` or `traderId` as the source of tenant identity.

## Role Assignment

Roles are stored in `profiles.role`.

- Mentor onboarding creates a `trader` profile through the provisioning workflow.
- Student registration creates or associates a `student` profile.
- Platform ownership is represented by `super_admin`.

Tenant staff access is separately modeled in `trader_members`.

## Session Handling

Supabase session cookies are read and refreshed by `middleware.ts` through `@supabase/ssr`. Protected routes call `supabase.auth.getUser()` in middleware and route handlers/pages as needed.

## Protected Routes

Middleware protects:

- `/admin`: requires `profiles.role = super_admin`.
- `/dashboard`: requires `profiles.role = trader`, or `super_admin` with a trader membership.
- `/student`: requires `profiles.role = student`.

Custom domains rewrite public pages into `/domain-sites/[hostname]`. Dashboard/admin/onboarding routes on custom domains redirect back to the platform host from `NEXT_PUBLIC_SITE_URL`. `/academy` on a custom domain maps to the authenticated student route family.

## Authorization Rules

Authorization is enforced by:

- Middleware route gates.
- Server-side API checks.
- Database functions.
- Supabase RLS.

Browser code must never use the service-role key. Server-only APIs use `createAdminClient` only where elevated operations are required.

## Hosted Template Deployment

Local template files and `supabase config push` comparison output are not proof of hosted content. `scripts/deploy-hosted-auth-templates.mjs` writes the six template content fields through the Management API. `scripts/verify-hosted-auth-config.mjs` then reads those actual fields and reports only token/link booleans and numeric policy values; it never prints bodies or credentials. The former CLI-only fallback was removed after it falsely synthesized `tokenOnly: true` without reading hosted HTML.

The actual hosted fields were corrected and passed Management API content inspection on 2026-06-20. KaiTrades then received a six-digit code with no link and successfully consumed it. Production promotion is performed only by the authenticated `promote_auth_email_delivery` database operation: it requires a fresh Management API content summary, the verified KaiTrades signup challenge event, explicit received-email/code-entry attestations, and a `super_admin` caller. The policy and three immutable audit events are written in one transaction. Previous link clicks are not acceptance evidence.

Production invitation resends require `authorize_academy_invitation_resend`. That operation rechecks the promoted policy, caller role, pending invitation, immutable user/workspace ownership mapping, expiry, and 60-second cooldown before creating a one-use audit authorization. The service-role delivery call occurs only after this authorization; holding the service role does not satisfy the application workflow.

OTP completion clients pass the newly issued access token to the completion endpoint, which validates it through Supabase Auth before recording `verified`. This avoids relying on browser cookie propagation timing immediately after `verifyOtp`. If a historical completion row is missing, `reconcile_auth_challenge_verification` may be used only by a super admin and only for a KaiTrades signup whose matching `auth.users.email_confirmed_at` falls inside the recorded 15-minute challenge window.
