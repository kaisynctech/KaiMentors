# Broker Integrations

## Multi-Academy Validation

Broker account rows remain owned by `trader_id`; academy provisioning does not clone or share broker connections. The deployed matrix contains one KaiTrades test broker account and none for Traders Confidence or Milkers FX. Public broker options and student registration continue to resolve the portal server-side, so a custom package or Core Academy Page cannot select another academy's broker connection.

Last updated: 2026-06-17

## Architecture

KaiMentors separates broker configuration from verification execution.

- `brokers` stores platform-level broker catalog records.
- `trader_broker_accounts` stores tenant-specific partner codes, affiliate links, and verification method.
- `student_applications` stores selected broker and account details.
- `verification_attempts` stores verification evidence and outcomes.
- Supabase Edge Function `verify-broker-account` runs broker API checks server-side.

## Adapter Pattern

Broker API calls are handled through an Edge Function adapter registry:

- `supabase/functions/verify-broker-account/adapters/registry.ts`
- `supabase/functions/verify-broker-account/adapters/http-json.ts`
- `supabase/functions/verify-broker-account/adapters/types.ts`

This keeps broker-specific logic out of the browser and allows additional broker adapters to be added without changing public registration forms.

## Verification Methods

Supported methods:

- `api`: API verification through the Edge Function.
- `manual_review`: mentor reviews the application.
- `screenshot_upload`: student uploads proof, mentor reviews it.

## API Verification Flow

API verification is now triggered from the student portal dashboard (EP-015), not at signup.

1. Student submits account details via `POST /api/student/verify` from the dashboard.
2. Route authenticates the student and enforces a rate limit (5 attempts per hour).
3. Route loads all active broker connections for the trader (from `student_applications.trader_id`).
4. For each `api`-method connection: route updates the application with `trader_broker_account_id` and `broker_account_identifier`, then invokes the `verify-broker-account` Edge Function with `{ applicationId }`.
5. Edge Function loads broker adapter configuration securely (vault secrets, `public_config`), calls the broker API, and updates the application status and `verification_attempts` record.
6. On a verified result: route emits an audit log and returns `{ status: "verified" }`.
7. If no API connection verifies: application transitions to `manual_review`, a `verification_attempts` row is inserted by the route, and an audit log is emitted.

## Manual Review Flow

1. Student submits registration details.
2. Application is marked pending or manual review.
3. Mentor reviews details in `/dashboard/students`.
4. Mentor approves, rejects, or requests more information.
5. Database functions update status and create audit logs.

## Screenshot Verification Flow

1. Student uploads screenshot proof during registration or review.
2. File is stored in the `verification-proofs` bucket.
3. `verification_attempts.proof_path` records the file path.
4. Tenant reviewers and the owning student can access the proof under RLS/storage policies.
5. Mentor reviews and updates status.

### Resubmission (EP-014 / EP-015)

`VerificationScreenshotUpload` is shown on the student dashboard for all unverified students (`pending` or `manual_review`). The client uploads to `{trader_id}/{student_user_id}/resubmission/verification.{ext}` (upsert), then calls `PATCH /api/student/verification-screenshot`. That route validates path ownership and tenant integrity before updating `student_applications.verification_screenshot_path` via admin client and emitting an audit log. The storage policy and route both accept `pending` and `manual_review` status (expanded from `manual_review`-only in EP-014).

## Verification Instructions (EP-014)

`trader_broker_accounts.verification_instructions` (text, nullable) stores custom step-by-step guidance mentors want students to follow. Set via `PATCH /api/brokers/accounts` (extended in EP-014 alongside `affiliateLink` and `partnerCode`). Displayed to students in `BrokerGuideCard` inside the student portal dashboard. The field is returned by the `get_student_broker_guide` SECURITY DEFINER function.

## partner_code Exposure (EP-015)

`get_student_broker_guide` now returns `partner_code` so students can use the mentor's referral/affiliate code when registering a new broker account. This is a deliberate reversal of the EP-014 decision to hide the field. The SECURITY DEFINER gate (application existence check) ensures only students with a valid application for the matching portal can read the code. The function still does NOT return `adapter_key`, `api_config`, `vault_secret_id`, or any other sensitive broker configuration.

Last updated: 2026-06-24

## Security Rules

- Broker APIs are never called from frontend code.
- Broker credentials and API secrets must stay server-side.
- Verification proof files are private and policy-protected.
- All review decisions should be auditable.
