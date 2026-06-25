# Changelog

## EP-016 — Dual-Role User Support (2026-06-25)

### Fixed
- **Register route** (`POST /api/student/register`): existing users whose email already has an auth account no longer silently lose their academy application. The route now looks up the existing user, creates a `student_applications` row for the submitted portal if they don't already have one, and returns `existingUser: true`. No new auth user is created or deleted. Rollback (delete auth user) is still performed only for newly created users.
- **Academy login form** (`LoginForm`, `AcademyLoginPage`): replaced the `allowedRole="student"` hard-block with an `academyContext` prop. The new flow checks `trader_members` first (mentor) then `student_applications` (student) — allowing traders who are also academy students to sign in. `super_admin` is blocked at the academy login. Users with no relationship to the academy are signed out with a clear error message.
- **Middleware** (`middleware.ts`): traders are no longer unconditionally redirected away from `/student`. If the trader has at least one `student_applications` row they are allowed through; otherwise redirected to `/dashboard` as before.
- **Student page** (`app/student/page.tsx`): when no portal context is provided, `rejected` applications are excluded from the most-recent-application query. A dual-role user with a rejected application at one academy and an active one at another now lands on the active application.

### Changed
- `StudentRegistrationForm`: replaced dead `studentPortalPath` prop with `loginPath`. On `existingUser: true` response, shows "Welcome back" copy with a sign-in link instead of redirecting to `/account-setup`.
- `AcademyLoginPage` card header updated from "Student login" to "Academy login"; description updated to include mentors.

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
