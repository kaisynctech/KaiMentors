# Changelog

## 2026-06-22 - Protected Courses Phase 1 (Application Deployed)

- Deployed commit `6828fb679121d9f186de8ad62ad0abb2e5b66246` to the existing `kaimentors` Vercel production project as deployment `dpl_7v2ywrcHmZqy4vCWDg54HUKUUZP4`, promoted at `https://kaimentors.vercel.app`.
- Verified the deployment is `Ready`, targets production, belongs to the authenticated `kaisynctech@gmail.com` account, and uses the intended Supabase and canonical-site environment variable names without exposing their values.
- Verified live `200` responses for the platform home, login, KaiTrades portal, Join Academy and branded login routes; unauthenticated dashboard, course, media, student and admin routes return login redirects; anonymous `/api/course-media` access returns `401`.
- Re-ran migration parity through `025`, the protected-course production verifier and the multi-academy audit. Private storage, anonymous denial, media-session service-role denial and unchanged KaiTrades, Traders Confidence and Milkers FX ownership/package assignments all pass.
- Production currently contains no courses or protected media and has no configured academy domains. Authenticated role, upload/playback/progress, responsive visual and custom-domain acceptance therefore remain open; Protected Courses Phase 1 remains `Partially Complete` rather than recording unobserved tests as passed.
- `npm test`, `npm run typecheck` and `npm run build` pass for the deployed source revision.

## 2026-06-21 - Protected Courses Phase 1 (Database Deployed)

- Added Course -> Module -> Lesson structured curriculum while preserving existing course, lesson, resource and storage identities.
- Added typed text, video, PDF, image, ordered gallery, link and supporting-resource content, including transactional block creation.
- Added a reusable tenant-scoped Media Library with direct resumable TUS uploads, MIME/extension/size/signature validation, lifecycle tracking, safe replacement and reference-protected deletion.
- Centralized all-verified, group, individual and strict one-to-one access in `can_access_course`; removed student direct storage reads and added five-minute audited media sessions.
- Added durable lesson progress, resume, percentages, My Learning, Continue Watching, Completed, mentor progress reporting and active-learner warnings for curriculum changes.
- Rebuilt mentor course management into an enterprise table plus Overview, Curriculum, Resources, Access, Students and Settings tabs; added responsive mixed-media student playback and watermarking.
- Applied migration `202606210025_protected_courses_curriculum_media_progress.sql`; local and remote migration history now match through `025`.
- Added `scripts/verify-protected-courses-production.mjs`. Remote verification confirms all new tables, a private 500 MB course bucket, anonymous protected-read denial, service-role media-session bypass denial, false access for unknown courses, three intact academy tenants, and zero pre-existing course/media/progress records.
- Protected-course regression tests, TypeScript checking, and the production build pass. Application deployment was completed on 2026-06-22; live authenticated role/browser acceptance remains pending.

## 2026-06-20 - Unified Resume Account Setup (Production Deployed)

- Added one server-authoritative `/account-setup` flow for unverified identities, active/expired invitations, verified identities awaiting passwords, completed accounts, role conflicts, owner-email corrections, and inconsistent-data review.
- Removed password collection from mentor onboarding and student registration; password creation now follows verified OTP ownership only.
- Added enumeration-safe setup initiation, opaque hashed setup sessions, purpose/window-bound verification, resend invalidation, replay-resistant completion, and generic duplicate-registration continuation.
- Added super-admin-only audited renewal of existing invitations and immutable-ID owner email correction with session revocation and compensating Auth rollback.
- Added and remotely applied migration `202606200024_unified_account_setup_lifecycle.sql` with private setup/correction tables, uniqueness constraints, RLS, and authenticated completion functions.
- Added admin renewal and owner-email correction controls, branded setup/recovery entry links, and automated lifecycle/security regression coverage.
- Verified remote migration parity, unchanged academy ownership/package IDs, anonymous denial for private lifecycle tables, service-role denial for account completion, and successful hosted acceptance of an `account_setup` challenge. The production Vercel application still returns `404` for `/account-setup`, so application promotion and final browser/code-entry acceptance remain open.
- Added `.vercelignore` so direct production deployment excludes local secrets, generated files, test sources, and the unrelated standalone `Milkers-Fx` website folder from the KaiMentors artifact.
- Deployed the application to the linked KaiMentors Vercel project and promoted it to `https://kaimentors.vercel.app`.
- Verified the live setup, login, onboarding and KaiTrades branded routes; confirmed protected admin, dashboard and student redirects; confirmed desktop/mobile responses and the deployed responsive breakpoint.
- Verified production setup initiation against an existing KaiTrades owner and a non-existent reserved address: response messages and shapes match, opaque tokens are returned, and no account state is exposed. Final code entry remains mailbox-controlled and is not automated or logged.

## 2026-06-20 - Audited OTP Production Promotion

- Recorded the successful KaiTrades code-only received-email and code-entry canary as the prerequisite for production promotion.
- Added migration `202606200022_audited_auth_email_production_promotion.sql` with a transactional, authenticated-super-admin-only promotion operation.
- Required fresh Management API content inspection, a verified KaiTrades signup event, and explicit human attestations in the same promotion transaction.
- Added immutable hosted-policy, canary-acceptance, policy-promotion, and invitation-resend authorization audit events without storing secrets or email/template content.
- Added a database-authorized production invitation resend workflow with identity/tenant integrity checks, expiry validation, advisory locking, and cooldown enforcement.
- Removed direct service-role authorization from the operational resend script; service role is limited to delivery after super-admin database authorization.
- Found that the successful KaiTrades provider confirmation was not mirrored into `auth_challenge_events`; Supabase Auth showed confirmation within the original challenge window.
- Added migration `202606200023_reconcile_auth_challenge_completion.sql` for super-admin-only, provider-derived, idempotent completion reconciliation.
- Updated signup and recovery completion calls to send the newly issued bearer session explicitly and validate it server-side, eliminating immediate cookie-propagation timing as an audit dependency.
- Applied migrations `022` and `023`, reconciled KaiTrades from provider evidence as verified event `3`, and promoted production delivery through the authenticated audit transaction.
- Authorized Milkers FX resend as event `4`; Supabase Auth accepted the send while preserving the existing user, tenant, portal, membership, package, assignment, and invitation records.

## 2026-06-20 - Hosted OTP Verification Correction

- Retracted the 2026-06-19 hosted verification claim after a received confirmation email still contained an authentication link.
- Traced Supabase dispatch: unconfirmed `signInWithOtp` users receive Confirm signup; confirmed users receive Magic Link; invite, recovery, email change, and reauthentication use their corresponding templates.
- Removed the synthetic CLI-only verifier and require actual Management API content inspection.
- Genuine inspection found links in confirmation, invite, recovery, and email-change bodies; Magic Link and reauthentication were already token-only.
- Deployed all six token-only hosted bodies directly and verified their actual content without logging bodies or credentials.
- Added migration `202606200021_auth_email_canary_gate.sql`, recorded the failed verification, and restricted delivery to `acceptance_test` identities pending a KaiTrades received-email/code-entry canary.
- Preserved Milkers FX records and blocked any further production resend until canary approval.

## 2026-06-19 - OTP-Only Email Authentication Challenges

- Added token-only Supabase templates for confirmation, invitation, recovery, magic-link endpoint emails, and email changes.
- Standardized six-digit OTPs, 15-minute expiry, and one-minute send/resend throttling.
- Centralized challenge requests with enumeration-safe responses and no browser-supplied tenant identity.
- Added migration `202606190020_auth_challenge_audit.sql`; only purpose, lifecycle, optional user ID, one-way email hash, and non-secret metadata are stored.
- Added code-entry and resend UX for academy invitations, mentor/student signup, password recovery, and secure owner email changes.
- Removed the super-admin confirmed-email bypass and link-oriented invitation redirect.
- Added hosted Auth configuration read-back verification, a verification-gated existing-invitation resend operation, replay-resistant authenticated completion auditing, and 13 automated authentication/isolation tests.
- Historical note: the CLI reported Auth `up_to_date`, but that did not prove hosted content and was later retracted on 2026-06-20.
- Historical note: Milkers FX was resent after the invalid check. Its immutable IDs remained preserved, but no further production resend is allowed before canary approval.

## 2026-06-18 - Phase 1 Multi-Academy Foundation

- Applied migrations `014`-`018`; KaiTrades is an active `acceptance_test` tenant with an independent package.
- Renamed the existing `silence` tenant and portal in place to Traders Confidence and assigned only the matching package.
- Provisioned Milkers FX with a unique Auth user, tenant, portal, membership, package assignment and pending OTP invitation.
- Added `core_page` as the default website delivery mode, approved risk-disclosure templates, and a responsive Core Academy Page for portal/custom-domain delivery.
- Deprecated mentor-facing Website Builder routes without deleting legacy templates, pages, sections, media, releases or renderers.
- Restricted legacy builder save, media and release APIs to super admins while retaining schema-approved custom-package content overrides for mentors.
- Restricted package and domain administration to super admins; added `/admin/domains`.
- Required branded student login to prove an application for the requested academy.
- Added atomic invitation provisioning, audited ownership transfer, and compensating owner-email update workflows.
- Added multi-academy audit/provisioning scripts and expanded automated isolation tests from four to seven.
- DNS validation for Traders Confidence returned no apex or `www` records; no placeholder domain/provider record was created.
- Added migration `019` after live role-based RLS testing exposed cross-tenant reads of legacy builder drafts; draft metadata is now tenant-only and public release snapshots require active `builder_template` delivery.

All notable KaiMentors changes must be recorded here. Documentation updates are part of the Definition of Done.

## 2026-06-18

- Added and applied migration `202606180014_kaitrades_acceptance_test_fixture.sql` with `tenant_environment`, independent KaiTrades package metadata and route rules, slug-scoped fixture assignment, and an isolation assertion.
- Added the independent `/public/custom-sites/kaitrades/v1` asset tree with KaiTrades branding and non-client acceptance-test content.
- Added `lib/academy-routes.ts` and moved builder, branded entry, custom-package entry, and custom-package page navigation to the centralized academy route resolver.
- Corrected custom-package platform routing so internal pages and reserved Join Academy/Sign In links retain `/portal/[slug]` context.
- Added acceptance-test environment badges to platform mentor and custom-site administration tables.
- Added executable route, package-content, asset-isolation, and migration-scoping tests through `npm test`.
- Added `PRODUCT_STATUS.md` and documented KaiTrades as a non-client acceptance-test tenant.

## 2026-06-17

- Added Academy Website Entry System Phase 1 foundation with canonical Join Academy and Sign In flows across platform portals, Website Builder sites, custom site packages, custom domains, and approved external website links.
- Added `/portal/[slug]/join-academy`, `/portal/[slug]/login`, and custom-domain `/join-academy` routing.
- Replaced custom-domain login rendering with the shared branded academy login page.
- Updated student registration to resolve tenant context server-side from the custom-domain hostname or platform portal slug instead of trusting hidden `portalId` or `traderId` browser fields.
- Updated student status, courses, lessons, and messages to preserve academy context from custom domains or platform portal query parameters.
- Updated Website Builder and custom site renderers so every academy website exposes Join Academy and Sign In actions.
- Standardized student-facing status language for pending, processing, verified, rejected, and needs-more-information states.
- Corrected documentation discrepancies for `website_delivery_mode`, `custom_site_assignment_status`, `student_applications`, `verification_attempts`, and `custom_site_route_rules` names/columns.
- Added the Project Synchronization Rule requiring architecture prompts to be based on current documentation, changelog state, affected module docs, and explicit documentation inconsistency handling before Engineering receives implementation instructions.
- Updated the required Engineering prompt output format to include task title, architecture constraints, implementation requirements, database and migration requirements, RLS and security requirements, UI/UX requirements, acceptance criteria, and required delivery summary.
- Expanded the Enterprise Architect prompt-generation rules to require affected-system review across documentation, database structures, RLS policies, authentication flows, tenant isolation, Website Builder, broker verification, course access, custom domains, related code surfaces, and tests.
- Added `ENTERPRISE_ARCHITECT_INSTRUCTIONS.md` to define the KaiMentors Enterprise Architect role, required analysis flow, implementation prompt standards, testing expectations, documentation requirements, and production-readiness rules.
- Documented enterprise architecture governance in `SYSTEM_OVERVIEW.md`.
- Added the living `/docs` documentation system covering system overview, database, authentication, multi-tenancy, website builder, students, brokers, courses, storage, security, audit logging, deployment, changelog, and architecture decisions.
- Documented the current password-based Supabase authentication flow and clarified that OTP-only login is not the active implemented login model.
- Added architecture decision tracking in `ARCHITECTURE_DECISIONS.md`.
- Implemented platform-admin protection for custom website package assignment with migration `202606170013_lock_custom_site_package_assignment.sql`.
- Added super-admin console routes for platform overview, mentors/traders, custom sites, brokers, subscriptions, audit logs, and settings.
- Added admin custom site assignment workflow.
- Promoted `kaisynctech@gmail.com` to `super_admin` in the Supabase project while preserving mentor workspace membership.
- Allowed super admins with trader membership to access their mentor workspace without login loops.
- Added custom website package architecture with migration `202606170012_custom_website_packages.sql`.
- Added custom site package rendering and tenant-safe content override management.

## 2026-06-15

- Added custom domain and website release architecture with migration `202606150010_custom_domains_and_website_releases.sql`.
- Added website draft saving, publishing, rollback, unpublish, release snapshots, and publication pointers.
- Added domain records, domain events, Vercel domain provider integration, and public custom-domain resolution.
- Added migration `202606150011_fix_bulk_student_review_uuid_aggregate.sql` to fix bulk student review UUID aggregation.

## 2026-06-12

- Added Website Builder foundation with migration `202606120006_website_builder_foundation.sql`.
- Added template metadata, pages, sections, theme settings, media, navigation, template application, and default templates.
- Added enterprise student review workflows with migration `202606120007_enterprise_student_review_workflows.sql`.
- Added student groups, content entitlements, and messaging with migration `202606120008_student_groups_entitlements_messaging.sql`.
- Added automatic all-students system group with migration `202606120009_system_all_students_group.sql`.

## 2026-06-11

- Added initial Supabase schema with profiles, traders, members, portals, brokers, trader broker accounts, student applications, verification attempts, courses, lessons, resources, announcements, live classes, subscriptions, platform settings, audit logs, storage buckets, RLS policies, and provisioning functions.
- Added portal branding fields with migration `202606110002_portal_branding.sql`.
- Added broker account and student verification workflow migrations `202606110003_broker_accounts_student_verification.sql` and `202606110004_broker_accounts_student_workflows.sql`.
- Added course video and audit updates with migration `202606110005_courses_and_video_audit.sql`.
