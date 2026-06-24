# Architect Handoff — Student Portal Redesign
**Status:** Ready for Architect Review  
**Date:** 2026-06-24  
**Product Owner:** KaiMentors Product Owner  

---

## Objective

Redesign the student-facing portal experience. The current student portal (`/student/page.tsx`) is a single centred status card with no navigation and no actionable content. Students are left waiting with no guidance and no sense of the platform.

The redesign gives students a full sidebar-navigation dashboard that matches the mentor dashboard's design language. Verified students get a rich, personalised dashboard. Unverified students see the same layout with a broker verification guide in place of content — and a content gate when they navigate to locked sections.

---

## Design Reference

Approved mockups were produced and confirmed by the Product Owner. The following describes the approved design precisely.

---

## What Already Exists in the Database

The Architect should note that the following tables and columns already exist and must be used — no new tables needed except where noted:

| Data needed | Source |
|---|---|
| Student's trading level | `student_applications.trading_level` |
| Student's application status | `student_applications.status`, `status_reason` |
| Broker name | `brokers.name` |
| Broker logo | `brokers.logo_path` |
| Mentor's partner/affiliate code | `trader_broker_accounts.partner_code` |
| Mentor's affiliate link | `trader_broker_accounts.affiliate_link` |
| Lesson progress per student | `lesson_progress` (has `is_completed`, `is_started`, `position_seconds`, `course_id`, `lesson_id`) |
| Next live class | `live_classes` (has `title`, `starts_at`, `status`, `join_url`, `access_scope`) |
| Mentor announcements | `announcements` (has `title`, `body`, `published_at`, `is_pinned`, `access_scope`) |
| Total courses for academy | `courses` table filtered by `trader_id` |
| Groups joined | existing groups/membership tables |

**One new column is required** — see DB Changes section.

---

## Scope of Changes

### 1. Student portal layout — sidebar navigation

Replace the current full-page centred card layout with a sidebar + main area shell identical in structure to the mentor `DashboardShell` component, but scoped to student navigation.

**Sidebar items:**
- Dashboard (home)
- Courses
- Live classes
- Messages
- Groups
- My profile

**Sidebar footer (unverified):** Amber warning badge — "Verification pending. Complete broker setup to unlock all content."  
**Sidebar footer (verified):** Green badge — verified student indicator with shield icon.

**Sidebar always shows:** Academy logo + name at the top, Sign out at the bottom.

A new `StudentShell` component (equivalent of `DashboardShell` for students) should be created. It accepts `academyName`, `logoPath`, `isVerified`, `activePath`, and renders the sidebar + main area slot.

---

### 2. Unverified student dashboard (`status !== 'verified'`)

**Page header:** Academy name and logo only. No welcome message or trading level badge.

**Two-column layout:**

**Left column:**

*Broker guide card:*
- Broker logo (from `brokers.logo_path`) + broker name
- Label: "Your partner code" → display `trader_broker_accounts.partner_code` as a code pill
- "How to get verified" — numbered step list from `trader_broker_accounts.verification_instructions` (see DB Changes). If `verification_instructions` is null, show default 3-step fallback copy:
  1. Open a [BrokerName] account using the partner code above.
  2. Complete your ID and proof of address verification.
  3. Return here — access activates automatically, or upload a screenshot below.
- CTA button: "Open account with [BrokerName] →" linking to `trader_broker_accounts.affiliate_link` (opens in new tab). Only shown if `affiliate_link` is not null.

*Screenshot upload card (below broker guide card):*
- Heading: "Already have an account?"
- Body: "Upload a screenshot of your [BrokerName] account dashboard for manual review."
- File upload area (drag and drop + click). Accepts PNG, JPG, PDF up to 10MB.
- On submit: uploads file to Supabase Storage under `student-uploads/{trader_id}/{student_user_id}/verification/` and records the upload on the student's application record (see DB Changes — `verification_screenshot_path` column on `student_applications`). Triggers a status update to `manual_review` if current status is `pending`.

**Right column:**

*Application status timeline card:*
- Three rows: Application submitted (always complete) / Broker verification (current status) / Portal access (locked until verified)
- If status is `needs_more_information`: show the `status_reason` text from the mentor in an amber note above the timeline.

---

### 3. Verified student dashboard (`status === 'verified'`)

**Page header:** "Welcome back, [student first name]" + trading level badge (from `student_applications.trading_level`) + "Member since [date formatted as Month Year]"

**Stats row (4 cards):**
1. Lessons completed — count of `lesson_progress` rows where `is_completed = true` for this student + trader
2. Courses enrolled — count of distinct `course_id` values in `lesson_progress` for this student + trader  
3. Total courses — count of published courses for this academy (`courses` where `trader_id = x` and `status = 'published'`)
4. Groups joined — count of group memberships for this student in this academy

**Left column:**

*Continue learning card:*
- Find the most recently active lesson: query `lesson_progress` for this student + trader, order by `last_activity_at` descending, limit 1, join to `lessons` and `courses`.
- Show: course thumbnail (if exists) or placeholder icon, course name, lesson name, "Lesson X of Y", progress bar (lessons completed in this course / total lessons in this course).
- CTA: "Resume lesson" button linking to `/student/courses/[courseId]/lessons/[lessonId]`.
- If no lesson progress exists yet: show "Start your first lesson" state with a link to `/student/courses`.

*Your courses card:*
- List all courses for this academy that have at least one lesson.
- For each course: thumbnail/icon, course name, progress bar (completed lessons / total lessons), "X of Y lessons" label.
- If no courses published: show an empty state.

**Right column:**

*Next live class card:*
- Query `live_classes` for this trader where `starts_at > now()` and `status = 'published'`, order by `starts_at` ascending, limit 1.
- Show: class title, formatted date + time, countdown (days / hours / minutes) calculated from `starts_at`.
- Badge: "Today", "Tomorrow", or day name depending on how soon.
- If no upcoming class: show "No upcoming sessions scheduled."

*From your mentor card:*
- Query `announcements` for this trader where `status = 'published'`, order by `published_at` descending, limit 3.
- Show each as a row: green dot for newest, grey dot for older, title, relative time (e.g. "2 hours ago").
- If no announcements: show "No announcements yet."

---

### 4. Content gate for unverified students on locked pages

Pages: Courses, Live classes, Messages, Groups.

For unverified students navigating to any of these pages:
- Render the page normally but with the content area replaced by a gate component.
- The gate shows: a faded/greyed preview of the content beneath it (courses as blurred cards at 35% opacity, no interaction), overlaid with a centred gate card.
- Gate card contains: lock icon, "Content is locked until you're verified", one-line explanation referencing their broker, "Back to dashboard" button.
- The gate must NOT be implemented as a redirect — the student stays on the page URL. It is a UI state only.

---

### 5. Mentor broker account configuration — new fields surfaced

The mentor's broker accounts page (`/dashboard/brokers`) must expose the following fields for editing on each `trader_broker_accounts` record:

- **Partner code** (`partner_code`) — text input, label "Partner / affiliate code"
- **Affiliate link** (`affiliate_link`) — URL input, label "Affiliate sign-up link"  
- **Verification instructions** (`verification_instructions`) — textarea, label "Verification steps for students", placeholder "Describe the steps a new student should follow to open and verify their broker account…", max 1000 characters

These fields are shown to students verbatim in the unverified dashboard broker guide card.

---

## Database Changes

### Migration required

**1. `trader_broker_accounts` — add `verification_instructions`**

```sql
ALTER TABLE public.trader_broker_accounts
  ADD COLUMN verification_instructions text
    CHECK (char_length(verification_instructions) <= 1000)
    DEFAULT NULL;
```

Nullable. If null, the student portal renders default fallback steps. No backfill required.

**2. `student_applications` — add `verification_screenshot_path`**

```sql
ALTER TABLE public.student_applications
  ADD COLUMN verification_screenshot_path text
    DEFAULT NULL;
```

Stores the Storage path of a post-application screenshot upload. Nullable. Separate from the signup-time `screenshot_proof` field (which already exists from the 4-step form). This is a portal-side upload only.

---

## RLS & Security

- Students may only read `trader_broker_accounts` fields (`partner_code`, `affiliate_link`, `verification_instructions`) for the specific trader they applied to. No cross-tenant access.
- Students may only read and write `lesson_progress` rows where `student_user_id = auth.uid()` and `trader_id` matches their verified academy.
- Students may only read `live_classes` and `announcements` for their academy, filtered by `access_scope` (respect any group-scoped content).
- The `verification_screenshot_path` write on `student_applications` must be restricted to the student who owns the row (`student_user_id = auth.uid()`).
- Storage bucket for `student-uploads/` must enforce: authenticated uploads only, path must begin with `{trader_id}/{auth.uid()}/`.

---

## Multi-Tenancy

- All queries in the student portal must include `trader_id` scoped to the student's academy. No query may return data across academy boundaries.
- `StudentShell` receives `traderId` as a prop from the server component — never derived client-side.

---

## Components

New components required:
- `StudentShell` — sidebar + main area wrapper (mirrors `DashboardShell`)
- `BrokerGuideCard` — displays broker logo, partner code, steps, affiliate link button
- `VerificationScreenshotUpload` — file upload with Storage integration
- `ContentGate` — lock overlay for unverified students on locked pages
- `StudentStatCard` — stat number + label (reusable, 4 instances in stats row)
- `ContinueLearningCard` — last-lesson resume widget
- `CourseProgressList` — all courses with progress bars
- `NextLiveClassCard` — countdown timer widget
- `MentorAnnouncementsCard` — recent announcements list

---

## Pages Modified

- `app/student/page.tsx` — full rewrite to new dashboard (verified + unverified states)
- `app/student/courses/page.tsx` — add content gate for unverified students
- `app/student/messages/page.tsx` — add content gate for unverified students
- New: `app/student/live-classes/page.tsx` — live classes list with gate
- New: `app/student/groups/page.tsx` — groups list with gate

---

## What Is NOT Changing

- The 4-step `StudentRegistrationForm` — unchanged
- The `/account-setup` flow — unchanged
- The join and login page layouts (just redesigned in previous work)
- The mentor-side student verification workflow — unchanged
- Broker API auto-verification — future feature, not in this scope

---

## Acceptance Criteria

1. A KaiTrades test student in `pending` status sees the sidebar navigation and the broker guide with partner code, steps, affiliate link button, and screenshot upload.
2. A KaiTrades test student in `needs_more_information` status sees the mentor's `status_reason` displayed in the amber note above the timeline.
3. A KaiTrades test student in `pending` status navigating to Courses sees the content gate — blurred course cards beneath a lock overlay with a "Back to dashboard" button.
4. A KaiTrades test student in `verified` status sees the full dashboard: stats row, continue learning, course progress, next live class, mentor announcements.
5. Stats row counts are accurate: lessons completed reflects `lesson_progress.is_completed`, total courses reflects published courses for that trader.
6. No student can see broker data, lesson progress, announcements, or live classes from another academy.
7. Screenshot upload stores the file in Storage and writes `verification_screenshot_path` on the student's application row.
8. Mentor can edit `partner_code`, `affiliate_link`, and `verification_instructions` on their broker account from `/dashboard/brokers`.
9. `npm run typecheck` and `npm run build` pass.
10. Existing acceptance runner passes without modification.

---

## Final Delivery Summary from Engineering

Engineering must confirm:
- Migration applied to production DB
- All new components created and rendering correctly
- RLS policies verified for new columns and storage paths
- Acceptance criteria 1–10 checked against KaiTrades test environment
- Commit hash and files changed
