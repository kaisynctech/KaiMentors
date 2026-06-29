# EP-037 — Mentor Course Preview Mode

**Status:** Ready for Engineering  
**Architect:** KaiMentors Enterprise Architect  
**Date:** 2026-06-29  
**Scope:** Two new pages + one component prop addition  
**Migration required:** No  
**API changes:** No  
**Package install required:** No

---

## Objective

Let a mentor preview exactly what a student sees — the course curriculum page and any lesson — without needing a student account and without writing progress data. A sticky "Preview mode" banner distinguishes preview from the real student experience.

---

## Overview

Two new mentor-auth-gated pages mirror the student routes:

| Mentor preview route | Student equivalent |
|---|---|
| `/dashboard/courses/[courseId]/preview` | `/student/courses/[courseId]` |
| `/dashboard/courses/[courseId]/preview/lessons/[lessonId]` | `/student/courses/[courseId]/lessons/[lessonId]` |

Both pages authenticate via `requireMentorCourseContext()` (not the student application check). No `lesson_progress` records are written.

---

## Page 1: Preview Curriculum

**File:** `app/dashboard/courses/[courseId]/preview/page.tsx` (new file)

**Logic:**
1. Call `requireMentorCourseContext()`. If not ok, redirect to `/login`.
2. Fetch course, modules, and lessons scoped by `trader_id` — same queries as the student curriculum page **except**:
   - Remove `.eq("status", "published")` filters — show ALL statuses so the mentor can see the full picture, including drafts.
   - Do NOT fetch `lesson_progress` (no progress exists for this user as mentor).
   - Do NOT require a `student_applications` record.
3. 404 if the course doesn't belong to this `trader_id`.
4. Render the curriculum using the same HTML and CSS as `app/student/courses/[courseId]/page.tsx`, with these differences:
   - Add a `previewBanner` above the nav: `"Preview mode — this is what your students see (draft content is highlighted)"`
   - Draft modules and lessons get a visual `[Draft]` label appended to their title (e.g., `"Lesson Title [Draft]"`). Published items show normally.
   - Sequential gating is shown informatively (lock icon displayed) but all lessons are clickable — the mentor can navigate to any lesson regardless of gate state.
   - Progress bar shows 0% (no progress data).
   - Resume / in-progress state is absent.
   - Lesson links point to `/dashboard/courses/[courseId]/preview/lessons/[lessonId]` (not the student path).
   - Nav links: back arrow "← Back to course editor" linking to `/dashboard/courses/[courseId]`, and no "My learning" / "Messages" / "Sign out" student nav links.

---

## Page 2: Preview Lesson

**File:** `app/dashboard/courses/[courseId]/preview/lessons/[lessonId]/page.tsx` (new file)

**Logic:**
1. Call `requireMentorCourseContext()`. If not ok, redirect to `/login`.
2. Fetch lesson + blocks + resources scoped by `trader_id` — same queries as the student lesson page **except**:
   - Remove `.eq("status", "published")` filters on lesson, module, and course — allow viewing draft content.
   - Do NOT fetch or write `lesson_progress`.
   - Do NOT require a `student_applications` record.
3. 404 if the lesson doesn't belong to this `trader_id`.
4. Render using the same layout and CSS as `app/student/courses/[courseId]/lessons/[lessonId]/page.tsx` — reuse the existing `LessonSidebar` and `ProtectedLessonContent` components with these differences:
   - Add `previewBanner` at the top of the page (same style as curriculum preview).
   - Pass `previewMode={true}` to `ProtectedLessonContent` (see component change below).
   - `watermark` value: `"[Course title] · Preview"` — never a student email.
   - Sidebar lesson links point to `/dashboard/courses/[courseId]/preview/lessons/[lessonId]`.
   - Previous/Next lesson links also use the preview path.
   - Back link in the `BrandMark` points to `/dashboard/courses/[courseId]/preview`.

---

## Component change: `ProtectedLessonContent`

**File:** `components/protected-lesson-content.tsx`

Add an optional `previewMode?: boolean` prop (default `false`).

In the `progress()` function (line 43), gate the fetch call:
```typescript
async function progress(position: number, isCompleted = false) {
  if (previewMode) return; // no progress in preview
  // ... existing fetch to /api/course-progress
}
```

This is the only change needed — all other rendering stays the same. The "Mark lesson complete" button can still be visible (it just won't persist anything).

---

## Preview banner component

Create a small shared component (or inline the HTML) for the preview banner — it will be used in both preview pages:

**File:** `components/preview-banner.tsx` (new file)

```tsx
import { Eye } from "lucide-react";
import styles from "./preview-banner.module.css";

export function PreviewBanner() {
  return (
    <div className={styles.banner} role="status">
      <Eye size={14} />
      Preview mode — students only see published content. Draft items are labelled below.
    </div>
  );
}
```

**File:** `components/preview-banner.module.css`

```css
.banner {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: #fef3c7;
  color: #92400e;
  font-size: 13px;
  font-weight: 500;
  border-bottom: 1px solid #fde68a;
}
```

---

## Entry point: Preview button in the course editor

**File:** `components/course-detail-manager.tsx`

Add a "Preview" link button in the course editor tab bar, visually distinct from the tabs (right-aligned, rendered as a `<Link>` not a `<button>`).

In the `<nav className={styles.tabs}>` block, after the last tab button and before the closing `</nav>`:

```tsx
import Link from "next/link";
import { Eye } from "lucide-react";

// Inside the tabs nav:
<Link
  className={styles.previewLink}
  href={`/dashboard/courses/${course.id}/preview`}
  target="_blank"
  rel="noopener noreferrer"
>
  <Eye size={13} /> Preview
</Link>
```

Opening in a new tab (`target="_blank"`) lets the mentor keep the editor open while browsing the preview.

**CSS addition** in `components/course-detail-manager.module.css`:

```css
.previewLink {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 500;
  color: var(--muted-foreground, #6b7280);
  text-decoration: none;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--border, #e5e7eb);
  transition: background 0.12s;
  white-space: nowrap;
}

.previewLink:hover {
  background: var(--accent, #f3f4f6);
  color: var(--foreground, #111);
}
```

---

## Acceptance criteria

Test against KaiTrades only.

1. From any course in the editor, click "Preview" — it opens in a new tab at `/dashboard/courses/[courseId]/preview`
2. The yellow "Preview mode" banner is visible at the top of the curriculum page
3. Published modules and lessons show normally; draft ones show a `[Draft]` label
4. All lessons are clickable regardless of module gating (no "Complete the previous module" locked state)
5. Progress bar shows 0%
6. Clicking a lesson opens `/dashboard/courses/[courseId]/preview/lessons/[lessonId]` with the preview banner
7. Watching a video or clicking "Mark lesson complete" does NOT create a `lesson_progress` record (verify in Supabase: no new rows appear)
8. The watermark reads "[Course title] · Preview" — not a student email
9. Previous/Next navigation in the lesson preview stays on preview paths
10. Unauthenticated users (or students without `trader_members`) cannot access the preview routes — they receive a redirect to `/login`
