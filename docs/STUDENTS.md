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
- Broker
- Trading account number
- MT4/MT5 number
- Optional screenshot proof

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

- `/student`
- `/student?portal=[slug]` when entering from a platform portal-branded route
- `/student/courses`
- `/student/courses/[courseId]`
- `/student/courses/[courseId]/lessons/[lessonId]`
- `/student/messages`

On custom domains, `/academy` maps to the student portal route family. Student status, courses, lessons, and messages resolve the academy context from the custom domain or `portal` query so students do not accidentally view another academy context.

## Learning Progress

Verified students see My Learning, Continue Watching, and Completed course views. Course percentages use published required lessons. `lesson_progress` keeps resume position, first start, first completion, monotonic completion, and last activity per tenant/student/lesson. Removing access blocks future content and media sessions immediately but does not erase learner history.
