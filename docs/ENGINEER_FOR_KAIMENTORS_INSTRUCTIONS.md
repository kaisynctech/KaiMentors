# Engineer for KaiMentors Instructions

Last updated: 2026-06-22

## Purpose of This Document

This document is a handoff from the current KaiMentors Engineering Team to another engineer who will continue the work. It explains who the Engineering Team is, what it is responsible for, the mandatory engineering rules, the current application state, and the exact task that was in progress when the handoff occurred.

This document describes engineering execution. Product requirements and architectural decisions must come from the approved specifications and the existing KaiMentors documentation. The engineer must not invent product requirements or silently change the architecture.

## Who You Are

You are the KaiMentors Engineering Team.

You are responsible for implementing, maintaining, testing, securing, documenting, deploying, and improving KaiMentors. You are not the product owner and you are not authorized to replace approved requirements with personal preferences. You execute approved specifications using senior engineering judgment and the established architecture.

You work inside the existing KaiMentors repository. You do not rebuild completed foundations, rename the product, or create a parallel system. The product is **KaiMentors**, never VeriMentor or another name.

## What KaiMentors Is

KaiMentors is an enterprise multi-tenant SaaS Academy Operating System for mentors, trading academies, staff, and students.

The platform includes:

- Supabase Auth with password-based returning login and OTP-only email challenges.
- Tenant roots represented by `traders`.
- Tenant staff memberships represented by `trader_members`.
- Public academy identities represented by `portals`.
- Core Academy Pages, legacy Website Builder records, custom website packages, releases, publications, and custom domains.
- Student registration, verification, broker accounts, groups, messaging, entitlements, courses, protected media, and progress.
- A platform-owner super-admin console.
- PostgreSQL Row Level Security as the primary tenant-isolation boundary.
- Supabase Storage for private and public media according to bucket policy.
- Vercel production hosting.
- Audit logging for important business and security changes.

KaiMentors is the shared engine behind multiple isolated academy brands. Custom websites provide presentation, while KaiMentors remains authoritative for authentication, registration, verification, authorization, courses, media, messaging, domains, and audit history.

## Core Engineering Responsibility

Every implementation must be:

- Production ready.
- Secure.
- Scalable.
- Maintainable.
- Auditable.
- Fully typed.
- Tested.
- Documented.
- Multi-tenant aware.
- Consistent with the existing architecture.

The system must be designed for thousands of mentors and hundreds of thousands of students. Do not optimize for shortcuts. Optimize for long-term reliability and operational clarity.

## Non-Negotiable Rules

Never apply:

- Temporary fixes.
- Quick patches.
- Band-aid solutions.
- Authorization bypasses.
- Hard-coded tenant, portal, user, package, course, media, group, or domain IDs.
- Mock production behavior.
- Static tenant-routing arrays.
- Client-side trust for tenant identity.
- Duplicate authentication, verification, course, messaging, or permission systems.
- Service-role logic in browser code.
- Secrets in source control, logs, documentation, screenshots, or chat.

Always:

- Solve the root cause, not only the visible symptom.
- Search the solution for related occurrences of the same defect pattern.
- Preserve immutable user IDs, tenant IDs, history, assignments, and client data.
- Use migrations for database changes.
- Preserve foreign keys, indexes, constraints, RLS, and storage policies.
- Keep service-role usage server-only and narrowly authorized.
- Resolve tenant context from trusted server-side route, portal, hostname, membership, or database context.
- Prefer existing components, helpers, APIs, schemas, and design patterns.
- Use structured APIs and parsers instead of ad hoc string handling.
- Use enterprise table layouts where practical.
- Group complex UI into logical sections, tabs, and accordions.
- Preserve desktop and mobile responsiveness.
- Create audit evidence for important state changes.
- Update documentation whenever implementation or production behavior changes.

## Multi-Tenant Security Rules

The engineer must treat tenant isolation as a security boundary.

- `traders.id` is the tenant root.
- Tenant-owned records must carry or derive a validated `trader_id`.
- Composite tenant foreign keys must be preserved where present.
- RLS is the primary authorization boundary and must remain enabled.
- Server APIs must not trust browser-submitted `trader_id` or `portal_id` as authoritative.
- Students may have applications in more than one academy, but access must always be evaluated against the requested academy.
- Mentor staff may access only tenants for which they have a valid membership.
- Super-admin access must remain internal to KaiMentors platform routes.
- Branded academy login accepts students only.
- Client tenants must never see KaiTrades acceptance records.
- KaiTrades must never receive a bypass or special RLS exception.

The permanent acceptance-test tenant is resolved by both:

- `traders.environment = 'acceptance_test'`
- Portal slug `kaitrades`

Resolution must fail if the result is missing or ambiguous. Never embed the current KaiTrades UUID in code or scripts.

## Authentication Rules

- Returning login uses Supabase password authentication.
- Email ownership challenges use manually entered six-digit OTPs.
- Authentication emails must not contain confirmation links or magic-link actions.
- OTP values must never be stored or logged.
- Passwords, access tokens, refresh tokens, PATs, service-role keys, and SMTP credentials must never be exposed.
- New identities must complete the approved account-setup lifecycle.
- Role routing must preserve `super_admin`, `trader`, and `student` separation.
- Branded student login must verify that the student has an application for the requested academy.
- Account creation and invitation workflows must preserve immutable Auth user IDs and tenant history.

## Database and Migration Rules

- Never manually alter production tables outside the migration architecture.
- Use idempotent, forward-safe migrations.
- Do not recreate tenants to correct ownership or configuration.
- Never hard-code production UUIDs in migrations.
- Verify local and remote migration parity before declaring completion.
- Review RLS policies, grants, functions, triggers, indexes, and storage policies for every database change.
- Use atomic database functions for multi-record business transitions where partial completion would be unsafe.
- Preserve audit history.
- Do not store secrets, OTPs, signed URLs, or reusable credentials in audit metadata.

Remote schema mutation or deployment requires explicit user authorization unless the active approved task already expressly authorizes that exact production operation.

## Website and Domain Rules

KaiMentors supports:

- Core Academy Pages.
- Legacy Website Builder records and rendering.
- Platform-managed custom website packages.
- Website releases and publications.
- Custom domains.
- Approved external website entry links.

The Website Builder is legacy as the active mentor-facing direction, but its tables and rendering paths must not be deleted or bypassed.

Use the existing website architecture when extending website behavior:

- `website_templates`
- `website_pages`
- `website_sections`
- `website_theme_settings`
- `website_navigation`
- `website_media`
- `website_releases`
- `website_publications`
- `website_domains`
- `custom_site_packages`
- `custom_site_assignments`
- `custom_site_route_rules`

Only super admins may assign custom packages or manage platform domains. Custom websites must use the centralized KaiMentors Join Academy, Sign In, student portal, course, messaging, and permission systems.

## Protected Courses Rules

Protected Courses Phase 1 uses:

- `courses`
- `course_modules`
- `lessons`
- `lesson_content_blocks`
- `lesson_content_block_media`
- `course_media`
- `resources`
- `content_access_grants`
- `lesson_progress`
- `course_media_access_sessions`

The authoritative course-access function is `can_access_course`.

Supported access modes are:

- `all_verified`
- `restricted` through groups or individual grants
- `one_to_one`

Students require a verified application in the course tenant. Student access to private storage objects is intentionally absent. Protected delivery must use short-lived authorized media sessions. Progress must survive entitlement removal and curriculum reordering. Referenced media must not be destructively deleted. Replacement must preserve active lesson and resource references.

## Documentation Rules

Documentation is part of the Definition of Done.

Before implementation, review at minimum:

- `docs/SYSTEM_OVERVIEW.md`
- `docs/DATABASE.md`
- `docs/AUTHENTICATION.md`
- `docs/MULTI_TENANCY.md`
- `docs/SECURITY.md`
- `docs/WEBSITE_BUILDER.md`
- `docs/CHANGELOG.md`
- `docs/ARCHITECTURE_DECISIONS.md`
- `docs/PRODUCT_STATUS.md`

Review module documents when affected:

- `docs/STUDENTS.md`
- `docs/BROKER_INTEGRATIONS.md`
- `docs/COURSES.md`
- `docs/STORAGE.md`
- `docs/DEPLOYMENT.md`
- `docs/AUDIT_LOGGING.md`

Whenever functionality changes:

1. Determine which documentation is affected.
2. Update every affected document.
3. Update `docs/CHANGELOG.md`.
4. Update `docs/PRODUCT_STATUS.md` when a feature state changes.
5. Record major architectural decisions in `docs/ARCHITECTURE_DECISIONS.md`.
6. Report documentation changes in the delivery summary.

Documentation must describe implemented and verified behavior, not planned behavior. Never mark a feature complete based on assumed or unobserved tests.

## Required Validation

Before completing an implementation task, run:

```bash
npm test
npm run typecheck
npm run build
```

Also verify as applicable:

- No TypeScript errors.
- No build errors.
- No runtime errors.
- No browser console errors.
- No failed network requests caused by the change.
- Desktop responsiveness.
- Mobile responsiveness.
- Keyboard navigation and focus visibility.
- Authentication for super admin, mentor/trader, tenant staff, and student roles.
- Authorization and RLS behavior.
- Cross-tenant denial.
- Direct-URL denial.
- Storage access and upload behavior.
- Existing feature regressions.
- Remote migration parity.
- Tenant ownership, portal, package, membership, and assignment integrity.

If a required test cannot be run, state that explicitly and do not report it as passed.

## Definition of Done

A task is complete only when:

1. The approved functionality works.
2. The root cause is solved.
3. Related systems are checked.
4. Security implications are reviewed.
5. Multi-tenancy is preserved.
6. RLS and authorization are validated.
7. Tests pass.
8. Type checking passes.
9. Production build passes.
10. Desktop and mobile behavior are validated when UI is affected.
11. Documentation and changelog are current.
12. Acceptance criteria are met.

Do not mark work complete because implementation exists. Completion requires evidence.

## Required Delivery Summary

After completing work, report:

1. Summary.
2. Root cause.
3. Files changed.
4. Database changes and migrations.
5. Documentation updated.
6. Validation results.
7. Testing performed for authentication, authorization, UI, security, and regression.
8. Remaining risks or limitations.
9. Recommended next production improvement.

Never expose credentials or protected content in the delivery summary.

## Current Production State

As of 2026-06-22:

- Production is deployed at `https://kaimentors.vercel.app`.
- The current documented application release includes migration `202606210025_protected_courses_curriculum_media_progress.sql`.
- Local and remote Supabase migrations match through `025`.
- The production course-content bucket is private with a 500 MB maximum object size.
- Anonymous reads of protected course lifecycle tables are denied.
- Service-role execution of the student media-session RPC is denied.
- KaiTrades, Traders Confidence, and Milkers FX remain separate tenants with separate portals and custom packages.
- KaiTrades is the only acceptance-test tenant.
- Protected Courses Phase 1 remains `Partially Complete` because full live acceptance has not passed.
- Production had no protected courses before the acceptance work described below began.
- No academy custom domain was configured in `website_domains` at the start of acceptance.
- Production domain automation does not currently have all required Vercel runtime credentials.

## Current Task Being Handed Over

The active task is **KaiTrades Protected Courses Production Acceptance**.

The objective is to complete production acceptance using only the isolated KaiTrades acceptance-test academy without modifying Traders Confidence, Milkers FX, or client-owned data.

The required acceptance scope includes:

- Real authenticated sessions for super admin, trader/staff, verified students, unverified students, and anonymous users.
- All-verified, group, individual, and strict one-to-one access.
- Verified but not entitled denial.
- Revocation and restoration while preserving progress.
- Draft, published, and archived courses and lessons.
- Video, rich text, PDF, image, gallery, link, and supporting resources.
- Media lifecycle states and validation.
- Resumable and interrupted upload recovery.
- Short-lived media delivery and direct-storage denial.
- Replacement and referenced-media deletion protection.
- Partial progress, resume, completion, Continue Watching, and Completed states.
- Platform-slug and custom-domain parity.
- Cross-tenant and fabricated-ID denial.
- Desktop and mobile browser validation with console/network inspection.

## Work Completed During the Current Acceptance Task

The following uncommitted implementation was created:

- `scripts/accept-protected-courses-production.mjs`
- `tests/fixtures/kaitrades-protected-courses-acceptance.mp4`
- A new `accept:courses:production` package script.
- A new protected-course acceptance safety test.
- `.acceptance-tmp` was added to `.gitignore`.

The acceptance runner currently:

- Resolves KaiTrades through acceptance-test classification and portal slug.
- Refuses missing or ambiguous tenant resolution.
- Avoids hard-coded UUIDs.
- Captures production-client baseline counts.
- Reconciles previously tagged acceptance records before rerunning.
- Creates generated, non-reusable temporary credentials only in memory.
- Creates real Supabase Auth sessions.
- Creates clearly tagged KaiTrades acceptance records.
- Uses direct resumable TUS upload to the private `course-content` bucket.
- Uses the production finalize, media-session, deletion, and progress APIs.
- Tests MIME, extension, size, and signature rejection.
- Creates a genuine original KaiMentors MP4 fixture rather than using client media.
- Transfers retained fixture authorship to the existing KaiTrades owner.
- Removes ephemeral privileged and student identities during cleanup.
- Verifies that production-client baseline counts remain unchanged.

The static automated test suite was expanded from 30 to 31 tests and passed before the latest production run.

## Exact Current Failure

The latest production acceptance run reached course entitlement evaluation and failed with:

```text
Group-entitled student cannot access group course.
```

The run used KaiTrades and cleaned up ephemeral identities. No client tenant was intentionally modified.

The root cause is not yet proven. The most likely next investigation is to inspect and enforce error handling for:

- The `student_group_members` insert.
- The `set_course_access` RPC result for the group course.
- The generated `content_access_grants` row.
- The group membership's tenant and application relationship.
- The `can_access_course` group branch under the authenticated student session.

The current runner did not check every setup mutation's returned Supabase error before evaluating access. The next engineer should add explicit error checks, rerun safely, and use the resulting database error to identify the root cause. Do not patch `can_access_course` until the actual setup or policy defect is proven.

## Current Workspace State

The current workspace contains uncommitted changes for the acceptance task. Inspect them before editing:

- `.gitignore`
- `package.json`
- `scripts/accept-protected-courses-production.mjs`
- `tests/protected-courses.test.mjs`
- `tests/fixtures/kaitrades-protected-courses-acceptance.mp4`
- This handoff document.

The separate `Milkers-Fx/` folder is untracked and unrelated to the KaiMentors acceptance implementation. Do not add, edit, delete, move, or commit it as part of this work.

Do not discard the current acceptance runner. Review and continue it. Preserve the generated MP4 fixture unless a verified technical reason requires replacing it.

## Known Acceptance Blockers

### Browser acceptance

The in-app browser connection failed with an environment integration error before browser control became available. Desktop/mobile visual acceptance, screenshots, console checks, network checks, keyboard navigation, focus visibility, and touch-target testing remain unverified.

Do not use this limitation as evidence that the UI passed. Retry the supported in-app browser integration in a later session.

### Custom-domain acceptance

No academy custom domain is currently configured. The Vercel Git-main alias was considered as a possible non-client test hostname, but it has not been registered or validated through the normal super-admin domain workflow.

Production domain automation requires:

- `VERCEL_TOKEN`
- `VERCEL_PROJECT_ID` or `VERCEL_PROJECT_NAME`
- `VERCEL_TEAM_ID` when applicable

The production application currently does not have the full required provider configuration. Do not insert an active `website_domains` row directly as a shortcut. Configure a properly scoped encrypted Vercel credential and use the existing super-admin domain API, provider verification, event logging, DNS/SSL status, and primary-domain workflow.

Do not use Traders Confidence or Milkers FX domains for KaiTrades acceptance.

## Safe Continuation Order

The next engineer should:

1. Read this document and all required system documentation.
2. Inspect the uncommitted diff and verify no unrelated files are included.
3. Add explicit error handling around every acceptance setup mutation.
4. Rerun the guarded KaiTrades acceptance script.
5. Diagnose and fix the group-entitlement root cause only after obtaining direct evidence.
6. Repeat all entitlement, media, progress, RLS, and cross-tenant scenarios.
7. Configure a scoped Vercel domain-management credential through encrypted production environment configuration.
8. Register and verify a KaiMentors-owned non-client test hostname through the existing domain workflow.
9. Complete platform-slug/custom-domain parity tests.
10. Retry the supported browser integration and complete desktop/mobile visual acceptance.
11. Run `npm test`, `npm run typecheck`, and `npm run build`.
12. Re-run migration parity, the protected-course production verifier, and the multi-academy audit.
13. Update every affected documentation file and `CHANGELOG.md`.
14. Mark Protected Courses Phase 1 `Complete` only if every required acceptance criterion passes.

## Final Handoff Statement

I am handing this work to another KaiMentors engineer to continue.

Continue from the existing workspace and production state. Do not restart the feature, replace the architecture, recreate tenants, or discard the current acceptance work. Preserve KaiTrades isolation, protect all client data, verify every claim with evidence, and leave Protected Courses Phase 1 as `Partially Complete` until authenticated entitlement, media, progress, custom-domain, desktop, and mobile acceptance all pass.
