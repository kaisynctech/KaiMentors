# MB-123 — Course Completion Certificates

**Status:** Ready for implementation  
**Author:** Enterprise Architect  
**Date:** 2026-08-27  
**Scope:** All portals

---

## 1. Context & Goal

Lesson-level completion is tracked in `lesson_progress`. Nothing aggregates these into a course-level completion state, and no certificate infrastructure exists anywhere in the codebase.

This brief adds:
- Course-level completion detection (all required lessons done → course complete)
- A `student_certificates` table to record issued certificates
- Automatic certificate issuance when a course is completed
- A public certificate page (shareable URL, no auth required)
- Certificate display on the student dashboard and course list
- A "Download / Print" option from the certificate page

---

## 2. What Counts as Course Completion

A course is complete when every lesson in the course where `is_required = true` has a `lesson_progress` row for the student with `is_completed = true`.

If a course has zero required lessons (`is_required = false` on all), it is considered complete as soon as any lesson is completed. This edge case should be handled gracefully — do not issue a certificate if the course has zero lessons at all.

The check lives in the existing progress API route (`/api/course-progress`) since that is the only place `lesson_progress` is written. After recording progress, if `is_completed` is being set to `true`, run the completion check for the course. This is the correct choke-point — do not add a DB trigger for this; keep the logic in the application layer for observability and testability.

---

## 3. Database

### 3a. New table: `student_certificates`

```sql
create table public.student_certificates (
  id                    uuid primary key default gen_random_uuid(),
  trader_id             uuid not null,
  portal_id             uuid not null,
  student_user_id       uuid not null references auth.users(id) on delete cascade,
  student_application_id uuid not null references public.student_applications(id) on delete cascade,
  course_id             uuid not null references public.courses(id) on delete cascade,
  student_name          text not null,       -- snapshot at time of issue
  course_title          text not null,       -- snapshot at time of issue
  portal_name           text not null,       -- snapshot at time of issue
  public_token          text not null unique default encode(gen_random_bytes(18), 'base64url'),
  issued_at             timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  unique (student_application_id, course_id)  -- one certificate per student per course
);

-- Index for fast lookup by student
create index on public.student_certificates (student_user_id);
create index on public.student_certificates (public_token);

alter table public.student_certificates enable row level security;

-- Students can read their own certificates
create policy "student_read_own"
  on public.student_certificates for select
  to authenticated
  using (student_user_id = auth.uid());

-- Public can read by token (for shareable URL) — handled at API route level, not RLS
-- Service role manages all
```

**Why snapshot `student_name`, `course_title`, `portal_name`:** Names and titles may change. The certificate must reflect what was true at the time of completion, not the current value. Never join to live tables when rendering a certificate — always use the snapshot fields.

### 3b. Verify `gen_random_bytes` is available

`encode(gen_random_bytes(18), 'base64url')` requires the `pgcrypto` extension. Verify it is enabled on the project before applying the migration:
```sql
select * from pg_extension where extname = 'pgcrypto';
```
If not enabled: `create extension pgcrypto;`

---

## 4. Certificate Issuance Logic

### Location: `/api/course-progress/route.ts`

After the existing `record_lesson_progress` RPC call succeeds, and when the posted `completed` field is `true`, add the following completion check:

```
1. Load all lessons for the course where is_required = true.
2. If there are no required lessons at all — skip (do not issue a certificate).
3. Count how many of those required lessons now have is_completed = true in lesson_progress for this student and course.
4. If all required lessons are complete:
   a. Check whether a certificate already exists for this (student_application_id, course_id) pair.
   b. If yes — do nothing (idempotent, already issued).
   c. If no — fetch student full_name from student_applications, course title from courses, portal_name from portals.
   d. Insert a new row into student_certificates.
   e. Return the new certificate's public_token in the API response (so the client can show a "Certificate earned" moment).
```

Use the **service-role admin client** for this check and insert — the student's session client may not have SELECT access to all required rows depending on RLS, and the insert into `student_certificates` must bypass RLS (service role always bypasses RLS). Do not fail the whole progress-save if the certificate insert fails — log the error and continue. The lesson progress is the important thing; the certificate can be re-issued on next completion signal.

### Idempotency

The `unique (student_application_id, course_id)` constraint makes double-issuance impossible at the DB level. The app-level check in step 4b is an optimisation to avoid a failed unique constraint insert — but even if it is skipped, the insert will simply fail with a unique violation which the API catches and ignores.

---

## 5. Public Certificate Page

### Route: `/certificates/[token]/page.tsx`

This is a public Next.js page — no auth required. Anyone with the URL can view the certificate (for LinkedIn sharing, employer verification, etc.).

**Data fetch:**
```ts
const cert = await adminClient
  .from("student_certificates")
  .select("student_name, course_title, portal_name, issued_at")
  .eq("public_token", token)
  .single();

if (!cert.data) notFound();
```

Use the admin client to bypass RLS — this route must work for unauthenticated visitors.

**What the certificate page renders:**

A clean, print-friendly certificate layout:

```
[Portal name / Logo if available]

CERTIFICATE OF COMPLETION

This certifies that

[Student Name]

has successfully completed

[Course Title]

[Issued date — formatted as "27 August 2026"]

[Verification URL — the page's own URL]
```

Design notes:
- White background, serif or elegant sans-serif font, centred layout
- The portal name replaces "KaiSync Institution" (white-label — never show KaiMentors branding)
- A subtle border or decorative frame
- Do not hardcode any colours — use the portal's `primary_color` if it is available (it can be fetched alongside the cert query by joining to `portals` via `portal_id`, but only for the color — do not expose other portal data publicly)
- A "Print / Download" button that calls `window.print()` — browser print-to-PDF gives the student a PDF certificate without any server-side PDF generation library. Use a `@media print` CSS block to hide the button and any navigation during printing.

**Route path:** `/certificates/[token]` at the root of the Next.js app (not under `/student/` or `/academy/`). This ensures it is accessible without login on any domain.

### Open Graph meta tags

Add meta tags so sharing on LinkedIn, WhatsApp, or Twitter shows a rich preview:
```html
<meta property="og:title" content="{studentName} — {courseTitle} Certificate" />
<meta property="og:description" content="Completed {courseTitle} at {portalName}" />
```

---

## 6. Student-Facing Certificate Access

### On the course list page (`/app/student/courses/page.tsx`)

For each completed course (all required lessons done), show a "Certificate earned ✓" badge and a "View certificate →" link alongside the "Completed" badge.

To determine which courses have certificates, add a single query alongside the existing courses + progress queries:
```ts
supabase
  .from("student_certificates")
  .select("course_id, public_token")
  .eq("student_user_id", user.id)
  .eq("trader_id", application.trader_id)
```

Build a `Map<courseId, publicToken>` and use it when rendering course cards.

### On the student dashboard (`/app/student/page.tsx`)

In the stats row, add a "Certificates" stat card showing how many certificates the student has earned. Clicking it links to the course list (or a future dedicated certificates page).

### No dedicated `/student/certificates/` page

Keep it simple for this brief — the course list is the primary discovery point. A dedicated page can be added in a future brief if needed.

---

## 7. "Certificate Earned" Moment

When the lesson player marks a lesson complete and the API response includes a `certificateToken` field, the client should show a brief celebratory notice — a toast or a modal — with:

- "🎉 Course complete! You've earned your certificate."
- A "View certificate" button linking to `/certificates/{token}`

This requires a small change to the lesson player's completion handling. The existing `ProtectedLessonContent` client component posts to `/api/course-progress` and handles the response. Extend that handler to check for `certificateToken` in the response and, if present, show the celebratory UI.

---

## 8. Type Updates

Add `CertificateRow` interface:
```ts
interface CertificateRow {
  course_id: string;
  public_token: string;
}
```

The `/api/course-progress` response type should include:
```ts
{
  ok: boolean;
  certificateToken?: string;  // present only when a certificate was just issued
}
```

---

## 9. Testing Checklist

- [ ] Verify `pgcrypto` extension is enabled before applying migration.
- [ ] Apply the `student_certificates` migration.
- [ ] Complete all required lessons in a test course → certificate row created in DB with correct `student_name`, `course_title`, `portal_name` snapshots.
- [ ] Completing the same course again does not create a duplicate certificate.
- [ ] Certificate page (`/certificates/[token]`) renders correctly when unauthenticated.
- [ ] Certificate page returns 404 for an invalid token.
- [ ] Certificate page renders the portal name, not "KaiMentors".
- [ ] `window.print()` button hides navigation and button in print preview.
- [ ] Course list shows "Certificate earned ✓" badge and "View certificate →" link for completed courses.
- [ ] Dashboard shows correct certificate count.
- [ ] Lesson player shows "Course complete" toast/modal with "View certificate" link.
- [ ] Cert count on dashboard increments when a new course is completed.
- [ ] A course with zero required lessons does not issue a certificate.
- [ ] `tsc --noEmit` exits clean.

---

## 10. Implementation Order

1. Verify `pgcrypto` extension, apply migration.
2. Extend `/api/course-progress/route.ts` with completion check + certificate issuance.
3. Create `/app/certificates/[token]/page.tsx` with print styles.
4. Add `student_certificates` query to `/app/student/courses/page.tsx` and render badge + link.
5. Add certificates stat card to `/app/student/page.tsx`.
6. Extend `ProtectedLessonContent` to show celebratory UI on `certificateToken` in response.
7. Apply the same course-list changes to `/app/academy/courses/` if that route exists.
8. Run `tsc --noEmit`.

---

## 11. Out of Scope (Future)

- Mentor branding customisation on the certificate (logo, custom text)
- Dedicated `/student/certificates/` page listing all earned certificates
- Certificate revocation (if a student's access is revoked)
- Expiry dates on certificates
- QR code on the certificate linking to the verification URL
