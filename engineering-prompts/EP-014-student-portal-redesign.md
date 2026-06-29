# Engineering Prompt EP-014 — Student Portal Redesign

**Issued by:** KaiMentors Enterprise Architect  
**Date:** 2026-06-24  
**Priority:** High  
**Estimated scope:** Major feature — DB migration, new components, page rewrites, RLS, storage

---

## 1. Task Title

Student Portal Redesign — Dashboard Shell, Verification Guide, Content Gate, and Broker Verification Upload

---

## 2. Business Objective

The current student portal (`/student`) is a single status card with no navigation, no dashboard, and no actionable surface for unverified students. Verified students are sent directly to Courses with no overview of their academy experience.

This build delivers:

- A persistent sidebar shell (`StudentShell`) that mirrors the mentor `DashboardShell` — consistent UX pattern across both portal types
- A full student dashboard (`/student`) showing verification status, learning progress, live class schedule, and mentor announcements
- A broker verification guide and screenshot upload workflow accessible from the student portal — allowing students with `screenshot_upload` verification method to submit or resubmit evidence without leaving the portal
- A content gate overlay (not a redirect) for unverified students visiting Courses, Messages, Live Classes, and Groups — maintaining context while communicating the access barrier
- New student pages: Live Classes and Groups
- `verification_instructions` field added to the mentor's broker accounts manager — allowing mentors to publish custom guidance for their students

The outcome is a production-quality student portal that guides students from registration to verification to active learning in a coherent, multi-tenant shell.

---

## 3. Current State and Problems

**Read these files before touching anything:**

- `app/student/page.tsx` — current single-card student page
- `app/student/courses/page.tsx` — courses list (redirects unverified)
- `app/student/messages/page.tsx` — messages page (read for current state)
- `components/broker-accounts-manager.tsx` — mentor broker form
- `app/api/brokers/accounts/route.ts` — broker accounts API
- `lib/student-routing.ts` — `getStudentAcademyContext` (critical utility)
- `docs/STUDENTS.md`
- `docs/STORAGE.md`
- `docs/DATABASE.md`
- `docs/MULTI_TENANCY.md`
- `docs/SECURITY.md`
- `docs/BROKER_INTEGRATIONS.md`
- `docs/COURSES.md`

**Known problems to fix:**

### 3a. `needs_more_information` dead code bug

`app/student/page.tsx` line 50:
```
const needsMoreInformation = application?.status === "needs_more_information";
```

The `verification_status` DB enum does NOT include `needs_more_information`. The values are: `pending`, `processing`, `verified`, `rejected`, `manual_review`. This condition can never be true.

The mentor action "Request more information" sets status to `manual_review`. The current code treats `manual_review` as `pendingReview` (line 60). This means students who have been asked for more information see "Your academy access is being reviewed" — identical to a brand new application. They have no way to know action is required from them.

**Engineering must fix this:** In the new portal, `manual_review` status = "More information needed" display state. Map it to the "needs more information" message and surface the screenshot upload component (if `screenshot_upload` is the broker verification method) so the student can act.

### 3b. No `traderId` resolved in current student page

The current application query does not fetch `trader_id` from `student_applications`. All new student portal pages need `traderId` to scope their queries. It must be resolved server-side from the application record — never derived client-side.

### 3c. `courses/page.tsx` redirects unverified students

The current courses page calls `redirect(...)` when no verified application exists. The new behaviour is a content gate overlay, not a redirect. The redirect pattern must be replaced across all gated student pages.

### 3d. `verification_instructions` does not exist on `trader_broker_accounts`

The column does not exist yet. Mentors cannot currently publish any custom verification steps to their students. This blocks the broker guide card in the student portal.

### 3e. `verification_screenshot_path` does not exist on `student_applications`

The column does not exist yet. There is nowhere to store a portal-side resubmission screenshot path. The `screenshot_proof` column (added in migration 027) stores the registration-time screenshot. The new column stores a post-registration portal upload.

---

## 4. Root Cause Investigation Requirements

Before writing any code, Engineering must:

1. Read `lib/student-routing.ts` in full. Understand `getStudentAcademyContext`. All new student pages MUST call this function. It is the single source of truth for custom domain vs platform slug resolution.
2. Read `app/student/courses/page.tsx` in full. Understand the full data shape before extending it.
3. Read `components/broker-accounts-manager.tsx` in full. Understand the existing form structure, state model, and API contract before extending it.
4. Read `app/api/brokers/accounts/route.ts` in full. Understand Zod validation schemas and existing PATCH before adding to it.
5. Run `grep -r "getStudentAcademyContext" app/` to find every caller. Confirm all student pages are using this correctly.
6. Run `grep -r "createAdminClient\|createClient\|createServerClient" app/student/` to audit the Supabase client used on each student page.
7. Query DB: `SELECT column_name FROM information_schema.columns WHERE table_name = 'trader_broker_accounts'` — confirm `verification_instructions` does not exist.
8. Query DB: `SELECT column_name FROM information_schema.columns WHERE table_name = 'student_applications'` — confirm `verification_screenshot_path` does not exist.
9. Query DB: confirm the `verification-proofs` storage bucket exists and its current policies.
10. Confirm the `verification_status` enum values: `SELECT enum_range(NULL::verification_status)`.

---

## 5. Existing Architecture to Respect

### Multi-tenancy
KaiMentors uses Supabase RLS as the primary tenant-isolation layer. Every student page resolves tenant context from the authenticated session. Students in one academy cannot see another academy's data. Never hard-code tenant, portal, trader, or student IDs.

### Academy context resolution
`getStudentAcademyContext(portalSlug?: string)` in `lib/student-routing.ts` returns:
- `basePath`: `/academy` (custom domain) or `/student` (platform)
- `portalId`: resolved UUID or null
- `portalSlug`: resolved slug or null
- `querySuffix`: `?portal=slug` suffix for platform routes, empty for custom domain

All new student pages must accept `searchParams` and pass `query?.portal` to `getStudentAcademyContext`. All student-portal links must use `basePath` and `querySuffix` from this context.

### Supabase client usage
- **Middleware**: `createServerClient` (SSR) — already in place, do not change
- **Server components and API routes**: `createClient` (from `@/lib/supabase/server`)
- **Admin operations (signed URLs, storage policy bypass)**: `createAdminClient` — use only where documented; never to bypass student authorization

### Portal logo signed URL
Portal logos are stored in Supabase Storage (`portal-branding` bucket). Signed URLs expire. The `StudentShell` server component must generate a signed URL using `createAdminClient` for the portal logo. Do not pass unsigned storage URLs to the client.

### No temporary fixes
Every decision must be the correct long-term solution. No patches, no workarounds, no TODO placeholders, no mock logic.

### Existing test suite
Run all tests: `npm run test` (or `npx jest`). Do not break existing passing tests.

---

## 6. Implementation Requirements

### 6a. New component: `StudentShell`

Create `components/student-shell.tsx` (server component wrapper) and `components/student-shell-client.tsx` (client component for interactive sidebar toggle on mobile).

`StudentShell` receives the following props — all resolved server-side before render:

```typescript
interface StudentShellProps {
  academyName: string;
  logoUrl: string | null;       // signed URL from portal-branding bucket
  traderId: string;
  isVerified: boolean;
  basePath: "/academy" | "/student";
  querySuffix: string;
  children: React.ReactNode;
}
```

Sidebar navigation links (use `basePath + path + querySuffix` for all hrefs):
- Dashboard (`/student`)
- My Courses (`/student/courses`)
- Live Classes (`/student/live-classes`) — show lock icon if not verified
- Groups (`/student/groups`) — show lock icon if not verified
- Messages (`/student/messages`) — show lock icon if not verified

Footer items in sidebar:
- Student's display name (from session profile)
- Sign out link (`/auth/signout`)

The shell layout must be responsive: full sidebar on ≥768px, collapsible drawer on mobile with a hamburger toggle.

CSS must use CSS Modules, consistent with `DashboardShell`'s patterns. Do not use Tailwind. Name the module `student-shell.module.css`.

### 6b. Rewrite `app/student/page.tsx` (Dashboard)

This page is a full rewrite. It becomes the student dashboard within `StudentShell`.

**Data to fetch (server-side, scoped to authenticated student):**

1. `student_applications`: `status`, `status_reason`, `trader_id`, `portal_id`, `portal:portals!inner(portal_name, slug, logo_path)`
2. Portal's `trader_broker_accounts` for the student's trader: `id`, `affiliate_link`, `verification_method`, `verification_instructions` — where `is_active = true` — READ ONLY (new RLS rule required — see Section 8)
3. `lesson_progress` for the student: joined with lessons + courses, ordered by `last_activity_at DESC`, limit 5
4. Upcoming `live_classes` for the student's trader: where `starts_at > now()` and `access_scope` allows the student's group membership — limit 1 (next class only)
5. Recent `announcements` for the student's trader: where `access_scope` allows the student's group membership — limit 3, ordered by `created_at DESC`

**Status mapping (fix the `needs_more_information` bug):**

```
pending         → "Your academy access is being reviewed."
processing      → "We're checking your verification details."
verified        → Portal access granted — show full dashboard
rejected        → "Your application could not be approved." + status_reason
manual_review   → "More information is needed." + status_reason + show VerificationScreenshotUpload if method = screenshot_upload
```

`manual_review` must NEVER be displayed as "Your academy access is being reviewed."

**Dashboard sections (verified students see all; unverified students see the status + broker guide only):**

- `StudentStatCard` row: Courses enrolled, Lessons completed, Messages unread
- `ContinueLearningCard`: Most recent lesson in progress (`lesson_progress` where `is_completed = false`, ordered by `last_activity_at`)
- `CourseProgressList`: Up to 4 enrolled courses with percentage completion
- `NextLiveClassCard`: Countdown timer to the next live class (client component)
- `MentorAnnouncementsCard`: Up to 3 recent announcements (title, preview, date)
- `BrokerGuideCard`: Always visible if application exists; shows verification method, `verification_instructions` (if set by mentor), affiliate link button (if set). If status is `manual_review` and method is `screenshot_upload`, renders `VerificationScreenshotUpload` inline.

### 6c. New component: `BrokerGuideCard`

A server component. Receives:
- `verificationMethod: "api" | "manual_review" | "screenshot_upload"`
- `verificationInstructions: string | null`
- `affiliateLink: string | null`
- `applicationStatus: string`
- `studentUserId: string`
- `traderId: string`
- `querySuffix: string`
- `currentScreenshotPath: string | null` — from `student_applications.verification_screenshot_path`

Renders:
- Method-appropriate heading: "How your broker account is verified"
- `verificationInstructions` content block if not null
- "Open broker registration" button if `affiliateLink` is not null
- If `verificationMethod = "screenshot_upload"` and `applicationStatus = "manual_review"` (needs more info): renders `VerificationScreenshotUpload`

### 6d. New component: `VerificationScreenshotUpload`

A client component. Allows students to upload a verification screenshot from within the portal.

Storage target: existing `verification-proofs` bucket. Path: `{traderId}/{studentUserId}/resubmission/verification.{ext}`. 

Engineering must confirm whether the `verification-proofs` bucket's existing storage policies already allow student uploads to this path pattern. If not, add an INSERT policy (student can insert/update only to paths prefixed with `{their trader_id}/{their user_id}/resubmission/`).

On upload success:
1. Update `student_applications.verification_screenshot_path = {storage path}` via a PATCH to a new API route (see Section 11)
2. Optionally set `status` to `processing` if it was `manual_review` — investigate whether this is appropriate or if that is a mentor-only action. If status update by student is not permitted, do not do it.
3. Show a success state with the uploaded image preview

File constraints: JPEG, PNG, WebP only. Max 10 MB. Client-side validation before upload.

Do not use `createAdminClient` in this component. Upload must be performed using the authenticated student's Supabase session.

### 6e. Modify `app/student/courses/page.tsx`

Replace the redirect for unverified students with a `ContentGate` overlay.

The page must:
1. Always render the courses list (so verified students are unaffected)
2. If the student is NOT verified: render `ContentGate` overlaid on top of the blurred course list

The `ContentGate` receives:
- `applicationStatus: string`
- `returnPath: string` — the current page path with querySuffix (for the "Return to status" link)

Do not remove the existing `createAdminClient` signed URL logic. Do not break progress tracking. Only change the access-gate behaviour.

### 6f. New component: `ContentGate`

A server component. Renders a centered card overlay on a blurred background.

Content:
- Lock icon
- "This content is locked" heading
- Short message based on status (use the same status-mapping table as the dashboard)
- "Check verification status" link back to `/student{querySuffix}`

The blur is applied to the content behind the gate via CSS — `filter: blur(4px); pointer-events: none` on the content wrapper, gate overlaid with `position: absolute; inset: 0`.

### 6g. Modify `app/student/messages/page.tsx`

Apply the same `ContentGate` pattern. Read the current messages page first, then apply only the access gate change. Do not break existing message rendering.

### 6h. New page: `app/student/live-classes/page.tsx`

Follows the same server component pattern as courses. Uses `getStudentAcademyContext`.

For verified students: fetch `live_classes` for the student's trader, ordered by `starts_at`. Show past and upcoming classes. Each class shows title, description, `starts_at`, duration, and a join link if available.

For unverified students: show `ContentGate`.

This page must be added to `StudentShell`'s sidebar.

### 6i. New page: `app/student/groups/page.tsx`

For verified students: fetch the student's group memberships from `student_group_members` joined with `student_groups`. Show group name, description, member count.

For unverified students: show `ContentGate`.

This page must be added to `StudentShell`'s sidebar.

### 6j. Modify `components/broker-accounts-manager.tsx`

Add a `verificationInstructions` textarea field to the existing "Add Broker Account" form. Also add an inline edit capability to existing broker account cards that allows the mentor to update `verificationInstructions`, `partnerCode`, and `affiliateLink` on existing accounts.

The existing `is_active` toggle must remain unchanged.

UI: each existing broker account card shows an "Edit" button that expands an inline form with the editable fields. On save, PATCH the account. On cancel, collapse the form.

Textarea: `verificationInstructions` — max 2000 chars. Placeholder: "Write step-by-step instructions for your students to verify their broker account. Students will see this in their portal."

### 6k. Extend `app/api/brokers/accounts/route.ts`

Extend the existing PATCH handler to accept and persist `verificationInstructions` (alongside the existing `isActive` toggle). The same PATCH endpoint handles both operations.

Add `verificationInstructions: z.string().max(2000).nullable().optional()` to the PATCH Zod schema.

If `verificationInstructions` is present in the PATCH body, update that column. Scope the update to the trader's own account (current trader_id scoping must be preserved).

Add a separate PATCH path or ensure the existing PATCH can distinguish between an `isActive`-only update and a full account update — without breaking the `is_active` toggle.

---

## 7. Database and Migration Requirements

### Migration: `202606240028_student_portal_schema.sql`

This is the ONLY migration for this feature. Number: `028`. File must be placed in `supabase/migrations/`.

The migration must do exactly the following, in order:

**1. Add `verification_instructions` to `trader_broker_accounts`:**
```sql
ALTER TABLE trader_broker_accounts
  ADD COLUMN IF NOT EXISTS verification_instructions TEXT;
```
No default. Nullable. Max length enforced by app-layer Zod validation (2000 chars) — do not add a DB check constraint unless there is existing precedent in the codebase for this.

**2. Add `verification_screenshot_path` to `student_applications`:**
```sql
ALTER TABLE student_applications
  ADD COLUMN IF NOT EXISTS verification_screenshot_path TEXT;
```
Stores the Supabase Storage path to the student's resubmission screenshot in the `verification-proofs` bucket. Nullable. No default.

**3. No new enum value for `needs_more_information`.**  
Engineering must NOT add `needs_more_information` to the enum. The `manual_review` status IS the "needs more information" state. Fix the display layer only — map `manual_review` → "More information needed" in the new student portal.

**4. No new storage bucket.**  
The `verification-proofs` bucket already exists (confirmed in `docs/STORAGE.md`). Use it. New sub-path: `{trader_id}/{student_user_id}/resubmission/verification.{ext}`. Bucket policies must be reviewed and extended if the current INSERT policy does not cover this path.

After migration, run `generate_typescript_types` or update `database.types.ts` to reflect the new columns.

---

## 8. RLS and Security Requirements

### 8a. Student read access to `trader_broker_accounts`

Students must be able to read `affiliate_link`, `verification_method`, and `verification_instructions` from broker accounts belonging to their academy's trader.

Students must NOT read `partner_code`. This is a sensitive identifier.

New RLS SELECT policy on `trader_broker_accounts`:
```
students can select (id, affiliate_link, verification_method, verification_instructions)
where the trader_id matches the student's verified (or pending) application trader_id
```

Preferred implementation: a DB function `get_student_broker_guide(p_portal_id uuid)` that returns the broker account fields explicitly — using SECURITY DEFINER only if RLS alone cannot express the cross-table join safely. Consult `docs/SECURITY.md` and `docs/DATABASE.md` for the project's established pattern for this type of function.

If a column-level security approach is not available in the existing pattern, use a VIEW with RLS, or a server-side query in the server component with `createAdminClient` scoped to only the necessary fields — but document which approach was used and why.

Under no circumstances may `partner_code` be exposed to the student client.

### 8b. Student write access to `student_applications.verification_screenshot_path`

Students must be able to UPDATE their own `verification_screenshot_path` (and only that column). No other column on `student_applications` is student-writable via this path.

Preferred implementation: a server-side API route (see Section 11) that uses a service-role or `createAdminClient` scoped UPDATE, with explicit server-side validation that:
- The student owns the application (session user ID = `student_user_id`)
- The path follows the required pattern (`{traderId}/{studentUserId}/resubmission/...`)
- The status is `manual_review` (only allow resubmission in this state)

Do NOT give students a blanket UPDATE policy on `student_applications`.

### 8c. Storage policy for `verification-proofs` resubmission path

Review the existing storage policies on `verification-proofs`. Extend INSERT/UPDATE policies to allow authenticated students to upload to `{trader_id}/{student_user_id}/resubmission/` — where `trader_id` and `student_user_id` must match the student's actual application. Reject any upload to a path they do not own.

Storage policy must use `auth.uid()` to match `student_user_id`.

### 8d. `live_classes` and `announcements` student access

Confirm that the existing RLS on `live_classes` and `announcements` permits a student to SELECT rows where `trader_id` matches their application's trader and `access_scope` permits their group membership. If the current RLS does not cover this, add the appropriate SELECT policy. Do not add student write access.

### 8e. Student access to `student_group_members` and `student_groups`

Confirm existing RLS allows a student to SELECT their own group memberships. If not, add the minimal SELECT policy.

---

## 9. Multi-Tenancy Requirements

- Every server component and API route must resolve `traderId` from the authenticated student's application — never from a query parameter, URL segment, or client-side value.
- `getStudentAcademyContext` provides `portalId`/`portalSlug` for the academy context. `traderId` is derived from `student_applications.trader_id`.
- Portal logo, broker accounts, live classes, announcements, groups, and courses are all scoped to the student's `traderId`.
- A student with applications in multiple academies must see only the current academy's data. The portal context determines which application is active — use `portalId` or `portalSlug` filter on the application query, consistent with the existing pattern in `app/student/page.tsx`.
- The `StudentShell` sidebar receives `traderId`, `basePath`, and `querySuffix` as server-side props. It must never accept tenant IDs from the client.

---

## 10. Authentication and Authorization

- All student pages use `createClient` (from `@/lib/supabase/server`) — the user-session Supabase client. Never `createServerClient` (that is for middleware only).
- If `supabase.auth.getUser()` returns null, redirect to the login page for the current academy context — using `basePath` + `/login` + `querySuffix`.
- If the student has no application for the current portal/academy, redirect to the join page — using `basePath` + `/join-academy` + `querySuffix`.
- Verified students access all pages. Unverified students see the `ContentGate` — not a redirect — on Courses, Messages, Live Classes, and Groups.
- The dashboard (`/student`) is accessible to ALL statuses — it is the verification status and guidance hub.
- Never use `createAdminClient` to bypass student authorization checks.

---

## 11. API and Integration Requirements

### New API route: `PATCH /api/student/verification-screenshot`

Handles the `VerificationScreenshotUpload` component's post-upload update.

Request body:
```typescript
{
  storagePath: string;  // the uploaded file path in verification-proofs bucket
  portalId: string;     // to scope the correct application
}
```

Server validates:
1. Authenticated student session (via `createClient`)
2. Application exists for this student + portalId
3. Application status is `manual_review`
4. `storagePath` matches the required pattern: `{traderId}/{studentUserId}/resubmission/`
5. If valid: UPDATE `student_applications.verification_screenshot_path = storagePath` for the matched application

Use `createAdminClient` for the UPDATE only after all validations pass.

Response: `{ success: true }` or `{ error: string }` with appropriate HTTP status.

### Extend `PATCH /api/brokers/accounts`

Add `verificationInstructions` to the PATCH schema. See Section 6k.

---

## 12. UI/UX and Accessibility Requirements

### Student Shell layout
- Sidebar width: 240px on desktop
- Mobile: collapsible drawer, `position: fixed`, full height, z-index above content
- Active link: highlighted with academy brand colour (use CSS variable — do not hard-code colour)
- Logo: 32px height, object-fit: contain
- All interactive elements: minimum 44x44px touch target
- Keyboard accessible: sidebar links reachable by Tab, mobile menu togglable by keyboard

### Content Gate
- Gate card: max-width 400px, centred both axes
- Background: blurred page content (`filter: blur(4px)`)
- Gate card must not be blurred — use z-index stacking
- Link colour: accessible contrast ratio ≥ 4.5:1

### Dashboard cards
- Each stat card: consistent height, min-width 140px
- `NextLiveClassCard`: countdown must update in real time — this is a client component. Use `useEffect` + `setInterval` for the countdown. Clean up the interval on unmount.
- All date/time displays: use the student's local timezone (`Intl.DateTimeFormat`)

### Empty states
Every card and list must handle empty data gracefully:
- No courses enrolled: "No courses enrolled yet. Your courses will appear here once access is granted."
- No live classes: "No upcoming live classes scheduled."
- No announcements: "No announcements yet."
- No groups: "No groups found."

### Responsive
- Test at 375px (mobile), 768px (tablet), 1280px (desktop)
- Sidebar collapses to drawer on mobile
- Cards stack vertically on mobile

---

## 13. Storage and Audit Requirements

### Storage
- Use existing `verification-proofs` bucket for resubmission screenshots
- New path: `{traderId}/{studentUserId}/resubmission/verification.{ext}`
- Update `docs/STORAGE.md` to document this new path pattern and its purpose
- Screenshot upload is student-initiated from the portal. It is NOT a registration upload. Document the distinction.

### Audit logging
- When a student uploads a resubmission screenshot and calls `PATCH /api/student/verification-screenshot`, create an audit log entry consistent with the pattern in `docs/AUDIT_LOGGING.md`
- When a mentor updates `verification_instructions` via `PATCH /api/brokers/accounts`, create an audit log entry (if the existing PATCH logs changes, extend it; if not, establish the pattern)
- Never log the screenshot content or file URL in audit logs — log the action and actor only

---

## 14. Documentation Requirements

Engineering must update the following documents as part of this delivery. Incomplete documentation is a rejection criterion.

- `docs/STUDENTS.md`: Add Student Portal section describing the new shell, dashboard components, content gate pattern, and verification screenshot resubmission flow. Fix the `manual_review` = "needs more information" mapping. Document that `needs_more_information` is NOT a DB enum value — `manual_review` is the correct DB status for this state.
- `docs/STORAGE.md`: Document the new `verification-proofs` sub-path for portal resubmission (`{trader_id}/{student_user_id}/resubmission/`).
- `docs/BROKER_INTEGRATIONS.md`: Document `verification_instructions` field — what it is, how mentors set it, how students see it.
- `docs/DATABASE.md`: Document the new columns `trader_broker_accounts.verification_instructions` and `student_applications.verification_screenshot_path`.
- `CHANGELOG.md`: Full entry for EP-014, listing all changed files, new components, migration, and behaviour changes.
- `PRODUCT_STATUS.md`: Update Student Portal status from incomplete to complete once all acceptance criteria pass.

---

## 15. Testing and Regression Requirements

### TypeScript and build
```bash
npm run typecheck
npm run build
```
Both must pass with zero errors before delivery.

### Unit and integration tests
- Run existing test suite: `npm run test` — zero regressions
- Add tests for `PATCH /api/student/verification-screenshot`:
  - Rejects unauthenticated requests
  - Rejects if no application exists for student + portalId
  - Rejects if application status is NOT `manual_review`
  - Rejects if `storagePath` does not match the required path pattern
  - Accepts valid request and updates `verification_screenshot_path`
- Add tests for extended `PATCH /api/brokers/accounts`:
  - Accepts `verificationInstructions` update scoped to trader
  - Rejects update for another trader's account
  - Existing `isActive` toggle tests must still pass

### Role access testing
Use KaiTrades as the ONLY test academy. Never use Traders Confidence or Milkers FX as test fixtures.

| Role | Expected access |
|------|----------------|
| Super admin (`kaisynctech@gmail.com`) | Not a student — accessing `/student` redirects to role destination |
| KaiTrades mentor (trader) | Not a student — `/student` redirects appropriately |
| KaiTrades student (verified) | Sees full dashboard, all pages unlocked, no content gate |
| KaiTrades student (pending) | Sees dashboard with status card, broker guide; Courses/Messages/Live Classes/Groups show ContentGate |
| KaiTrades student (`manual_review`) | Sees "More information needed" message, screenshot upload if method = screenshot_upload |
| KaiTrades student (rejected) | Sees rejection message, no portal access |

### Regression checks
- Academy Entry Pages (join + login) must not be affected by this PR
- Mentor dashboard (`/dashboard`) must not be affected
- Existing courses page for verified students must work exactly as before — same signed URLs, same progress tracking, same lesson player navigation
- Messages page for verified students must work exactly as before
- Broker accounts creation (existing POST) must still work

### Browser acceptance (required before marking complete)
Capture screenshots (desktop 1280px and mobile 375px) of:
1. Verified KaiTrades student — full dashboard with all cards populated
2. Unverified KaiTrades student — ContentGate on Courses page
3. `manual_review` KaiTrades student — "More information needed" state with screenshot upload component
4. Mentor broker accounts manager — `verificationInstructions` textarea and edit capability for existing accounts

---

## 16. Acceptance Criteria

All of the following must be true for EP-014 to be accepted:

- [ ] Migration `202606240028` deployed to production with zero errors
- [ ] `trader_broker_accounts.verification_instructions` column exists
- [ ] `student_applications.verification_screenshot_path` column exists
- [ ] `StudentShell` renders with sidebar on desktop, collapsible drawer on mobile
- [ ] All student portal links use `basePath` + `querySuffix` — no hard-coded `/student/...` links in the shell
- [ ] `app/student/page.tsx` replaced with full dashboard — `StudentShell` wrapping all content
- [ ] `manual_review` status displays "More information is needed" — NEVER "Your academy access is being reviewed"
- [ ] Verified student dashboard shows: stat cards, continue learning, course progress, next live class, announcements
- [ ] `BrokerGuideCard` shows `verification_instructions` when set by mentor
- [ ] `VerificationScreenshotUpload` appears for `manual_review` + `screenshot_upload` students
- [ ] Screenshot upload stores to `verification-proofs/{traderId}/{studentUserId}/resubmission/`
- [ ] `PATCH /api/student/verification-screenshot` validates ownership and status before updating
- [ ] `ContentGate` renders on Courses, Messages, Live Classes, and Groups for unverified students — no redirect
- [ ] Verified students see full Courses, Messages, Live Classes, Groups — no gate
- [ ] `app/student/live-classes/page.tsx` exists and shows in sidebar
- [ ] `app/student/groups/page.tsx` exists and shows in sidebar
- [ ] `broker-accounts-manager.tsx` has `verificationInstructions` textarea on the add form
- [ ] Existing mentor broker accounts can be edited inline (verificationInstructions, partnerCode, affiliateLink)
- [ ] `partner_code` is NOT returned to the student client under any code path
- [ ] All empty states handled — no blank/null renders
- [ ] `npm run typecheck` passes — zero errors
- [ ] `npm run build` passes — zero errors
- [ ] All existing tests pass — zero regressions
- [ ] Browser acceptance screenshots provided (desktop + mobile, all 4 scenarios)
- [ ] `docs/STUDENTS.md` updated — `manual_review` mapping documented, portal shell documented
- [ ] `docs/STORAGE.md` updated — resubmission path documented
- [ ] `docs/DATABASE.md` updated — new columns documented
- [ ] `docs/BROKER_INTEGRATIONS.md` updated — `verification_instructions` documented
- [ ] `CHANGELOG.md` updated
- [ ] `PRODUCT_STATUS.md` updated

---

## 17. Final Delivery Summary Required from Engineering

Upon completion, Engineering must provide:

1. **Migration confirmation**: Confirm migration `028` was applied to production. Paste the result of `SELECT column_name FROM information_schema.columns WHERE table_name IN ('trader_broker_accounts', 'student_applications') AND column_name IN ('verification_instructions', 'verification_screenshot_path')`.

2. **Changed files list**: Every file created, modified, or deleted. Group by: migrations, API routes, components, pages, CSS modules, tests, documentation.

3. **TypeScript output**: Paste the final `npm run typecheck` result (must show zero errors).

4. **Build output**: Paste the final `npm run build` result (must show successful completion).

5. **Test output**: Paste `npm run test` result showing all tests passing.

6. **RLS confirmation**: For each new RLS policy added — paste the policy name, table, and the SQL definition.

7. **Storage policy confirmation**: Paste the updated storage policies on `verification-proofs` covering the resubmission path.

8. **Bug fix confirmation**: Confirm that `manual_review` status now displays "More information needed" in the student portal, not "Your academy access is being reviewed." Include a screenshot of the state.

9. **Browser acceptance screenshots**: All 4 scenarios, desktop and mobile (8 screenshots total).

10. **Security review statement**: Confirm that `partner_code` is not returned to the student client in any code path. State which code was reviewed.

11. **Documentation sign-off**: Confirm that all 6 documentation files listed in Section 14 have been updated.

---

*End of EP-014 — Student Portal Redesign*
