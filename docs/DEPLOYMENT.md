# Deployment

## Hosted Auth OTP Policy

The authoritative local Auth policy is in `supabase/config.toml` and `supabase/templates/*.html`:

- Production site URL: `https://kaimentors.vercel.app`
- Local callback allow-list: `http://localhost:3000/**`
- OTP length: 6
- OTP expiry: 900 seconds
- Minimum send interval: 1 minute
- Token-only templates: confirmation, invitation, recovery, magic-link endpoint email, email change, and reauthentication

Deploy and inspect actual hosted content with `SUPABASE_ACCESS_TOKEN` available only in the operator environment:

```powershell
$env:SUPABASE_PROJECT_REF='jsbpfhfmumjbrnymhtvq'
node scripts/deploy-hosted-auth-templates.mjs
node scripts/verify-hosted-auth-config.mjs
```

The verifier must succeed before a canary send, but verifier success alone does not enable production. A human must confirm the received KaiTrades email has a six-digit code and no link, then successfully consume the code. A service-role key cannot deploy or read hosted templates and must not substitute for the management credential.

After the mailbox owner confirms the KaiTrades code-only email and successful code entry, authenticate an operator through the normal Supabase password flow and run the audited promotion. `SUPABASE_ACCESS_TOKEN`, `KAIMENTORS_OPERATOR_EMAIL`, and `KAIMENTORS_OPERATOR_PASSWORD` must be supplied through the operator shell or encrypted CI secrets and must not be committed or logged:

```powershell
node scripts/promote-auth-email-production.mjs --confirm-received-code-only --confirm-code-accepted
```

The command performs a fresh Management API read-back and calls the super-admin-only transactional database operation. It cannot write policy with the service role. Only after that operation reports `production_enabled` may an existing production invitation be resent:

```powershell
node scripts/resend-academy-invitation-otp.mjs --email owner@example.com
```

The resend command authenticates the operator and obtains `authorize_academy_invitation_resend` approval before delivery. Direct service-role policy updates or unaudited resend scripts are unsupported and prohibited.

Current hosted state (2026-06-20): `auth_email_delivery_policy.mode = production_enabled`. KaiTrades canary event `3` supports the audited promotion. Milkers FX resend authorization event `4` was accepted by Supabase Auth; the existing invitation remains pending until owner code entry.

The resend command repeats genuine hosted-content verification, validates the pending invitation against its immutable Auth user and owner membership, enforces the cooldown, and reports preserved record IDs without exposing a token.

Correction record (2026-06-20): the 2026-06-19 CLI-only verification was invalid because it did not inspect hosted HTML. Genuine read-back found link templates for confirmation, invite, recovery, and email change. All six challenge bodies were then deployed directly and genuine content inspection passed. KaiTrades subsequently passed the received-email/code-entry canary. Migration `022` introduced the audited promotion and resend-authorization workflow required before Milkers FX delivery.

## Multi-Academy Operations

Apply migrations `015` through `019` in order. `015` adds the enum value in its own transaction; `016` introduces Core Page data/workflows and reconfigures Traders Confidence in place; `017` guarantees the default risk FK for every new portal; `018` provides atomic invitation provisioning and activates the KaiTrades fixture; `019` closes legacy builder cross-tenant draft reads.

Platform operators may use `scripts/provision-academy-invitation.mjs` with server credentials; it refuses duplicate email/slug values and resolves packages and the inviting super admin without tenant UUIDs. `scripts/audit-multi-academy.mjs` is a read-only ownership/package/resource matrix audit.

Migration `024` introduces the unified Resume Account Setup lifecycle and was applied remotely on 2026-06-20. The matching application release was subsequently deployed to the linked Vercel project and aliased to `https://kaimentors.vercel.app`. The route depends on `account_setup_sessions`, `academy_owner_email_corrections`, `complete_account_setup`, `renew_academy_invitation`, and the extended challenge-purpose constraint. Production route, RLS, tenant-integrity, enumeration-safety and provider-send checks passed; mailbox-held code entry remains a manual acceptance step because OTP values are never available to engineering automation.

`www.tradersconfidence.com` and the apex did not resolve during the 2026-06-18 validation, so no `website_domains` row or Vercel provider mutation was created. After DNS ownership is confirmed, add `www` as primary and the apex as a redirecting alias through `/admin/domains`.

Last updated: 2026-06-22

## Stack

- Next.js 15 App Router
- React 19
- TypeScript
- Supabase Auth, PostgreSQL, Storage, Edge Functions
- Vercel production deployment

## Environment Variables

Required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`

Custom domain automation:

- `KAIMENTORS_PLATFORM_HOSTNAMES`
- `VERCEL_TOKEN`
- `VERCEL_PROJECT_ID`
- `VERCEL_TEAM_ID` when the Vercel project belongs to a team

## Local Setup

1. Copy `.env.example` to `.env.local`.

## Deployment Artifact Boundary

`.vercelignore` excludes local secrets, generated output, dependencies, test sources, Supabase temporary state, Git internals, and the separate `Milkers-Fx` standalone website source from the KaiMentors Vercel upload. Production application code, public custom-site assets, migrations, and operational scripts remain in the repository; only files needed by the Next.js build are sent in the direct CLI deployment artifact.
2. Add Supabase and deployment values.
3. Install dependencies:

```bash
npm install
```

4. Run development server:

```bash
npm run dev
```

5. Open the local Next.js URL shown in the terminal, typically `http://localhost:3000`.

## Build and Typecheck

```bash
npm test
npm run typecheck
npm run build
```

Both commands should pass before production deployment.

## Supabase Setup

Migration `202606210025_protected_courses_curriculum_media_progress.sql` introduces structured curriculum, normalized course media, gallery media, progress, short-lived media sessions, access RPCs, composite tenant constraints, indexes, triggers and RLS. It was remotely applied on 2026-06-21. `supabase migration list` confirms local/remote parity through `025`; `node scripts/verify-protected-courses-production.mjs` verifies deployed tables, the private bucket contract, anonymous denial, service-role media-session denial, authorization behavior, and tenant/course counts. The matching application commit `6828fb679121d9f186de8ad62ad0abb2e5b66246` was promoted on 2026-06-22 as Vercel deployment `dpl_7v2ywrcHmZqy4vCWDg54HUKUUZP4` at `https://kaimentors.vercel.app`. Live authenticated role, media workflow, responsive visual and custom-domain acceptance remain separate release gates.

Large course assets upload directly through the Supabase Storage TUS endpoint. Production must allow authenticated resumable uploads to the private `course-content` bucket; the service-role key remains server-only and is used only to sign a path already authorized by `issue_course_media_session`.

Apply migrations in order from `supabase/migrations`:

1. `202606110001_initial_schema.sql`
2. `202606110002_portal_branding.sql`
3. `202606110003_broker_accounts_student_verification.sql`
4. `202606110004_broker_accounts_student_workflows.sql`
5. `202606110005_courses_and_video_audit.sql`
6. `202606120006_website_builder_foundation.sql`
7. `202606120007_enterprise_student_review_workflows.sql`
8. `202606120008_student_groups_entitlements_messaging.sql`
9. `202606120009_system_all_students_group.sql`
10. `202606150010_custom_domains_and_website_releases.sql`
11. `202606150011_fix_bulk_student_review_uuid_aggregate.sql`
12. `202606170012_custom_website_packages.sql`
13. `202606170013_lock_custom_site_package_assignment.sql`
14. `202606180014_kaitrades_acceptance_test_fixture.sql`

Migration `014` adds tenant environment classification, registers the independent KaiTrades package, and assigns it only when a portal with the unique slug `kaitrades` exists. It is idempotent and contains no hard-coded tenant UUID.

Storage buckets and policies are created by migrations.

## Edge Functions

Current Edge Function:

- `verify-broker-account`

Deploy Edge Functions through the Supabase deployment workflow for the project. Broker credentials must remain server-side.

## Production Deployment

KaiMentors is deployed on Vercel. Production deployment should include:

- Environment variables configured in Vercel.
- Supabase migrations applied to the target project.
- Edge Functions deployed where required.
- `npm run typecheck` and `npm run build` passing locally or in CI.

Verified production target (2026-06-22): Vercel account `kaisynctech@gmail.com`, project `kaimentors`, project ID `prj_v5pFoUa3OhLwKOMY4dUC8TZstyvs`, owner team `team_Deabz0eyNfw8iDJDBmmdAnMg`, and canonical alias `https://kaimentors.vercel.app`. Production configuration contains `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `NEXT_PUBLIC_SITE_URL`; values remain encrypted or local and are never documented.

Protected Courses Phase 1 production release (2026-06-22): deployment `dpl_7v2ywrcHmZqy4vCWDg54HUKUUZP4` is `Ready` and serves the canonical alias. Public academy routes, protected-route redirects and anonymous course-media denial passed live HTTP checks. Production has no courses or protected media and `website_domains` is empty, so release completion still requires a controlled KaiTrades course/media fixture, authenticated role acceptance, desktop/mobile visual acceptance, and a verified academy domain.

## Custom Domains

Custom-domain automation requires Vercel credentials and project configuration. Domains are tracked in `website_domains`; DNS/SSL lifecycle events are tracked in `website_domain_events`.

Canonical student entry routes expected in production:

- `/portal/[slug]/join-academy`
- `/portal/[slug]/login`
- `/join-academy` on a resolved custom academy domain
- `/login` on a resolved custom academy domain
- `/academy` on a resolved custom academy domain

External websites should link to these KaiMentors-controlled URLs for the relevant academy.

## Documentation Deployment Rule

Any production change must include updated `/docs` files when behavior, schema, routes, security, deployment, or business workflows change.
