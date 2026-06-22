# KaiMentors System Overview

## Protected Courses Foundation (2026-06-21)

KaiMentors now has a structured learning engine: Course -> Module -> Lesson -> mixed-media content blocks, a reusable protected Media Library, all-verified/group/individual/one-to-one access, durable student progress, Continue Watching, Completed, and short-lived audited media sessions. Migration `025` is deployed and remotely verified; application deployment and live browser acceptance remain pending.

## Multi-Academy Delivery Foundation (2026-06-18)

KaiMentors is the shared Academy Operating System behind isolated academy brands. Every academy owns one `traders` tenant root, one portal identity, independent content and communications, and either the default Core Academy Page or a platform-assigned Custom Academy Website. Website Builder records remain supported for legacy publications but are no longer the active mentor-facing product direction.

The deployed acceptance matrix is KaiTrades (`acceptance_test`, package `kaitrades`), Traders Confidence (`production`, package `traders-confidence`), and Milkers FX (`production`, package `milkers-fx`). Milkers FX is provisioned and awaiting owner invitation acceptance. Custom websites remain presentation packages only; KaiMentors owns registration, authentication, verification, student access, courses, messaging, permissions, domains, and auditing.

Last updated: 2026-06-20

## What KaiMentors Is

KaiMentors is a multi-tenant SaaS platform for trading mentors, forex academies, and affiliate education businesses. It gives each mentor a protected workspace, a public academy website or portal, broker-linked student registration, student verification, courses, private student access, messaging, and platform-level administration.

KaiMentors is the application brand. It is not VeriMentor.

## Business Purpose

KaiMentors helps mentors turn a trading academy into an organized, auditable online business:

- Mentors can publish a branded academy website or connect a custom-built website package.
- Students can register through the mentor's public portal or custom domain.
- Access to courses and private content is controlled by verification status and group membership.
- Broker accounts and verification workflows support affiliate-driven academy operations.
- KaiMentors administrators can manage tenants, custom site assignments, brokers, subscriptions, audit logs, and platform settings.

## Target Users

- Platform owner and operators: manage the KaiMentors SaaS platform from the super-admin console.
- Mentors and academy teams: run their workspace, manage students, brokers, courses, website content, groups, and messaging.
- Students: register, verify access, consume protected courses, and communicate inside the student portal.

## SaaS Architecture

KaiMentors is built as a Next.js 15 App Router application backed by Supabase Auth, PostgreSQL, Storage, and Edge Functions. The app is tenant-aware at every data layer:

- Next.js handles public pages, dashboards, API routes, custom-domain routing, and student routes.
- Supabase PostgreSQL stores tenant data and enforces row-level security.
- Supabase Auth provides user identity, sessions, and role-backed route access.
- Supabase Storage stores logos, website media, course videos, verification proofs, avatars, and message attachments.
- Supabase Edge Functions handle server-side broker verification adapters.
- Vercel hosts production and supports custom-domain automation when configured.

## Enterprise Architecture Governance

KaiMentors architecture work is governed by `ENTERPRISE_ARCHITECT_INSTRUCTIONS.md`. Architecture responses must analyze root cause, affected systems, database impact, RLS impact, authentication impact, API impact, UI impact, documentation impact, regression risk, and production readiness before generating implementation prompts.

The Enterprise Architect role generates specifications and coding prompts only. It must not implement code, output code, or recommend temporary fixes, patches, workarounds, hard-coded tenant values, security shortcuts, disabled validation, mock production logic, or incomplete implementations.

## Multi-Tenant Architecture

Each mentor business is represented by a `traders` row. Most tenant-owned records carry `trader_id`, including portals, broker accounts, student applications, content, groups, conversations, website pages, releases, and custom site assignments.

`traders.environment` distinguishes production tenants from permanent `acceptance_test` fixtures. KaiTrades is the isolated non-client acceptance-test academy; it uses its own package, assets, assignment, tenant records, and student/broker/content data.

Tenant isolation is enforced in three layers:

- Database: RLS policies use helper functions such as `is_trader_member`, `is_trader_owner`, `has_verified_access`, and `is_super_admin`.
- Application routes: middleware redirects users based on role and route family.
- Server APIs: privileged operations use server-only Supabase clients and database functions instead of trusting client requests.

## Core Modules

- Public website and portal: `/portal/[slug]`, `/portal/[slug]/[pageSlug]`, and custom-domain routes under `/domain-sites/[hostname]`.
- Academy Website Entry System: canonical Join Academy and Sign In flows for builder sites, custom site packages, custom domains, and approved external website links.
- Mentor dashboard: `/dashboard` plus students, brokers, courses, groups, messages, website builder, and settings areas.
- Student portal: `/student`, `/student/courses`, lesson video pages, and messages.
- Platform admin console: `/admin`, including traders, custom sites, brokers, subscriptions, audit logs, and settings.
- Website Builder: template-driven pages, sections, theme settings, navigation, media, draft saving, releases, publications, custom domains, and custom website packages.
- Broker workflows: mentor broker accounts, verification methods, student broker details, verification attempts, and an Edge Function adapter.
- Courses: structured modules and lessons with text, video, PDF, image, gallery, link and resource blocks; protected media, publication lifecycle, tenant-scoped access and progress.
- Groups and messaging: student cohorts, entitlement grants, direct/group/announcement conversations, messages, and attachments.
- Audit logging: database-level and workflow-level records for important changes.

## User Roles

- `super_admin`: KaiMentors platform owner/operator. Can access `/admin`, manage platform entities, and assign custom website packages.
- `trader`: mentor, academy owner, or tenant staff member. Can access `/dashboard` if a trader membership exists.
- `student`: academy student. Can access `/student` after authentication and can view protected content when verified and entitled.

Tenant staff permissions are stored in `trader_members.role` with `owner`, `admin`, `editor`, and `support`.

## Authentication Approach

The current implementation uses Supabase Auth with password sign-in for returning users and manually entered OTPs for email challenges. All six hosted bodies pass genuine Management API content inspection. KaiTrades passed the received-email/code-entry canary, and production delivery was enabled through the audited super-admin promotion workflow on 2026-06-20.

- New mentors create a workspace through `/onboarding`; students submit academy registration details through the branded Join Academy route.
- The server creates an unconfirmed Auth identity without a password and preserves the provisioned tenant/application records.
- `/account-setup` is the single recovery-safe continuation flow. It sends an enumeration-safe OTP challenge, resolves account state on the server, and permits password creation only after email verification.
- Active academy invitations are accepted against their existing immutable user, tenant, portal, membership, package, and assignment records. Expired invitations require an audited super-admin renewal; inconsistent or conflicting roles fail closed to support review.
- Login uses `supabase.auth.signInWithPassword`.
- Signup verification, academy invitations, recovery, and secure email changes use six-digit OTP code-entry flows. Authentication links are prohibited.
- Middleware reads the authenticated user and profile role, then routes to `/admin`, `/dashboard`, or `/student`.
- Custom-domain student login uses the same password-based login form but restricts access to student accounts.
- Branded academy login routes are student-only and never route mentor or platform accounts into academy student areas.

Email challenges do not replace returning password login. They verify email ownership or authorize a narrowly scoped setup, recovery, or email-change operation.

## Verification Workflows

Students register from a public academy portal or custom website join page. Registration creates:

- A `profiles` user record.
- A `student_applications` row tied to the mentor tenant.
- A `verification_attempts` row tied to the selected broker account and evidence.

Supported verification statuses are `pending`, `processing`, `verified`, `rejected`, `manual_review`, plus later workflow fields for `needs_more_information`. Mentor review actions update the application, write verification context, and create audit logs.

Canonical student entry routes:

- Platform portal join: `/portal/[slug]/join-academy`
- Platform portal student login: `/portal/[slug]/login`
- Custom domain join: `/join-academy`
- Custom domain student login: `/login`
- Custom domain authenticated student area: `/academy`
- Platform authenticated student area: `/student?portal=[slug]`

Registration resolves tenant context server-side from the custom-domain hostname or platform portal slug. Browser-submitted tenant IDs are not used as the source of truth.

## Public Website Builder

The original Portal Branding feature has evolved into a Website Builder:

- Templates are stored in `website_templates`.
- Pages are stored in `website_pages`.
- Sections are stored in `website_sections`.
- Theme settings are stored in `website_theme_settings`.
- Media is stored in `website_media` and the `website-media` bucket.
- Navigation is stored in `website_navigation`.
- Drafts can be saved and published as immutable release snapshots.
- Custom website packages allow professionally built static/custom sites to be assigned by platform admins to specific mentor portals.

Published websites are available through `/portal/[slug]`, platform-routed domains, or configured custom domains.

## Student Portal

Students use the portal to:

- View registration/application status.
- Access published courses and video lessons when verified and entitled.
- Participate in direct, group, and announcement conversations.

Access is enforced by RLS and by application-level checks.

## Current Implementation Status

Implemented:

- Next.js 15 TypeScript app.
- Supabase Auth, PostgreSQL, RLS, Storage, and Edge Function foundation.
- Mentor onboarding and password login.
- Public tenant portal by slug.
- Student registration, verification records, review workflows, and bulk review.
- Broker account management with API/manual/screenshot verification modes.
- Course and video lesson management.
- Student groups, entitlements, all-students system group, and messaging.
- Website Builder foundation with templates, sections, pages, themes, media, navigation, preview, releases, publications, domains, and custom website packages.
- Super-admin console for platform management and custom site assignment.
- Custom-domain routing and custom-site package rendering.
- Canonical academy website entry routes for Join Academy, Sign In, student status, courses, and messages.
- Central academy route resolution for builder pages and custom-package navigation across platform slugs and custom domains.
- Independent KaiTrades acceptance-test package and tenant classification with migrations through `202606190020_auth_challenge_audit.sql` applied to the configured Supabase project.

Known active product direction:

- Continue strengthening admin controls around custom domains and tenant assignment.
- Expand website builder editing depth while preserving the template engine.
- Improve enterprise reporting, subscriptions, student segmentation, and content entitlement management.

## Documentation Rule

Documentation is part of the Definition of Done. Any future change to features, database objects, APIs, pages, components, services, Edge Functions, storage buckets, authentication flows, roles, permissions, RLS policies, integrations, or business processes must update the relevant file in `/docs` and add an entry to `CHANGELOG.md`.
