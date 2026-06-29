# EP-029 — Lesson Player Sidebar Navigation

**Status:** Ready for Engineering  
**Architect:** KaiMentors Enterprise Architect  
**Date:** 2026-06-26  
**Scope:** 2 new files + 2 modified files  
**Migration required:** No  
**API changes:** No  
**Package install required:** No

---

## Objective

Redesign the lesson player page with a persistent sidebar showing the full course curriculum. Students can navigate between lessons without leaving the player, see completion state across all lessons, and collapse/expand modules. On mobile the sidebar is hidden and triggered via a floating "Curriculum" button that opens it as a drawer overlay.

Also fixes: the top navbar logo currently links to My Learning — in the lesson context it should link back to the course curriculum page.

---

## Pre-investigation

Read these files before starting:

- `app/student/courses/[courseId]/lessons/[lessonId]/page.tsx` — full lesson page
- `app/student/courses/[courseId]/lessons/[lessonId]/lesson.module.css` — current CSS

Confirm:
- The `curriculum` query at line ~58 selects `"id,module_id,sort_order,module:course_modules!inner(sort_order,status)"` — no `title` fields yet
- The `progress` query at line ~67 fetches only the current lesson via `.maybeSingle()`
- The page renders `<main className={styles.page}>` as a single column
- `BrandMark href` points to `${base}/courses${suffix}` (My Learning)

---

## Step 1 — New `LessonSidebar` component

### `components/lesson-sidebar.tsx` *(new file)*

```tsx
"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, List, X } from "lucide-react";
import Link from "next/link";
import styles from "./lesson-sidebar.module.css";

interface SidebarLesson {
  id: string;
  title: string;
  is_completed: boolean;
}

interface SidebarModule {
  id: string;
  title: string;
  lessons: SidebarLesson[];
}

interface LessonSidebarProps {
  courseTitle: string;
  courseId: string;
  currentLessonId: string;
  base: string;
  suffix: string;
  modules: SidebarModule[];
}

export function LessonSidebar({
  courseTitle,
  courseId,
  currentLessonId,
  base,
  suffix,
  modules,
}: LessonSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  // collapsed is a Set of module IDs — empty means all expanded
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggleModule(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const contents = (
    <div className={styles.inner}>
      <div className={styles.header}>
        <span className={styles.courseTitle}>{courseTitle}</span>
        <button
          aria-label="Close curriculum"
          className={styles.closeBtn}
          onClick={() => setIsOpen(false)}
        >
          <X size={16} />
        </button>
      </div>

      <div className={styles.moduleList}>
        {modules.map((mod) => {
          const isCollapsed = collapsed.has(mod.id);
          return (
            <div className={styles.moduleSection} key={mod.id}>
              <button
                aria-expanded={!isCollapsed}
                className={styles.moduleToggle}
                onClick={() => toggleModule(mod.id)}
              >
                <span className={styles.moduleToggleTitle}>{mod.title}</span>
                {isCollapsed ? (
                  <ChevronRight size={14} />
                ) : (
                  <ChevronDown size={14} />
                )}
              </button>

              {!isCollapsed && (
                <div className={styles.lessonList}>
                  {mod.lessons.map((lesson) => {
                    const isActive = lesson.id === currentLessonId;
                    return (
                      <Link
                        className={`${styles.lessonRow} ${isActive ? styles.lessonActive : ""} ${lesson.is_completed ? styles.lessonDone : ""}`}
                        href={`${base}/courses/${courseId}/lessons/${lesson.id}${suffix}`}
                        key={lesson.id}
                        onClick={() => setIsOpen(false)}
                      >
                        <span className={styles.lessonIcon}>
                          {lesson.is_completed ? (
                            <CheckCircle2 size={14} />
                          ) : (
                            <span className={styles.lessonDot} />
                          )}
                        </span>
                        <span className={styles.lessonTitle}>{lesson.title}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar — visible ≥900px */}
      <aside className={styles.sidebar}>{contents}</aside>

      {/* Mobile floating trigger */}
      <button
        aria-label="Open curriculum"
        className={styles.mobileToggle}
        onClick={() => setIsOpen(true)}
      >
        <List size={16} />
        Curriculum
      </button>

      {/* Mobile drawer */}
      {isOpen && (
        <div
          className={styles.drawerOverlay}
          onClick={() => setIsOpen(false)}
        >
          <aside
            className={styles.drawer}
            onClick={(e) => e.stopPropagation()}
          >
            {contents}
          </aside>
        </div>
      )}
    </>
  );
}
```

---

## Step 2 — New `LessonSidebar` CSS module

### `components/lesson-sidebar.module.css` *(new file)*

```css
/* ── Desktop sidebar ───────────────────────────────────── */
.sidebar {
  display: none;
  flex-direction: column;
  width: 272px;
  min-width: 272px;
  height: calc(100vh - 64px); /* 64px = top nav height */
  position: sticky;
  top: 64px;
  border-right: 1px solid #e9edef;
  background: #fff;
  overflow-y: auto;
}

@media (min-width: 900px) {
  .sidebar { display: flex; }
}

/* ── Shared inner layout ───────────────────────────────── */
.inner {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 18px 16px 14px;
  border-bottom: 1px solid #eef1f2;
}

.courseTitle {
  flex: 1;
  font-size: 12px;
  font-weight: 800;
  color: #111315;
  letter-spacing: -0.01em;
  line-height: 1.45;
}

.closeBtn {
  display: none; /* shown only in drawer via .drawer override */
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 7px;
  background: none;
  color: #6c747a;
  cursor: pointer;
}

.closeBtn:hover { background: #f0f2f3; color: #111315; }

.moduleList {
  flex: 1;
  padding: 8px 0;
  overflow-y: auto;
}

/* ── Module toggle ─────────────────────────────────────── */
.moduleSection { margin-bottom: 2px; }

.moduleToggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 9px 14px;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  font-size: 10px;
  font-weight: 800;
  color: #6c747a;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.moduleToggle:hover { background: #f8f9fa; }

.moduleToggleTitle {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Lesson rows ───────────────────────────────────────── */
.lessonList { display: flex; flex-direction: column; }

.lessonRow {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 14px 8px 18px;
  border-left: 2px solid transparent;
  color: #3b4248;
  font-size: 13px;
  text-decoration: none;
  transition: background 80ms;
}

.lessonRow:hover { background: #f8f9fa; }

.lessonActive {
  border-left-color: #111315;
  background: #f4f6f7;
  color: #111315;
  font-weight: 700;
}

.lessonDone { color: #176c42; }

.lessonIcon {
  display: flex;
  align-items: center;
  padding-top: 2px;
  flex-shrink: 0;
  color: inherit;
}

.lessonDot {
  display: block;
  width: 8px;
  height: 8px;
  border: 1.5px solid #b0bac0;
  border-radius: 50%;
  margin: 3px;
}

.lessonTitle { line-height: 1.5; }

/* ── Mobile floating trigger ───────────────────────────── */
.mobileToggle { display: none; }

@media (max-width: 899px) {
  .mobileToggle {
    display: flex;
    align-items: center;
    gap: 7px;
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
    height: 44px;
    padding: 0 20px;
    border: none;
    border-radius: 22px;
    background: #111315;
    color: #fff;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(17,19,21,0.25);
    white-space: nowrap;
  }
}

/* ── Mobile drawer ─────────────────────────────────────── */
.drawerOverlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(17,19,21,0.45);
}

.drawer {
  position: absolute;
  inset: 0 auto 0 0;
  width: 300px;
  background: #fff;
  overflow-y: auto;
  box-shadow: 4px 0 32px rgba(17,19,21,0.15);
}

.drawer .closeBtn { display: flex; }
```

---

## Step 3 — Update the lesson page

### `app/student/courses/[courseId]/lessons/[lessonId]/page.tsx`

**A — Update imports**

Remove `ArrowLeft` from the lucide import line (no longer needed — back link is removed).

Add `LessonSidebar` import:
```typescript
import { LessonSidebar } from "@/components/lesson-sidebar";
```

**B — Extend the curriculum query to include titles**

Find:
```typescript
    supabase
      .from("lessons")
      .select(
        "id,module_id,sort_order,module:course_modules!inner(sort_order,status)",
      )
      .eq("course_id", courseId)
      .eq("trader_id", app.trader_id)
      .eq("status", "published")
      .eq("module.status", "published"),
```

Replace with:
```typescript
    supabase
      .from("lessons")
      .select(
        "id,title,module_id,sort_order,module:course_modules!inner(id,title,sort_order,status)",
      )
      .eq("course_id", courseId)
      .eq("trader_id", app.trader_id)
      .eq("status", "published")
      .eq("module.status", "published"),
```

**C — Change progress query from single lesson to full course**

Find:
```typescript
    supabase
      .from("lesson_progress")
      .select("position_seconds,is_completed")
      .eq("lesson_id", lessonId)
      .eq("student_user_id", user.id)
      .maybeSingle(),
```

Replace with:
```typescript
    supabase
      .from("lesson_progress")
      .select("lesson_id,position_seconds,is_completed,is_started")
      .eq("course_id", courseId)
      .eq("student_user_id", user.id),
```

**D — Extract current lesson progress from the array**

The destructured variable name changes from `progress` to `allProgress`. Update the destructure:

Find:
```typescript
    { data: progress },
```

Replace with:
```typescript
    { data: allProgress },
```

Then, after `if (!lesson) notFound();` and after the gate check block, add:

```typescript
  const progress = (allProgress ?? []).find((p) => p.lesson_id === lessonId) ?? null;
```

(Place this line just before the `const ordered = ...` line.)

**E — Build sidebar modules structure**

Add this block directly after `const progress = ...` (from step D):

```typescript
  // Build sidebar modules from curriculum + progress
  const modulesMap = new Map<string, {
    id: string;
    title: string;
    sort_order: number;
    lessons: Array<{ id: string; title: string; is_completed: boolean }>;
  }>();

  for (const l of (curriculum ?? [])) {
    const m = Array.isArray(l.module) ? l.module[0] : l.module;
    if (!m?.id || !m?.title) continue;
    if (!modulesMap.has(m.id)) {
      modulesMap.set(m.id, {
        id: m.id,
        title: m.title,
        sort_order: m.sort_order ?? 0,
        lessons: [],
      });
    }
    const prog = (allProgress ?? []).find((p) => p.lesson_id === l.id);
    modulesMap.get(m.id)!.lessons.push({
      id: l.id,
      title: l.title ?? "",
      is_completed: prog?.is_completed ?? false,
    });
  }

  const sidebarModules = Array.from(modulesMap.values()).sort(
    (a, b) => a.sort_order - b.sort_order,
  );
```

**F — Update JSX structure**

Replace the entire `return (...)` block with:

```tsx
  return (
    <div className={styles.root}>
      <nav className={styles.topNav}>
        <BrandMark
          href={`${base}/courses/${courseId}${suffix}`}
          label={
            base === "/academy"
              ? (portal?.portal_name ?? "Academy")
              : "KaiMentors"
          }
        />
        <div className={styles.navActions}>
          <Link href="/auth/signout">Sign out</Link>
        </div>
      </nav>

      <div className={styles.layout}>
        <LessonSidebar
          base={base}
          courseId={courseId}
          courseTitle={course?.title ?? ""}
          currentLessonId={lessonId}
          modules={sidebarModules}
          suffix={suffix}
        />

        <main className={styles.main}>
          <div className={styles.lessonHeader}>
            <p className="eyebrow">
              {course?.title} · {lessonModule?.title}
            </p>
            <h1>{lesson.title}</h1>
            {lesson.description ? <p>{lesson.description}</p> : null}
          </div>

          <div className={styles.playerCard}>
            <ProtectedLessonContent
              blocks={blocks}
              completed={progress?.is_completed ?? false}
              lessonId={lesson.id}
              resumeSeconds={progress?.position_seconds ?? 0}
              watermark={`${portal?.portal_name ?? "Academy"} · ${app.full_name} · ${app.email}`}
            />
          </div>

          {progress?.is_completed ? (
            <div className={styles.completionNotice} role="status">
              <CheckCircle2 size={18} />
              You have completed this lesson.
            </div>
          ) : null}

          {prev || next ? (
            <nav aria-label="Lesson navigation" className={styles.lessonNav}>
              {prev ? (
                <Link
                  className={styles.prevBtn}
                  href={`${base}/courses/${courseId}/lessons/${prev.id}${suffix}`}
                >
                  <ArrowLeft size={13} />
                  Previous lesson
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link
                  className={styles.nextBtn}
                  href={`${base}/courses/${courseId}/lessons/${next.id}${suffix}`}
                >
                  Next lesson
                </Link>
              ) : null}
            </nav>
          ) : null}
        </main>
      </div>
    </div>
  );
```

Note: `ArrowLeft` is still used in the prev/next nav — keep it in the lucide import.

---

## Step 4 — Replace `lesson.module.css`

### `app/student/courses/[courseId]/lessons/[lessonId]/lesson.module.css`

Replace the entire file with:

```css
/* ── Shell ─────────────────────────────────────────────── */
.root {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #f4f6f7;
}

/* ── Top nav ───────────────────────────────────────────── */
.topNav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 64px;
  min-height: 64px;
  background: #fff;
  border-bottom: 1px solid #e9edef;
  position: sticky;
  top: 0;
  z-index: 50;
}

.navActions {
  display: flex;
  align-items: center;
  gap: 18px;
  font-size: 12px;
  font-weight: 750;
}

/* ── Two-column layout ─────────────────────────────────── */
.layout {
  display: flex;
  flex: 1;
  min-height: 0;
  align-items: flex-start;
}

.main {
  flex: 1;
  min-width: 0;
  padding: 32px 32px 80px;
}

@media (max-width: 899px) {
  .main {
    padding: 20px 16px 100px;
  }
}

/* ── Lesson header ─────────────────────────────────────── */
.lessonHeader {
  max-width: 860px;
  margin: 0 0 24px;
  padding: 28px 32px;
  border: 1px solid #dfe3e5;
  border-radius: 18px;
  background: #fff;
}

.lessonHeader .eyebrow {
  margin: 0 0 8px;
  color: #6c747a;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.lessonHeader h1 {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 500;
  letter-spacing: -0.03em;
  line-height: 1.3;
}

.lessonHeader p {
  margin: 0;
  color: #687078;
  font-size: 13px;
  line-height: 1.7;
}

/* ── Player card ───────────────────────────────────────── */
.playerCard {
  overflow: hidden;
  max-width: 860px;
  border: 1px solid #dfe3e5;
  border-radius: 22px;
  background: #fff;
  box-shadow: 0 20px 60px rgba(17,19,21,0.06);
}

/* ── Completion notice ─────────────────────────────────── */
.completionNotice {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 860px;
  margin: 16px 0 0;
  padding: 14px 18px;
  border: 1px solid #bbf7d0;
  border-radius: 12px;
  color: #176c42;
  background: #f0fdf4;
  font-size: 13px;
  font-weight: 700;
}

/* ── Prev / Next nav ───────────────────────────────────── */
.lessonNav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 860px;
  margin: 20px 0 0;
}

.prevBtn,
.nextBtn {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  gap: 8px;
  border: 1px solid #dfe3e5;
  border-radius: 12px;
  padding: 0 18px;
  font-size: 12px;
  font-weight: 800;
  text-decoration: none;
  transition: background 120ms ease;
}

.prevBtn { color: #111315; background: #fff; }
.prevBtn:hover { background: #f5f7f8; }

.nextBtn { color: #fff; background: #111315; margin-left: auto; }
.nextBtn:hover { background: #2a2f33; }
```

---

## Verification

1. `pnpm typecheck` — must exit 0. Watch for:
   - `m.id` / `m.title` — TypeScript may infer these as possibly undefined from the Supabase nested select; add null guards if needed (`m?.id`, `m?.title`)
   - `allProgress` shape change — `find()` is safe on arrays, but confirm `position_seconds` and `is_completed` are still present on the extracted `progress` object

2. `pnpm build` — must pass clean

3. Manual verification in KaiTrades (desktop):
   - Open a lesson → sidebar appears on the left with module name and lesson rows
   - Current lesson is highlighted with left border + bold text
   - Completed lessons show green checkmark
   - Click a module header → collapses, click again → expands
   - Click a different lesson in the sidebar → navigates to that lesson, sidebar updates active state
   - Logo click → goes to course curriculum page (not My Learning)
   - Prev/Next buttons at bottom still work

4. Manual verification (mobile — narrow the browser to <900px):
   - Sidebar is hidden
   - Floating "Curriculum" button appears at the bottom center
   - Tap it → drawer slides in from the left
   - Tap a lesson → drawer closes, lesson loads
   - Tap the overlay behind drawer → drawer closes

5. Regression:
   - Progress tracking still works (mark complete button, video 90% auto-complete)
   - Sequential gate check still redirects correctly on locked modules
