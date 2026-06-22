# Audit Logging

## Authentication Challenge Events

`auth_challenge_events` records challenge purpose and lifecycle (`requested`, `resend_requested`, `rate_limited`, `suppressed`, `provider_error`, `verified`). It stores a one-way email hash and optional user ID. Authenticated completion endpoints record successful signup, recovery, invitation, and email-change verification. OTP codes, token hashes, confirmation URLs, passwords, and raw provider responses are forbidden from audit metadata.

Migration `021` records `hosted_auth_policy_verification_failed` in `audit_logs` and moves email delivery to canary-only mode. The event records only the failure category and control response; received email bodies, template HTML, OTPs, and credentials are excluded.

Migration `022` adds the immutable promotion chain: `hosted_auth_policy_verified` records only verification method/time and numeric policy, `auth_email_canary_accepted` references the verified challenge event and boolean attestations, and `auth_email_delivery_promoted` records the policy transition. `academy_invitation_resend_authorized` links a production resend to its `resend_authorized` challenge event. Neither audit store contains PATs, passwords, OTPs, email bodies, template bodies, or authentication URLs.

Migration `023` adds `auth_challenge_verification_reconciled`. It records the request and verified event IDs, provider evidence source and provider confirmation timestamp after the database independently validates `auth.users`; it does not store the access token, OTP, or email.

Migration `024` adds `account_setup` challenge purpose and auditable events for invitation renewal, account setup completion, and owner-email correction. Setup session records contain token/email hashes and lifecycle timestamps only. No OTP, password, bearer token, raw email, provider response, or email body is stored.

## Academy Administration Events

Invitation, package assignment, portal/domain changes, risk-template changes and ownership-transfer rows use table audit triggers. Domain lifecycle details also use `website_domain_events`. Verified owner email changes write `owner_email_verified` after Supabase Auth and profile identity agree. Operational audit retention follows the platform retention policy; acceptance-test events are not exempt.

Last updated: 2026-06-20

## Purpose

Audit logs provide operational traceability for tenant and platform actions. They support accountability for student decisions, content changes, and administrative operations.

## Audit Event Structure

Audit records are stored in `audit_logs`.

Fields:

- `id`
- `trader_id`
- `actor_user_id`
- `action`
- `entity_type`
- `entity_id`
- `metadata`
- `created_at`

## Logged Actions

Implemented and expected logged action categories include:

- Student review decisions: approve, reject, request more information.
- Bulk student review decisions.
- Course created.
- Course updated.
- Course access changed.
- Curriculum reordered or publication state changed.
- Module and lesson created.
- Course media uploaded, failed validation, replaced, archived, or blocked from deletion.
- Protected media session issued (stored in `course_media_access_sessions`, without signed URL or credential content).
- Lesson created.
- Video uploaded.
- Website publishing and rollback operations where implemented by database functions.
- Custom site and platform admin actions where API/database workflows write metadata.
- KaiTrades fixture package, assignment, portal, and tenant classification mutations through existing table audit triggers when migration `014` is applied.

When adding a new workflow that changes important tenant or platform state, add or verify audit logging.

## Access

Tenant members can view audit logs for their own workspace. Platform admins can view platform-wide logs through `/admin/audit-logs`.

## Retention Strategy

No automated retention job is currently documented in the implementation. Audit logs should be treated as durable operational records until a formal retention policy is added.

## Usage in Application

Audit logs are shown in dashboard/admin areas to provide visibility into changes. They are also useful during support investigations and security reviews.

## Maintenance Rule

Any new auditable workflow must update this file and `CHANGELOG.md` with the action names and metadata shape.
