# EP-063 — Media Library → Courses Tab

**Date:** 2026-07-02
**Status:** Ready for implementation

---

## Objective

Remove **Media Library** from the main dashboard nav and surface it as a second tab on the `/dashboard/courses` page. The `/dashboard/media` route is preserved as a redirect so any existing bookmarks continue to work.

No schema changes. No new API routes. Pure UI restructuring.

---

## Scope

| File | Change |
|---|---|
| `components/dashboard-shell.tsx` | Remove Media Library nav item + `Library` import |
| `app/dashboard/courses/page.tsx` | Add `?tab` param, conditional data fetching, render tab nav |
| `app/dashboard/media/page.tsx` | Replace with redirect to `/dashboard/courses?tab=media` |
| `components/courses-tabs.tsx` | New — tab nav component (server-prop driven, no `useSearchParams`) |
| `components/courses-tabs.module.css` | New — tab styles |

---

## 1 — Remove Media Library from main nav

**File:** `components/dashboard-shell.tsx`

Remove the Media Library row from the nav items array:

```typescript
// DELETE this line:
["Media Library", "/dashboard/media", Library],
```

Remove `Library` from the lucide-react import since it is no longer used anywhere in this file:

```typescript
// Before:
import {
  ...
  Library,
  ...
} from "lucide-react";

// After: remove Library from the import list
```

---

## 2 — Tab nav component

**File:** `components/courses-tabs.tsx`

A plain client component. Receives `activeTab` as a prop from the server page — no `useSearchParams` needed, which avoids a `Suspense` boundary.

```typescript
"use client";

import Link from "next/link";
import styles from "./courses-tabs.module.css";

interface Props {
  activeTab: "courses" | "media";
}

export function CoursesTabs({ activeTab }: Props) {
  return (
    <div className={styles.tabs}>
      <Link
        href="/dashboard/courses"
        className={`${styles.tab} ${activeTab === "courses" ? styles.tabActive : ""}`}
      >
        Courses
      </Link>
      <Link
        href="/dashboard/courses?tab=media"
        className={`${styles.tab} ${activeTab === "media" ? styles.tabActive : ""}`}
      >
        Media Library
      </Link>
    </div>
  );
}
```

**File:** `components/courses-tabs.module.css`

Match the existing tab style used in `mentor-community.module.css` and `community-view.module.css` — same border-bottom pattern, same black active underline:

```css
.tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.75rem;
  border-bottom: 1px solid var(--border);
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 1.1rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  text-decoration: none;
  transition: color 0.15s, border-color 0.15s;
}

.tab:hover { color: var(--text-primary); }

.tabActive {
  color: var(--text-primary);
  border-bottom-color: #111314;
}
```

---

## 3 — Updated Courses page

**File:** `app/dashboard/courses/page.tsx`

The page reads `searchParams.tab` (defaults to `"courses"`). When `tab === "media"` it fetches the media library data instead of the course list data, keeping each fetch path lean.

Replace the entire file:

```typescript
import { redirect }             from "next/navigation";
import { CourseManager }        from "@/components/course-manager";
import { CourseMediaLibrary }   from "@/components/course-media-library";
import { CoursesTabs }          from "@/components/courses-tabs";
import { DashboardShell }       from "@/components/dashboard-shell";
import { getMentorWorkspace }   from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function CoursesPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const workspace = await getMentorWorkspace();
  if (!workspace) redirect("/login");
  const { supabase, traderId, displayName } = workspace;

  const tab = (await searchParams)?.tab === "media" ? "media" : "courses";

  // ── Media tab ────────────────────────────────────────────────────────────
  if (tab === "media") {
    const { data } = await supabase
      .from("course_media")
      .select(
        "id,title,media_type,mime_type,size_bytes,duration_seconds,processing_state,created_at,lesson_content_blocks(count),resources(count)",
      )
      .eq("trader_id", traderId)
      .order("created_at", { ascending: false });

    const media = (data ?? []).map((item) => ({
      ...item,
      usageCount:
        (Array.isArray(item.lesson_content_blocks)
          ? (item.lesson_content_blocks[0]?.count ?? 0)
          : 0) +
        (Array.isArray(item.resources) ? (item.resources[0]?.count ?? 0) : 0),
    }));

    return (
      <DashboardShell
        activePath="/dashboard/courses"
        description="Create, publish, and organize video learning experiences."
        title="Courses"
        userLabel={displayName}
        traderId={traderId}
      >
        <CoursesTabs activeTab="media" />
        <CourseMediaLibrary media={media} />
      </DashboardShell>
    );
  }

  // ── Courses tab (default) ─────────────────────────────────────────────────
  const [{ data: courseData }, { data: progressData }] = await Promise.all([
    supabase
      .from("courses")
      .select(
        "id,title,description,status,sort_order,cover_path,course_modules(count),lessons(id,status)",
      )
      .eq("trader_id", traderId)
      .order("sort_order")
      .order("created_at", { ascending: false }),
    supabase
      .from("lesson_progress")
      .select("course_id,student_user_id")
      .eq("trader_id", traderId),
  ]);

  const allProgress = progressData ?? [];

  const courses = await Promise.all(
    (courseData ?? []).map(async (course) => {
      let thumbnailUrl: string | null = null;
      if (course.cover_path) {
        const { data: signed } = await supabase.storage
          .from("course-content")
          .createSignedUrl(course.cover_path, 3600);
        thumbnailUrl = signed?.signedUrl ?? null;
      }
      const moduleCount = Array.isArray(course.course_modules)
        ? (course.course_modules[0]?.count ?? 0)
        : 0;
      const lessonRows       = Array.isArray(course.lessons) ? course.lessons : [];
      const lessonCount      = lessonRows.length;
      const publishedLessonCount = lessonRows.filter((l) => l.status === "published").length;
      const courseProgress   = allProgress.filter((p) => p.course_id === course.id);
      const activeLearnerCount = new Set(courseProgress.map((p) => p.student_user_id)).size;
      return {
        id: course.id,
        title: course.title,
        description: course.description,
        status: course.status as "draft" | "published" | "archived",
        sort_order: course.sort_order,
        thumbnailUrl,
        lessonCount,
        publishedLessonCount,
        moduleCount,
        activeLearnerCount,
      };
    }),
  );

  const totalLessons    = courses.reduce((sum, c) => sum + c.lessonCount, 0);
  const activeLearners  = new Set(allProgress.map((p) => p.student_user_id)).size;
  const stats = {
    totalCourses:  courses.length,
    published:     courses.filter((c) => c.status === "published").length,
    totalLessons,
    activeLearners,
  };

  return (
    <DashboardShell
      activePath="/dashboard/courses"
      description="Create, publish, and organize video learning experiences."
      title="Courses"
      userLabel={displayName}
      traderId={traderId}
    >
      <CoursesTabs activeTab="courses" />
      <CourseManager courses={courses} stats={stats} />
    </DashboardShell>
  );
}
```

---

## 4 — Redirect old Media Library route

**File:** `app/dashboard/media/page.tsx`

Replace the entire file:

```typescript
import { redirect } from "next/navigation";

export default function MediaLibraryRedirect() {
  redirect("/dashboard/courses?tab=media");
}
```

This preserves any bookmarks or direct links to `/dashboard/media` — they land on the correct tab automatically.

---

## 5 — Commit and deploy

No migration needed. Run:

```bash
git add -A
git commit -m "feat: EP-063 media library moved into courses tab, removed from main nav"
git push origin main && vercel --prod
```

---

## 6 — Acceptance Criteria

- [ ] "Media Library" no longer appears in the dashboard sidebar nav
- [ ] `/dashboard/courses` shows two tabs: "Courses" (default) and "Media Library"
- [ ] Clicking "Media Library" tab navigates to `/dashboard/courses?tab=media` and renders the existing media upload/list UI
- [ ] Clicking "Courses" tab (or navigating to `/dashboard/courses` with no param) renders the existing course grid
- [ ] Active tab has a black underline; inactive tab is muted — matches community/resource tab style
- [ ] Navigating directly to `/dashboard/media` redirects to `/dashboard/courses?tab=media`
- [ ] TypeScript compiles clean — no unused `Library` import error
