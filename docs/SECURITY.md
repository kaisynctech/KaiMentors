# Security

## Email Challenge Security

- OTPs are six digits, purpose-specific, single-use, and expire after 15 minutes.
- Password login remains the returning-login mechanism; email challenges cannot silently authenticate through a link.
- Signup, invitation, and recovery requests return non-enumerating responses.
- A one-minute per-email-hash and purpose throttle runs before account lookup; Supabase `max_frequency = "1m"` provides the provider boundary.
- Invitation acceptance requires authenticated user ID, normalized email, pending state, and unexpired invitation to match.
- Secure email change requires current-address and new-address OTP verification. The former super-admin email-confirmation bypass was removed.
- Recovery permits password mutation only after a `recovery` OTP establishes an authenticated recovery session.
- Signup and recovery completion audits require an authenticated matching user, a matching one-way email hash, and an unconsumed challenge request inside the 15-minute window.
- Consumed and expired OTPs are rejected by Supabase Auth, preventing replay. Codes are never persisted in application tables, logs, analytics, URLs, or redirects.
- Hosted verification must inspect `mailer_templates_*_content` through the Management API. CLI equality, local files, subjects, and content paths are insufficient evidence.
- `auth_email_delivery_policy` fails closed to `canary_only`. Promotion to `production_enabled` is an authenticated, advisory-locked database transaction restricted to `super_admin`; it validates fresh hosted-content evidence and a verified KaiTrades acceptance-test event before changing policy.
- Production invitation resend authorization is separate from delivery. `authorize_academy_invitation_resend` validates the promoted policy, actor, invitation identity, tenant ownership, expiry, and cooldown and writes an immutable authorization event before server-only delivery.
- OTP completion accepts a bearer access token only after server-side validation with Supabase Auth; tokens are never logged or persisted. Missing historical completion evidence cannot be manually asserted: reconciliation is super-admin-only and derives email identity and confirmation time directly from `auth.users` within the original challenge window.
- The 2026-06-19 verification claim was retracted after an actual received confirmation email contained a link. Migration `021` records the failure without storing the email, body, OTP, or credential.
- Resume Account Setup stores only an opaque setup-token hash and email hash. Its pre-verification response is enumeration-safe, verification is bound to the authenticated user and setup challenge window, older incomplete sessions are invalidated on resend, and completion is unavailable to the service role.
- Passwords are never accepted by mentor onboarding or student registration. Password creation follows verified setup only. Invitation renewal and owner-email correction are super-admin-only, audited, preserve immutable ownership IDs, and revoke prior sessions when an address is corrected.

## Multi-Academy Controls

- Core, custom-package, legacy builder and domain rendering resolve the portal server-side.
- Branded student login verifies both the `student` role and an application belonging to the requested `trader_id`.
- Custom package assignment RPCs reject normal authenticated users; platform APIs require `super_admin`. Service-role execution is confined to server provisioning after platform-owner validation.
- Domain reserve, verify, primary and remove actions require `super_admin`; mentor-facing domain routes redirect to Academy Page settings.
- Approved risk disclosures are platform-managed and referenced by FK; mentors cannot inject arbitrary compliance text through branding updates.
- Invitation provisioning is atomic after Auth user creation. Failure deletes the unprovisioned Auth user.
- Ownership transfers are explicit, reasoned, transactional and audited. Account email changes preserve IDs and compensate on partial failure.
- Migration `019` removes direct public/authenticated reads from legacy builder draft pages, sections, themes, media metadata and navigation. Only the current release snapshot of an actively published `builder_template` portal is public; switching to Core Page or a custom package immediately closes historical builder snapshots.

Last updated: 2026-06-20

## Security Model

## Protected Course Media

- Students have no direct `storage.objects` SELECT policy for `course-content`.
- A media request calls `issue_course_media_session`, which proves a published reference and current `can_access_course` authorization and records an expiring session.
- The server signs the authorized object for five minutes and returns it with `Cache-Control: no-store, private`.
- TUS uploads go directly from an authenticated tenant member to Supabase Storage; Next.js receives metadata only.
- MIME, extension, size and binary signature are validated before readiness. Cross-tenant references are blocked by composite foreign keys and RPC checks.
- Watermarks and browser controls are deterrence, not DRM; a legitimately rendered asset can still be captured by the endpoint device.

KaiMentors uses layered security:

- Supabase Auth for identity.
- Middleware for route-level role routing.
- PostgreSQL RLS for tenant and student isolation.
- Server-only APIs for privileged operations.
- Storage policies for file access.
- Edge Functions for broker API calls.

## RLS Policies

All business tables have RLS enabled. Policies generally follow these rules:

- Public can read published portal and website data only.
- Students can read their own records.
- Verified students can read published content for their tenant.
- Restricted content requires group or direct entitlement.
- Tenant members manage tenant-owned records.
- Super admins manage platform-level records.

## Protected Routes

Middleware protects `/admin`, `/dashboard`, and `/student`.

- `/admin` requires `super_admin`.
- `/dashboard` requires `trader`, or `super_admin` with trader membership.
- `/student` requires `student`.

Custom-domain requests to protected dashboard/admin/onboarding pages redirect to the platform host.

## Authorization Model

Authorization decisions are based on:

- `profiles.role`
- `trader_members`
- `student_applications.status`
- group membership
- content access grants
- RLS helper functions

## Academy Website Entry Security

The Academy Website Entry System centralizes student registration and login for builder websites, custom site packages, custom domains, and approved external websites.

Security rules:

- New students enter through `/portal/[slug]/join-academy` or `/join-academy` on a resolved custom domain.
- Existing students enter through `/portal/[slug]/login` or `/login` on a resolved custom domain.
- Branded student login accepts only `student` role accounts.
- Trader and super-admin accounts are signed out/rejected from branded student login and must use platform routes.
- Registration resolves the tenant server-side from the custom-domain hostname or portal slug.
- The registration API no longer depends on browser-submitted `portalId` or `traderId`.
- Custom websites must link to KaiMentors-controlled registration and login routes; they do not implement their own auth, registration, verification, permissions, course access, or messaging.
- Custom-package internal pages and reserved student links are rewritten through the centralized academy route resolver, preserving the portal slug on the platform domain and the hostname on custom domains.

## Secrets Handling

Required secrets:

- `SUPABASE_SERVICE_ROLE_KEY`
- `VERCEL_TOKEN`
- Broker credentials used by Edge Functions or Vault-backed adapter configuration.

Rules:

- Never expose service-role keys to browser code.
- Keep server-only keys outside `NEXT_PUBLIC_*`.
- Store broker secrets in secure server-side configuration.
- Do not commit `.env.local`.

## Service Role Usage

The service role is used only in server contexts such as:

- Mentor onboarding user creation.
- Admin-only assignment workflows.
- Server-side registration/provisioning operations.
- Domain automation where required.

Every service-role operation must validate authorization before mutation.

## Edge Function Security

Broker verification runs through Supabase Edge Functions so broker APIs are not called directly from frontend code. Adapter logic should validate input, load credentials securely, and return only safe verification results.

## Custom Site Assignment Security

Custom website packages can be viewed by assigned tenants, but assignment and delivery mode changes are platform-admin operations. This prevents one mentor from assigning another client's custom website to their own portal.

KaiTrades is marked `acceptance_test` but receives no elevated privileges. Its package and asset path are independent from Traders Confidence. Migration `014` derives the KaiTrades trader and portal relationship from the unique `kaitrades` slug, validates the resulting package assignment, and embeds no tenant UUID.

## Security Change Rule

Any future change to roles, permissions, RLS, storage policies, service-role usage, domain routing, or Edge Function behavior must update this document and `CHANGELOG.md`.
