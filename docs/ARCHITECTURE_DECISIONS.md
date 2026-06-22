# Architecture Decisions

## 2026-06-21: One Protected Curriculum and Media Authorization Engine

Decision: Model learning as Course -> Module -> Lesson -> typed content blocks, store reusable assets in normalized tenant-owned media records, and authorize all student course/media reads through `can_access_course`.

Reason: Flat video lessons, path-only media and separate access checks cannot safely support mixed media, reuse, one-to-one delivery, progress, or reliable tenant isolation at scale.

Impact: Migration `025` adds modules, blocks, gallery media, media lifecycle, progress, media sessions and transactional RPCs. Large uploads use direct resumable TUS; students receive only short signed URLs after an audited database authorization. Existing IDs and legacy paths are preserved.

## 2026-06-20: One Server-Authoritative Resume Account Setup State Machine

Decision: Mentor onboarding, student registration, academy invitation activation, and incomplete-account recovery continue through one bare `/account-setup` route. Registration creates no password; the password step appears only after a purpose-bound OTP verifies the immutable Auth identity.

Reason: Separate setup paths created inconsistent recovery behavior and risked duplicate users, tenants, memberships, applications, and invitations when a person restarted an incomplete journey.

Impact: Migration `024` adds private hashed setup sessions, invitation renewal and owner-email correction workflows, uniqueness constraints, and authenticated completion. Pre-verification responses are enumeration-safe, role/ownership conflicts fail closed, and returning login remains password-based.

## 2026-06-20: Authentication Email Promotion Is a Database-Controlled Operation

Decision: Production email delivery and invitation resends require authenticated super-admin database operations. Management API verification, provider-backed canary evidence, human received-email acceptance, policy transition, cooldown authorization, and audit records are linked rather than independently trusted by scripts.

Reason: A canary gate without a promotion workflow left the service-role resend command capable of making its own authorization decision, and browser session propagation omitted one successful completion audit row.

Impact: Migrations `022` and `023` add transactional promotion, provider-derived completion reconciliation, resend authorization, advisory locking, idempotency, and immutable evidence. OTP clients explicitly provide their newly issued bearer session for server validation.

## 2026-06-20: Hosted Email Policy Requires Content Inspection and Canary Evidence

Decision: CLI configuration equality cannot authorize authentication email delivery. Verification must inspect actual hosted `mailer_templates_*_content` fields, and production remains blocked until an `acceptance_test` received-email/code-entry canary passes.

Reason: A CLI-only verifier synthesized token-only results from local configuration while hosted confirmation, invite, recovery, and email-change templates still contained authentication links.

Impact: The CLI fallback was removed, six template bodies are managed directly through the Management API, `auth_email_delivery_policy` gates sends, KaiTrades is the canary, and previous link clicks are never considered verification evidence.

## 2026-06-19: Email Challenges Are OTP-Only

Decision: Every KaiMentors email authentication challenge uses a manually entered six-digit OTP. Returning login remains email and password.

Reason: Link-based authentication conflicts with the application UX, creates inconsistent challenge handling, and can authenticate through forwarded or automatically opened links.

Impact: All hosted templates use `{{ .Token }}` without links; OTP expiry is 15 minutes; resends are centrally throttled and audited; recovery and secure two-address email-change code-entry flows are implemented; hosted template read-back is mandatory before production sends.

## 2026-06-18: Core Academy Page Is the Default Delivery Mode

Decision: Use `core_page` for new academies and retain builder/external modes as legacy. Custom packages remain platform assigned.

Reason: Every academy needs a reliable branded front door without requiring a website build, while bespoke sites must not duplicate KaiMentors business systems.

Impact: Website Builder mentor routes are retired, legacy records still render, approved branding is mentor editable, and package/domain controls are super-admin-only.

## 2026-06-18: Academy Provisioning and Ownership Are Audited Workflows

Decision: Provision invited academies atomically after immutable Auth user creation and represent ownership changes in a dedicated transfer ledger.

Reason: Direct row edits can orphan records, lose history, or cross tenant boundaries.

Impact: `academy_invitations`, `provision_invited_academy`, `trader_ownership_transfers`, secure self-service owner email confirmation, and audit events are required administration paths.

Last updated: 2026-06-20

This file records major KaiMentors product and engineering decisions. Add a new entry whenever a decision changes architecture, data ownership, authentication, permissions, deployment, integrations, or core business workflows.

## 2026-06-18

Decision: Maintain KaiTrades as a structurally identified, isolated acceptance-test tenant with its own custom website package.

Reason: A permanent academy fixture is needed to validate the full client experience without displaying client branding or risking client-owned students, brokers, content, assignments, releases, media, or domains.

Impact: Migration `202606180014_kaitrades_acceptance_test_fixture.sql` adds `traders.environment`, registers `kaitrades` package version 1, and atomically assigns it to the portal resolved by slug. The package has its own asset tree and route rules. Acceptance-test classification does not bypass RLS.

## 2026-06-18

Decision: Resolve all academy website and student-entry links through one context-aware route module.

Reason: Relative custom-package links were correctly mapped on custom domains but could lose the academy slug when rendered under `/portal/[slug]`.

Impact: `lib/academy-routes.ts` now owns academy home, internal page, Join Academy, Sign In, and student-area URLs for builder sites, custom packages, platform portals, and custom domains.

## 2026-06-17

Decision: Centralize all academy website student entry through KaiMentors-controlled Join Academy and Sign In routes.

Reason: Builder sites, custom packages, custom domains, and approved external websites need one consistent tenant-aware path into registration, login, verification, status, courses, groups, messaging, and permissions.

Impact: `/portal/[slug]/join-academy`, `/portal/[slug]/login`, custom-domain `/join-academy`, custom-domain `/login`, and custom-domain `/academy` are the canonical student entry routes. Registration resolves tenant context server-side from the hostname or portal slug, and custom websites must not duplicate KaiMentors auth or student systems.

## 2026-06-17

Decision: Documentation is part of the Definition of Done.

Reason: KaiMentors is growing into an enterprise-grade SaaS product. Developers and business owners need a reliable source of truth that reflects the actual system.

Impact: Every future feature, database change, API change, UI change, security change, integration, or business workflow change must update the relevant `/docs` files and `CHANGELOG.md`.

## 2026-06-17

Decision: Use password login for returning users instead of requiring OTP for every sign-in.

Reason: Mentors should not need to request a new code every time they return. The product direction clarified that OTP/code verification should be a first-time verification concept, while normal access should use email and password.

Impact: `/login` uses `supabase.auth.signInWithPassword`. Documentation and future auth work must distinguish returning-user login from first-time verification.

## 2026-06-17

Decision: Only KaiMentors platform admins can assign custom website packages.

Reason: Mentors must not be able to assign another client's custom website to their own portal. Custom websites are platform-owned packages assigned by the KaiMentors owner/operator.

Impact: Migration `202606170013_lock_custom_site_package_assignment.sql` restricts package assignment and delivery-mode changes to `super_admin`. Mentors can view assigned packages and update safe content overrides only.

## 2026-06-17

Decision: Support custom-built websites as first-class website packages.

Reason: Many clients need bespoke websites rather than generic templates, while still using KaiMentors for student login, portal access, verification, and content.

Impact: Migration `202606170012_custom_website_packages.sql` introduced `custom_site_packages`, `custom_site_assignments`, `custom_site_route_rules`, and portal delivery modes.

## 2026-06-12

Decision: Website Builder replaces Portal Branding as the long-term public website system.

Reason: Mentors should receive a complete academy website experience, not only a branded landing page.

Impact: The template engine introduced website templates, pages, sections, theme settings, media, navigation, preview, and publishing.

## 2026-06-12

Decision: Add student groups and entitlements before broad content expansion.

Reason: Mentors need different access levels such as general students, VIP students, and one-on-one students.

Impact: Student groups, content access grants, restricted content scopes, and messaging conversations were added.

## 2026-06-11

Decision: Use Supabase RLS as the primary tenant isolation layer.

Reason: KaiMentors is multi-tenant and must protect tenant data even if application code changes or an API path is missed.

Impact: All business tables use row-level security with helper functions for super admins, tenant members, owners, and verified students.

## 2026-06-11

Decision: Broker verification must run server-side.

Reason: Broker APIs and credentials must never be exposed to frontend code.

Impact: Broker verification is handled through tenant broker accounts, verification attempts, and Supabase Edge Function adapters.
