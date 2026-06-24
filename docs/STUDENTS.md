# Students

## Branded Academy Entry

Returning login retains academy context through the resolved portal/domain. After password authentication, KaiMentors accepts only a student profile with an application for that exact academy. The same student can hold applications in multiple academies, but one tenant's status, evidence, courses, groups and conversations do not grant access to another tenant. Join Academy and Sign In remain centralized even when a custom package supplies the visual website.

Last updated: 2026-06-17

## Registration Process

Students register from the canonical Join Academy flow:

- `/portal/[slug]/join-academy`
- `/join-academy` on a resolved custom academy domain

Registration captures:

- Full name
- Email
- Phone number
- Trading level (self-reported: `beginner`, `intermediate`, `advanced`, `funded`) — required
- Years trading (`less_than_1`, `1_to_3`, `3_to_5`, `5_plus`) — optional
- Biggest challenge (free text, max 500 chars) — optional
- Broker
- Trading account number
- MT4/MT5 number
- Optional screenshot proof

The registration form uses a 4-step flow: Profile → Experience → Broker → Review. The Experience step captures `trading_level`, `years_trading`, and `trading_challenge`. Students who select "No account yet" on the Broker step receive an affiliate-link guide and cannot advance until they have an account.

The server resolves the academy tenant from the custom-domain hostname or portal slug, creates an unconfirmed passwordless student identity when needed, creates the tenant-scoped `student_applications` and `verification_attempts` records, then directs the student to `/account-setup`. Password creation is available only after the email OTP is verified. Repeated registration returns an enumeration-safe continuation response and does not duplicate the identity or application.

## Verification Methods

Verification method is configured per tenant broker account:

- `api`: server-side broker adapter verification.
- `manual_review`: mentor reviews the application manually.
- `screenshot_upload`: student uploads proof for review.

Frontend code must never call broker APIs directly.

## Student Statuses

Database enum statuses:

- `pending`
- `processing`
- `verified`
- `rejected`
- `manual_review`

Workflow UI also supports review notes and needs-more-information handling where implemented by student review fields.

Student-facing status language:

- Pending Review: "Your academy access is being reviewed."
- Processing: "We're checking your verification details."
- Verified: "You're approved. You can now access your academy."
- Rejected: "Your application could not be approved. Please contact the academy for support."
- Needs More Information: "More information is needed before your access can be approved."

## Mentor Review Workflow

Mentors use `/dashboard/students` to review applications in table-based views. The student manager supports KPI cards, status filtering, individual review actions, and bulk review workflows.

Actions include:

- Approve
- Reject
- Request more information

Review actions update the database, create audit logs, and refresh the UI.

## Student Lifecycle

1. Student registers through a tenant portal.
2. Application starts as pending/manual review depending on broker setup.
3. Mentor or broker API verifies the student.
4. Verified students gain access to published content.
5. Group membership can further restrict or expand access.
6. Rejected or unverified students cannot access protected course content.

## Groups

Student groups support cohorts such as general students, one-on-one students, VIP students, or private learning tracks.

The system includes an all-students system group. Verified students are automatically synchronized into that group so mentors can message and grant access to all verified students.

## Student Portal

Students access:

- `/student` — dashboard with status card, continue-learning, live classes, announcements, and broker guide
- `/student?portal=[slug]` when entering from a platform portal-branded route
- `/student/courses`
- `/student/courses/[courseId]`
- `/student/courses/[courseId]/lessons/[lessonId]`
- `/student/live-classes`
- `/student/groups`
- `/student/messages`

On custom domains, `/academy` maps to the student portal route family. Student status, courses, lessons, and messages resolve the academy context from the custom domain or `portal` query so students do not accidentally view another academy context.

### StudentShell

A persistent sidebar shell wraps all student portal pages. `StudentShell` is a server component that generates a signed URL for the portal logo from the `portal-branding` bucket (1-hour expiry) and delegates rendering to `StudentShellClient`, a client component that manages the mobile drawer, active-link highlighting, and the sign-out form. Nav items: Dashboard, My Courses, Live Classes, Groups, Messages. Live Classes, Groups, and Messages show a lock icon and are dimmed for unverified students; they still navigate but show a `ContentGate`.

### ContentGate

`ContentGate` replaces the previous redirect-on-unverified pattern. Unverified students see the page structure (header, eyebrow) with a blurred placeholder and a centred lock overlay that shows a status-appropriate message and a back link to the dashboard. Status→message mapping: `pending` → "Access pending", `manual_review` → "More information needed", `processing` → "We're checking your details", `rejected` → "Your application could not be approved". This pattern applies to Courses, Live Classes, Groups, and Messages.

### Broker Guide and Screenshot Resubmission

The student dashboard shows a `BrokerGuideCard` below the announcements section. The card is populated by `get_student_broker_guide(p_portal_id)`, a `SECURITY DEFINER` function that returns `id`, `affiliate_link`, `verification_method`, and `verification_instructions` — never `partner_code`. When `verification_method = 'screenshot_upload'` and the application is in `manual_review` status, `BrokerGuideCard` renders `VerificationScreenshotUpload`, a client component that accepts JPEG/PNG/WebP files up to 10 MB, uploads directly to the `verification-proofs` bucket at `{trader_id}/{student_user_id}/resubmission/verification.{ext}` (upsert), then calls `PATCH /api/student/verification-screenshot` with the storage path and portalId.

### verification-screenshot API

`PATCH /api/student/verification-screenshot` validates:
- Auth: authenticated user required (401 otherwise).
- `storagePath` regex: must match `{uuid}/{uuid}/resubmission/verification.\w+`.
- Path ownership: `storagePath` segment 1 must equal `user.id` (403 otherwise).
- Application eligibility: application must be found for this student + portalId in `manual_review` status (404 otherwise).
- Tenant integrity: `application.trader_id` must match path segment 0 (403 otherwise).
- Uses admin client for the privileged write; emits `student.verification_screenshot.submitted` audit log.

### manual_review Display Rule

`manual_review` DB status always displays as "More information needed" — never as "being reviewed". This applies to `ContentGate`, the student dashboard status card, and any other student-facing copy.

## Learning Progress

Verified students see My Learning, Continue Watching, and Completed course views. Course percentages use published required lessons. `lesson_progress` keeps resume position, first start, first completion, monotonic completion, and last activity per tenant/student/lesson. Removing access blocks future content and media sessions immediately but does not erase learner history.

Last updated: 2026-06-24
