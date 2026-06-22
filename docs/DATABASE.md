# Database Documentation

Last updated: 2026-06-20

## Overview

KaiMentors uses Supabase PostgreSQL as the system of record. The schema is tenant-first: almost every business object is connected to `traders.id` through `trader_id` or through a portal owned by a trader.

Core helper functions:

- `current_app_role()`: returns the role from `profiles`.
- `is_super_admin()`: checks platform admin access.
- `is_trader_member(target_trader_id)`: checks mentor workspace membership.
- `is_trader_owner(target_trader_id)`: checks owner-level tenant access.
- `has_verified_access(target_trader_id)`: checks whether the authenticated student is verified for a tenant.
- `current_trader_id()`: resolves the current mentor tenant from membership.
- `write_audit_log()`: inserts audit records from workflow triggers/functions.

## Enums

- `app_role`: `super_admin`, `trader`, `student`.
- `trader_status`: `onboarding`, `active`, `suspended`.
- `verification_status`: `pending`, `processing`, `verified`, `rejected`, `manual_review`.
- `content_status`: `draft`, `published`, `archived`.
- `resource_type`: `video`, `pdf`, `file`, `link`.
- `subscription_status`: `trialing`, `active`, `past_due`, `cancelled`.
- `verification_method`: `api`, `manual_review`, `screenshot_upload`.
- `content_access_scope`: `all_verified`, `restricted`.
- `conversation_type`: `direct`, `group`, `announcement`.
- `website_delivery_mode`: `core_page`, `builder_template`, `custom_package`, `external_website`. `core_page` is the default; builder and external modes are legacy.
- `custom_site_assignment_status`: `draft`, `active`, `paused`.
- `tenant_environment`: `production`, `acceptance_test`.

## Relationship Map

- `profiles` maps one-to-one to `auth.users`.
- `traders.owner_user_id` points to the owner profile.
- `trader_members` joins profiles to traders for mentor workspace staff.
- `portals` belongs one-to-one to a trader and is the public website identity.
- `student_applications` belongs to a trader, portal, optional student profile, and selected broker account.
- `verification_attempts` belongs to a student application.
- `courses` belongs to a trader; `lessons` belongs to a course.
- `resources`, `announcements`, and `live_classes` belong to a trader.
- `student_groups` belongs to a trader; `student_group_members` joins verified applications to groups.
- `content_access_grants` connects groups or students to courses/resources/announcements/live classes.
- `conversations` belongs to a trader and can reference a group or student application.
- `conversation_members`, `messages`, and `message_attachments` form the messaging graph.
- `website_pages`, `website_sections`, `website_theme_settings`, `website_media`, and `website_navigation` compose the builder website for a portal.
- `website_releases` snapshots a portal website; `website_publications` marks the current published release.
- `website_domains` connects hostnames to portals and releases; `website_domain_events` tracks DNS/SSL lifecycle events.
- `custom_site_packages`, `custom_site_assignments`, and `custom_site_route_rules` connect custom-built websites to tenant portals.

## Tables

### `auth_challenge_events`
Purpose: audit OTP sends, resends, throttling, suppressed enumeration-safe requests, provider errors, and completed verification without storing secrets. Columns: identity `id`, nullable `user_id`, constrained `purpose` including `account_setup`, constrained `event_type`, SHA-256 `email_hash`, JSON metadata, and `created_at`. Rate-limit and user history indexes support enforcement and review. Users may read their own events; super admins may read all; only trusted server workflows write.

### `account_setup_sessions`
Purpose: private, short-lived state for the unified Resume Account Setup flow. It stores only an opaque setup-token hash, SHA-256 email hash, optional immutable user/invitation references, resolved lifecycle state, purpose, attempt count, expiry, and verified/completed timestamps. RLS is enabled and no browser role has table access. `complete_account_setup` is authenticated-user-only, locks and validates the matching session, verifies the Auth identity/password and invitation ownership graph, and accepts the existing invitation without provisioning duplicate records.

### `academy_owner_email_corrections`
Purpose: immutable-ID owner email correction ledger. It records the existing trader, owner user and invitation plus old/new normalized addresses, reason, requester, state and timestamps. Only super admins begin corrections. The operation requires Admin Auth to have already moved the same user ID to the unverified corrected address, updates profile/invitation mirrors, revokes old sessions, and leaves all tenant-owned records in place.

Invitation renewal uses `renew_academy_invitation`. It is super-admin-only, locks and validates the existing owner mapping, extends the same pending/expired invitation, and writes an audit event. Partial unique indexes enforce one pending invitation per invited user and trader and one owner membership per trader.

### `platform_settings` authentication delivery policy
`auth_email_delivery_policy` stores a private platform-wide delivery mode. `canary_only` permits only identities associated with `traders.environment = acceptance_test`; `production_enabled` can be written only by `promote_auth_email_delivery`. That security-definer function is authenticated-super-admin-only and atomically validates fresh Management API content evidence, the recorded verified KaiTrades signup event, and human canary attestations before updating the setting and audit ledger. Repeated promotion is idempotent. Missing or malformed policy values fail closed to canary-only behavior.

`authorize_academy_invitation_resend` is the required production invitation resend gate. It locks the pending invitation, verifies immutable identity/owner/tenant relationships, enforces expiry and a 60-second cooldown under an advisory lock, and creates a `resend_authorized` `auth_challenge_events` row. It cannot be executed by anonymous or service-role callers; an authenticated `super_admin` JWT is required.

`reconcile_auth_challenge_verification` repairs a missing historical KaiTrades signup completion event without accepting operator-supplied verification claims. It resolves the matching `auth.users` identity, email hash and `email_confirmed_at`, requires confirmation within the original 15-minute request window, verifies the acceptance-test tenant and `kaitrades` portal, and writes both the reconciled challenge event and immutable audit event. The function is idempotent and authenticated-super-admin-only.

### `risk_disclosure_templates`
Purpose: platform-approved trading-risk copy selectable by academies. Columns: UUID `id`, unique `template_key`, `title`, `message`, `is_active`, `is_default`, timestamps. A partial unique index permits one default. Public users may read active rows; only super admins manage them. `portals.risk_disclosure_template_id` is a restrictive FK and an insert trigger supplies the active default.

### `academy_invitations`
Purpose: auditable platform-created mentor onboarding. Columns include normalized `email`, owner/workspace names, `portal_slug`, optional `package_id`, `invited_user_id`, `trader_id`, status, `invited_by`, expiry and acceptance timestamps. It relates auth identity, tenant and package without replacing immutable IDs. Super admins manage records; invitees can read their own record. `provision_invited_academy` creates tenant, membership, portal, subscription, assignment and invitation atomically after Auth creates the user.

### `trader_ownership_transfers`
Purpose: authorized workspace ownership changes without recreating tenants. It records trader, previous/new owners, requester/completer, reason, status and timestamps. `complete_trader_ownership_transfer` is super-admin-only, preserves the former owner as an admin, promotes the target membership, and changes `traders.owner_user_id` in one transaction.

### Portal additions
`portals` now includes `academy_description`, `contact_email`, `risk_disclosure_template_id`, and `risk_disclosure_enabled`. New portals default to `core_page`. Existing package portals retain `custom_package`; existing builder tables, snapshots and releases remain intact.

Legacy Website Builder draft tables (`website_pages`, `website_sections`, `website_theme_settings`, `website_media`, `website_navigation`) are readable only by the owning tenant or super admins. `website_releases` and `website_publications` expose only the current publication for a published portal whose active mode is `builder_template`.

### `profiles`

Purpose: Stores app-level identity and role information for each Supabase Auth user.

Columns: `id uuid`, `role app_role`, `full_name text`, `email text`, `avatar_path text`, `phone text`, timestamps.

Relationships: `id` references `auth.users(id)`. Used by trader ownership, trader membership, student applications, messages, and audit logs.

Indexes: primary key on `id`.

RLS: Users can read/update their own profile; tenant/admin policies allow appropriate platform and workspace visibility.

Usage: Role routing, account identity, student/mentor ownership, message authorship.

### `traders`

Purpose: Represents a mentor workspace or academy tenant.

Columns: `id uuid`, `owner_user_id uuid`, `legal_name text`, `display_name text`, `status trader_status`, `environment tenant_environment`, `timezone text`, `support_email text`, timestamps.

Relationships: owner profile via `owner_user_id`; parent for portals, broker accounts, students, courses, groups, website objects, subscriptions, and audit logs.

Indexes: primary key, unique owner, and environment/creation-time lookup.

RLS: Visible to tenant members and platform admins; platform admins manage records.

Usage: Tenant root for multi-tenancy. `environment = acceptance_test` identifies permanent non-client test fixtures such as KaiTrades without relying on display-name conventions.

### `trader_members`

Purpose: Joins users to mentor workspaces.

Columns: `id uuid`, `trader_id uuid`, `user_id uuid`, `role text`, timestamps.

Relationships: references `traders` and `profiles`; unique `(trader_id, user_id)`.

Indexes: unique membership constraint.

RLS: Visible within tenant; owners and platform admins manage membership.

Usage: Workspace authorization and mentor dashboard access.

### `portals`

Purpose: Public identity, branding, delivery mode, and routing record for each mentor website.

Columns: `id uuid`, `trader_id uuid`, `slug text`, `portal_name text`, hero/branding fields, social/contact fields, `custom_domain text`, `is_published boolean`, `website_delivery_mode`, `external_website_url`, timestamps.

Relationships: one-to-one with `traders`; parent for website builder, domains, releases, and custom site assignments.

Indexes: unique slug, unique trader, unique custom domain, unique `(id, trader_id)`.

RLS: Published portals are public; tenant members manage their portal; platform admins have broad access.

Usage: `/portal/[slug]`, custom-domain routing, branding, website publishing.

### `brokers`

Purpose: Platform-level broker catalog.

Columns: `id uuid`, `name text`, `website_url text`, `logo_path text`, `is_active boolean`, metadata, timestamps.

Relationships: referenced by `trader_broker_accounts`.

Indexes: primary key.

RLS: Visible to platform and trader users; platform admins manage.

Usage: Broker selection and platform broker administration.

### `trader_broker_accounts`

Purpose: Tenant-specific broker partner accounts.

Columns: `id uuid`, `trader_id uuid`, `broker_id uuid`, `display_name text`, `partner_code text`, `affiliate_link text`, `verification_method verification_method`, `api_config jsonb`, `is_active boolean`, timestamps.

Relationships: references `traders` and `brokers`; referenced by student applications and verification attempts.

Indexes: tenant/broker lookup indexes.

RLS: Tenant members manage; tenant members and eligible public registration flows can read safe broker options through database functions.

Usage: Mentor broker setup and student registration broker choices.

### `student_applications`

Purpose: Tracks a student's registration and verification lifecycle for a tenant.

Columns: `id uuid`, `trader_id uuid`, `portal_id uuid`, `student_user_id uuid`, `trader_broker_account_id uuid`, `broker_account_identifier text`, `phone_number text`, `trading_account_number text`, `platform_account_number text`, `screenshot_path text`, `status verification_status`, `status_reason text`, `reviewed_by uuid`, `review_version integer`, consent/submitted/review/verified timestamps, timestamps.

Relationships: references trader, portal, student profile, broker account, reviewer profile; parent for verification attempts, group membership, and conversations.

Indexes: `(trader_id, status)`, `(trader_id, status, submitted_at)`.

RLS: Students can create and read their own applications; tenant reviewers can read/update tenant applications; admins can view across platform.

Usage: Student registration, branded student status, KPI cards, review tables, student access checks.

### `verification_attempts`

Purpose: Stores verification evidence and review/API verification outcomes.

Columns: `id uuid`, `application_id uuid`, `trader_id uuid`, `broker_id uuid`, `request_id uuid`, `status verification_status`, `verification_method verification_method`, `adapter_key text`, `response_summary jsonb`, timestamps.

Relationships: references application, trader, broker account.

Indexes: application lookup index.

RLS: Tenant reviewers and owning students can read appropriate attempts.

Usage: Broker verification audit trail and screenshot proof tracking.

### `courses`

Purpose: Tenant-owned structured curriculum containers.

Columns: `id uuid`, `trader_id uuid`, `title text`, `description text`, `cover_path text`, `status content_status`, `sort_order integer`, legacy `access_scope content_access_scope`, `access_mode course_access_mode`, timestamps.

Relationships: parent for modules, lessons, progress, resources, and media sessions; referenced by course content grants.

Indexes: tenant/status and tenant/order access paths.

RLS: Tenant members manage. Students read published rows only through `can_access_course`.

Usage: Mentor course table/detail and My Learning.

### `course_modules`

Purpose: Ordered required or optional curriculum groups within a course.

Columns: `id uuid`, `trader_id uuid`, `course_id uuid`, `title text`, `description text`, `status content_status`, `sort_order integer`, `is_required boolean`, `created_by uuid`, timestamps.

Relationships: composite `(course_id, trader_id)` foreign key to courses; parent of lessons through `module_id`.

Indexes: `(trader_id, course_id, sort_order, created_at)`.

RLS: Tenant staff manage; students read published modules only when `can_access_course` passes.

### `lessons`

Purpose: Ordered required or optional lessons within modules.

Columns: existing fields plus `module_id uuid`, `is_required boolean`; legacy `video_path` remains for history/backfill compatibility.

Relationships: composite tenant foreign keys to course and module; parent of content blocks, gallery media, resources, and progress.

Indexes: legacy course order plus `(trader_id, course_id, module_id, sort_order, created_at)`.

RLS: Tenant members manage; verified and entitled students read published lessons.

Usage: Curriculum editor, student curriculum, mixed-media lesson player.

### `course_media`

Purpose: Tenant-owned normalized protected media metadata and lifecycle.

Columns: `id`, `trader_id`, `media_type`, `title`, `storage_path`, `mime_type`, `file_extension`, `size_bytes`, optional duration/dimensions, `processing_state`, replacement lineage, failure reason, creator, ready/archive timestamps, timestamps.

Relationships: self-referencing replacement lineage; referenced by content blocks, gallery rows, and resources. Composite tenant foreign keys prevent cross-tenant references.

Indexes: unique tenant/storage path; tenant/library state; downstream usage indexes.

RLS: Tenant staff manage. Students read ready metadata only when the media is referenced by accessible published content.

### `lesson_content_blocks`

Purpose: Ordered mixed-media and written content within a lesson.

Columns: `id`, `trader_id`, `course_id`, `lesson_id`, `block_type`, `sort_order`, optional `media_id`, `content jsonb`, `is_required`, `created_by`, timestamps.

Relationships: composite tenant foreign keys to course, lesson, and single media. Gallery blocks use `lesson_content_block_media`.

RLS: Tenant staff manage; students read only accessible published lesson blocks.

### `lesson_content_block_media`

Purpose: Ordered image items for gallery blocks.

Columns: `id`, tenant/course/lesson/block/media IDs, `sort_order`, optional caption, `created_at`.

Relationships: composite tenant foreign keys to the block, lesson, course, and media asset.

Indexes: ordered block lookup and tenant/media usage lookup.

RLS: Tenant staff manage; students read rows only through an accessible published lesson.

### `lesson_progress`

Purpose: Durable per-student lesson resume and completion history.

Columns: tenant, student, course and lesson IDs; position; started/completed flags; first-start, first-completion, last-activity and standard timestamps.

Relationships: composite tenant foreign keys to course and lesson; student profile foreign key. Unique `(trader_id, student_user_id, lesson_id)`.

Indexes: continue-watching and course progress-report paths.

RLS: Students read their own rows; tenant staff and super admins read reporting rows. Writes use `record_lesson_progress`.

### `course_media_access_sessions`

Purpose: Auditable evidence of authorized short-lived protected media delivery.

Columns: tenant, student, course and media IDs, issued and expiry timestamps. Expiry is constrained to no more than ten minutes; the application issues five-minute sessions.

RLS: Student reads own rows; tenant staff and super admins read tenant rows. Inserts use `issue_course_media_session`.

### `resources`

Purpose: Course- or lesson-level supporting protected media or external links.

Columns: existing resource fields plus `media_id uuid` and `sort_order integer`.

Relationships: tenant-owned course/lesson and media references; legacy content grants remain for non-course resources.

Indexes: tenant/status access paths.

RLS: Tenant members manage; verified and entitled students read published resources.

Usage: Resource library foundation.

### `announcements`

Purpose: Mentor announcements to students.

Columns: `id uuid`, `trader_id uuid`, `title text`, `body text`, `status content_status`, `access_scope content_access_scope`, `published_at timestamptz`, timestamps.

Relationships: references `traders`; can sync to announcement conversations.

Indexes: `(trader_id, published_at)`.

RLS: Tenant members manage; verified and entitled students read published announcements.

Usage: Dashboard announcements and messaging integration.

### `live_classes`

Purpose: Scheduled live class records.

Columns: `id uuid`, `trader_id uuid`, `title text`, `description text`, `meeting_url text`, `starts_at timestamptz`, `ends_at timestamptz`, `status content_status`, `access_scope content_access_scope`, timestamps.

Relationships: references `traders`; referenced by content access grants.

Indexes: `(trader_id, starts_at)`.

RLS: Tenant members manage; verified and entitled students read published live classes.

Usage: Live class scheduling foundation.

### `subscriptions`

Purpose: Tracks tenant subscription state.

Columns: `id uuid`, `trader_id uuid`, `status subscription_status`, plan/billing fields, trial/end timestamps, timestamps.

Relationships: references `traders`.

Indexes: primary key and tenant access paths.

RLS: Tenant owners can view; platform admins manage.

Usage: Platform admin subscription visibility.

### `platform_settings`

Purpose: Stores platform-wide configuration.

Columns: `key text`, `value jsonb`, `is_public boolean`, timestamps.

Relationships: none.

Indexes: primary key on `key`.

RLS: Public settings readable; platform admins manage.

Usage: Platform configuration foundation.

### `audit_logs`

Purpose: Immutable operational audit records.

Columns: `id uuid`, `trader_id uuid`, `actor_user_id uuid`, `action text`, `entity_type text`, `entity_id uuid`, `metadata jsonb`, `created_at timestamptz`.

Relationships: optional references to tenant and actor profile.

Indexes: `(trader_id, created_at)`, entity lookup index.

RLS: Visible to owning tenant and platform admins.

Usage: Review workflows, course changes, platform admin observability.

### `website_templates`

Purpose: Defines reusable website templates and template metadata.

Columns: `id uuid`, `template_key text`, `name text`, `description text`, `thumbnail_path text`, `category text`, `is_active boolean`, `version integer`, `blueprint jsonb`, `owner_trader_id uuid`, `visibility text`, `renderer_key text`, `editable_schema jsonb`, `is_managed boolean`, timestamps.

Relationships: optional tenant owner; referenced by theme settings and template application functions.

Indexes: unique `template_key`, owner lookup.

RLS: Active public or assigned tenant templates readable; platform admins manage.

Usage: Website Builder template library.

### `website_pages`

Purpose: Stores portal website pages.

Columns: `id uuid`, `trader_id uuid`, `portal_id uuid`, `slug text`, `title text`, `description text`, `sort_order integer`, `is_home boolean`, `is_enabled boolean`, SEO fields, timestamps.

Relationships: references `traders` and `portals`; parent for sections.

Indexes: unique `(portal_id, slug)`, unique home page per portal, `(portal_id, sort_order)`.

RLS: Public can read enabled/published website pages; tenant members manage.

Usage: Builder editing and public page rendering.

### `website_sections`

Purpose: Reusable content blocks that compose pages.

Columns: `id uuid`, `trader_id uuid`, `page_id uuid`, `section_key text`, `section_type text`, `variant text`, `content jsonb`, `settings jsonb`, `sort_order integer`, `is_enabled boolean`, timestamps.

Relationships: references website pages.

Indexes: unique `(page_id, section_key)`, `(page_id, sort_order)`.

RLS: Public can read enabled/published sections; tenant members manage.

Usage: Template engine and website renderer.

### `website_theme_settings`

Purpose: Theme and brand settings for a portal website.

Columns: `id uuid`, `trader_id uuid`, `portal_id uuid`, `template_id uuid`, color/typography/layout JSON fields, timestamps.

Relationships: references trader, portal, and template.

Indexes: portal uniqueness.

RLS: Public can read published theme settings; tenant members manage.

Usage: Website styling and preview rendering.

### `website_media`

Purpose: Metadata for website assets.

Columns: `id uuid`, `trader_id uuid`, `portal_id uuid`, `path text`, `file_name text`, `mime_type text`, `size_bytes bigint`, `alt_text text`, timestamps.

Relationships: references trader and portal.

Indexes: `(portal_id, created_at)`.

RLS: Public can read published website media metadata; tenant members manage.

Usage: Logo, hero images, page imagery, and template media.

### `website_navigation`

Purpose: Stores website navigation items.

Columns: `id uuid`, `trader_id uuid`, `portal_id uuid`, `label text`, `href text`, `location text`, `sort_order integer`, `is_enabled boolean`, timestamps.

Relationships: references trader and portal.

Indexes: `(portal_id, location, sort_order)`.

RLS: Public can read published navigation; tenant members manage.

Usage: Public website navigation and builder controls.

### `student_groups`

Purpose: Mentor-defined student cohorts and the system all-students group.

Columns: `id uuid`, `trader_id uuid`, `name text`, `description text`, `color text`, `is_active boolean`, `is_system boolean`, `system_key text`, `created_by uuid`, timestamps.

Relationships: references trader and creator profile; parent for group members and group conversations.

Indexes: unique group name per tenant; unique system key per tenant.

RLS: Tenant members manage; students can read assigned groups.

Usage: Cohorts, one-on-one groups, all-students automation, group messaging, content entitlements.

### `student_group_members`

Purpose: Joins student applications to groups.

Columns: `id uuid`, `trader_id uuid`, `group_id uuid`, `application_id uuid`, `added_by uuid`, `created_at timestamptz`.

Relationships: references trader, group, student application, and actor profile.

Indexes: unique `(group_id, application_id)`, application lookup.

RLS: Tenant members manage; students can read their own membership.

Usage: Group membership management and entitlement checks.

### `content_access_grants`

Purpose: Assigns restricted content to groups or individual students.

Columns: `id uuid`, `trader_id uuid`, `entity_type text`, `entity_id uuid`, `group_id uuid`, `student_user_id uuid`, `created_by uuid`, timestamps.

Relationships: references trader, optional group, optional profile.

Indexes: entity lookup, unique group grant, unique student grant.

RLS: Tenant members manage.

Usage: Restricts courses, resources, announcements, and live classes.

### `conversations`

Purpose: Messaging thread container.

Columns: `id uuid`, `trader_id uuid`, `type conversation_type`, `title text`, `group_id uuid`, `application_id uuid`, `created_by uuid`, `last_message_at timestamptz`, timestamps.

Relationships: references trader, optional student group, optional student application, creator profile.

Indexes: unique group conversation, unique direct conversation per student, tenant activity index.

RLS: Participants read; tenant members manage.

Usage: Direct, group, and announcement messaging.

### `conversation_members`

Purpose: Joins users to conversations.

Columns: `id uuid`, `conversation_id uuid`, `trader_id uuid`, `user_id uuid`, `last_read_at timestamptz`, timestamps.

Relationships: references conversation, trader, and profile.

Indexes: user lookup.

RLS: Participants read own/shared membership; tenant members manage.

Usage: Message visibility and read tracking.

### `messages`

Purpose: Stores conversation messages.

Columns: `id uuid`, `conversation_id uuid`, `trader_id uuid`, `sender_user_id uuid`, `body text`, timestamps.

Relationships: references conversation, trader, sender profile.

Indexes: `(conversation_id, created_at)`.

RLS: Participants read; posting is controlled by database functions.

Usage: In-app messaging.

### `message_attachments`

Purpose: Stores attachment metadata for messages.

Columns: `id uuid`, `message_id uuid`, `conversation_id uuid`, `trader_id uuid`, `path text`, `file_name text`, `mime_type text`, `size_bytes bigint`, timestamps.

Relationships: references message, conversation, and trader.

Indexes: conversation/message lookup.

RLS: Participants read attachments.

Usage: Message file access through protected API routes.

### `website_domains`

Purpose: Tracks client-owned/custom domains attached to portals.

Columns: `id uuid`, `trader_id uuid`, `portal_id uuid`, `hostname text`, DNS/SSL/status fields, `is_primary boolean`, timestamps.

Relationships: references trader and portal.

Indexes: unique hostname, unique primary domain per portal, `(portal_id, status)`.

RLS: Tenant members view; platform admins manage.

Usage: Domain onboarding, custom hostname resolution, SSL/DNS tracking.

### `website_domain_events`

Purpose: Audit-style event history for domain provisioning.

Columns: `id uuid`, `domain_id uuid`, `trader_id uuid`, `portal_id uuid`, `event_type text`, `message text`, `metadata jsonb`, `created_at timestamptz`.

Relationships: references website domain, trader, and portal.

Indexes: domain and portal event timelines.

RLS: Tenant members view; platform admins manage.

Usage: Domain lifecycle observability.

### `website_releases`

Purpose: Immutable snapshots of published website content.

Columns: `id uuid`, `trader_id uuid`, `portal_id uuid`, `version integer`, `snapshot jsonb`, `published_by uuid`, `published_at timestamptz`, timestamps.

Relationships: references trader, portal, and publisher profile.

Indexes: `(portal_id, version)`.

RLS: Tenant members manage; current public release can be read publicly.

Usage: Publish, rollback, and public rendering.

### `website_publications`

Purpose: Current publication pointer for a portal.

Columns: `id uuid`, `trader_id uuid`, `portal_id uuid`, `release_id uuid`, `is_published boolean`, timestamps.

Relationships: references trader, portal, and release.

Indexes: portal uniqueness.

RLS: Tenant members manage; public can read published records.

Usage: Determines which release is live.

### `custom_site_packages`

Purpose: Platform-managed registry of custom-built website packages.

Columns: `id uuid`, `package_key text`, `version integer`, `name text`, `description text`, `category text`, `thumbnail_path text`, `asset_base_path text`, `entry_page text`, `manifest jsonb`, `editable_schema jsonb`, `reserved_paths jsonb`, `is_active boolean`, timestamps.

Relationships: parent for assignments and route rules.

Indexes: unique `(package_key, version)`.

RLS: Active/assigned packages readable; platform admins manage.

Usage: Custom site library for professionally built client websites and isolated acceptance fixtures. KaiTrades uses package key `kaitrades`, version `1`, and `/custom-sites/kaitrades/v1`; it shares no package ID or asset path with `traders-confidence`.

### `custom_site_assignments`

Purpose: Assigns a custom website package to a mentor portal.

Columns: `id uuid`, `trader_id uuid`, `portal_id uuid`, `package_id uuid`, `status custom_site_assignment_status`, `content_overrides jsonb`, `show_powered_by boolean`, `assigned_by uuid`, `activated_at timestamptz`, timestamps.

Relationships: references trader, portal, package, and assigning profile.

Indexes: trader and portal lookup indexes.

RLS: Tenant members view and update safe content fields; platform admins create/manage assignments.

Usage: Super-admin custom website assignment and tenant content editing.

### `custom_site_route_rules`

Purpose: Maps custom site paths to local files or application routes.

Columns: `id uuid`, `package_id uuid`, `source_path text`, `target_type text`, `target_value text`, `sort_order integer`, `is_active boolean`, timestamps.

Relationships: references custom site package.

Indexes: package lookup.

RLS: Active route rules readable; platform admins manage.

Usage: Custom site rendering and join/login routing.

## Database Functions Used by the Application

- `provision_trader`: atomically creates a trader workspace, membership, and portal.
- `get_public_portal_broker_options`: exposes safe broker choices for public registration.
- `review_student_application` and `review_student_applications`: update student statuses and audit review actions.
- `get_student_applications_page`: supports paginated enterprise student review tables.
- `apply_website_template`: applies a template blueprint to a portal.
- `initialize_website_builder`: creates default builder records for a portal.
- `get_public_website_courses`: exposes public course previews for website pages.
- `save_website_draft`: saves builder draft content.
- `publish_website_release`, `unpublish_website`, `rollback_website_release`: manage releases.
- `set_primary_website_domain`, `resolve_public_website_domain`: manage domain routing.
- `create_student_group`, `create_student_group_with_members`, `set_student_group_members`, `ensure_all_students_group`: manage groups and system membership.
- `create_direct_conversation`, `create_conversation_message`, `mark_conversation_read`, `create_announcement_conversation`: manage messaging.
- `set_course_access`, `update_course_with_access`: manage course entitlement.
- `can_access_course`: authoritative verified-student and all-verified/restricted/one-to-one authorization contract.
- `create_lesson_content_block`: atomically creates typed single-media, gallery, text, and link blocks.
- `replace_course_media`: atomically replaces tenant-owned block, gallery, and resource references with a ready asset of the same type.
- `course_media_is_referenced`: protects in-use assets from deletion.
- `issue_course_media_session`: validates current course access and records short-lived protected delivery evidence.
- `record_lesson_progress`: idempotently records resume position and monotonic completion.
- `reorder_course_curriculum`: validates tenant ownership, changes module/lesson order and lifecycle, and audits the operation.
- `update_course_curriculum_settings`: updates course metadata and access in one database transaction.
- `assign_custom_site_package`, `set_website_delivery_mode`: super-admin package assignment and portal delivery mode.

No dedicated external website entry table exists. Approved external websites use the existing portal slug and custom-domain records by linking into KaiMentors-controlled Join Academy and Sign In URLs.

## RLS Summary

All business tables have row-level security enabled. The core pattern is:

- Public can read only intentionally published website/portal records.
- Students can read their own records and published content only when verified and entitled.
- Tenant members can manage records for their `trader_id`.
- Platform admins can manage platform-level or cross-tenant records.
- Service-role usage is server-only and must not be exposed to browser code.
