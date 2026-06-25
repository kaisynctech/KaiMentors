# Changelog

## EP-015 — Signup Simplification & Dashboard Verification (2026-06-25)

### Changed
- Registration form reduced from 4 steps (Profile → Experience → Broker → Review) to 3 steps (Profile → Experience → Review). Broker step and all broker fields removed from signup.
- Consent text updated to reflect deferred verification: no longer references "selected broker". Now states verification will happen from the student portal dashboard.
- "What happens next" paragraph updated to explain broker verification occurs from the dashboard after account creation.
- `POST /api/student/register` no longer accepts `brokerConnectionId`, `tradingAccountNumber`, `platformAccountNumber`, or `screenshotProof`. Applications are created with broker fields null and status `pending`.
- `get_student_broker_guide` now returns all active broker connections (removed `LIMIT 1`). Returns `broker_id`, `broker_name`, `broker_logo_path`, and `partner_code` (deliberate EP-015 reversal — see `BROKER_INTEGRATIONS.md`). Joins `brokers` table.
- `BrokerGuideCard` updated to support multiple broker connections with a tab selector. Shows `partner_code` and `broker_name`. `VerificationScreenshotUpload` now shown for all unverified students (`pending`, `processing`, `manual_review`), not only `manual_review`.
- `PATCH /api/student/verification-screenshot` now permits `pending` status in addition to `manual_review`.
- Storage policies for `verification-proofs` resubmission path updated to permit `pending` students (migration `029`).

### Added
- `POST /api/student/verify` — authenticated route for dashboard-triggered broker verification. Rate-limited at 5 attempts per 60 minutes. Invokes the `verify-broker-account` Edge Function for API-method broker connections. Transitions to `manual_review` if no API match. Emits audit logs for both outcomes.
- `VerifyAccountForm` client component — shown on the student dashboard for all unverified non-rejected students. Account number input, optional broker selector (when multiple connections), loading/error/success states.

### Database
- Migration `029`: `trader_broker_account_id` and `broker_account_identifier` made nullable on `student_applications`. Storage resubmission policies updated. `get_student_broker_guide` function replaced.

### Security
- `GET /api/student/verify` role check: returns 403 for non-student roles (trader, super_admin).
- Broker connection tenant isolation: `brokerConnectionId` is always filtered by the student's `trader_id` — cross-tenant lookup is impossible.
- `adapter_key`, `api_config`, and `vault_secret_id` are not accessible through any student-facing function or route.
- The Edge Function is invoked server-side with the student's JWT, not the service role key.

## EP-014 — Student Portal Redesign (2026-06-24)

See git log for EP-014 details.
