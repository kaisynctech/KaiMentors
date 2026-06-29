# EP-027 — Module Sequential Gating

**Status:** Ready for Engineering  
**Architect:** KaiMentors Enterprise Architect  
**Date:** 2026-06-26  
**Scope:** 1 migration + 1 new file + 7 modified files  
**Migration required:** Yes — `requires_previous_completion` column on `course_modules`  
**API changes:** New `PATCH /api/courses/[courseId]/modules/[moduleId]`

---

## Objective

Allow mentors to optionally enforce sequential module completion: when enabled on a module, students must complete all required lessons in the previous module before that module unlocks. This is a per-module toggle — modules default to open access. The feature surfaces in two places: a lock icon button in the mentor Curriculum tab, and a locked state in the student curriculum view. The lesson player also enforces the gate server-side to prevent direct URL access.

---

## Pre-investigation

Read these files before starting:

- `app/api/courses/[courseId]/curriculum/route.ts` — understand the existing curriculum PATCH (uses `reorder_course_curriculum` RPC; we are NOT modifying this file)
- `app/dashboard/courses/[courseId]/page.tsx` — find the `course_modules` select query (line ~50)
- `components/course-detail-manager.tsx` — find `Module` type definition and `CurriculumTab` JSX
- `components/course-tabs/curriculum-tab.tsx` — find `Module` interface and `modules.map()` (line ~167)
- `app/student/courses/[courseId]/page.tsx` — find the modules query and module render loop
- `app/student/courses/[courseId]/lessons/[lessonId]/page.tsx` — find the lesson query's module select (line ~47)
- `components/course-detail-manager.module.css` — check for existing `.gateBtn` class (likely absent)

Confirm:
- `course_modules` query in the dashboard page selects: `id,title,description,status,sort_order,is_required` — does NOT yet include `requires_previous_completion`
- `Module` interface in `curriculum-tab.tsx` does NOT yet have `requires_previous_completion`
- Student curriculum `modules` query selects: `id,title,description,sort_order,is_required` — does NOT yet include `requires_previous_completion`
- Lesson player module select is `module:course_modules!inner(title,status)` — does NOT include `sort_order` or `requires_previous_completion`

---

## Step 1 — Migration

### New file: `supabase/migrations/[next-timestamp]_module_sequential_gating.sql`

Use the next sequential migration timestamp following the project's naming convention (format: `YYYYMMDDnnnn`).

```sql
-- EP-027: Optional sequential module gating
alter table public.course_modules
  add column requires_previous_completion boolean not null default false;

comment on column public.course_modules.requires_previous_completion is
  'When true, students must complete all required lessons in the preceding published module before accessing this one.';
```

No RLS changes needed. The column is writable by mentors via the existing trader membership check on the new API endpoint.

Apply via `supabase migration up` (local) or `supabase db push` for the remote project.

---

## Step 2 — New API endpoint

### `app/api/courses/[courseId]/modules/[moduleId]/route.ts` *(new file)*

This endpoint is intentionally minimal — it handles only the `requiresPreviousCompletion` setting for now. Future module editing (title, description) can be added here later.

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMentorCourseContext } from "@/lib/course-access";

const schema = z.object({
  requiresPreviousCompletion: z.boolean(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ courseId: string; moduleId: string }> },
) {
  const { courseId, moduleId } = await params;
  const context = await requireMentorCourseContext();
  if (!context.ok)
    return NextResponse.json({ error: context.error }, { status: context.status });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid module update." }, { status: 400 });

  const { error } = await context.supabase
    .from("course_modules")
    .update({ requires_previous_completion: parsed.data.requiresPreviousCompletion })
    .eq("id", moduleId)
    .eq("course_id", courseId)
    .eq("trader_id", context.traderId);

  if (error)
    return NextResponse.json({ error: "Module could not be updated." }, { status: 400 });

  return NextResponse.json({ status: "updated" });
}
```

---

## Step 3 — Mentor dashboard page

### `app/dashboard/courses/[courseId]/page.tsx`

**One change only** — add `requires_previous_completion` to the `course_modules` select:

**Before:**
```typescript
supabase
  .from("course_modules")
  .select("id,title,description,status,sort_order,is_required")
  .eq("course_id", courseId)
  .eq("trader_id", tid)
  .order("sort_order")
  .order("created_at"),
```

**After:**
```typescript
supabase
  .from("course_modules")
  .select("id,title,description,status,sort_order,is_required,requires_previous_completion")
  .eq("course_id", courseId)
  .eq("trader_id", tid)
  .order("sort_order")
  .order("created_at"),
```

---

## Step 4 — `CourseDetailManager`

### `components/course-detail-manager.tsx`

**Three changes:**

**A — Extend the `Module` type:**

```typescript
type Module = {
  id: string;
  title: string;
  description: string | null;
  status: Status;
  sort_order: number;
  is_required: boolean;
  requires_previous_completion: boolean; // ← ADD
  lessons: Lesson[];
};
```

**B — Add `updateModule` function** (after `createLessonWithBlocks`):

```typescript
async function updateModule(
  moduleId: string,
  updates: { requiresPreviousCompletion: boolean },
) {
  setBusy(true);
  setError("");
  setMessage("");
  const response = await fetch(`/api/courses/${course.id}/modules/${moduleId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  const payload = await response.json();
  setBusy(false);
  if (!response.ok) {
    setError(payload.error ?? "Module could not be updated.");
    return;
  }
  setMessage("Module updated.");
  router.refresh();
}
```

**C — Pass `updateModule` to `CurriculumTab`:**

```tsx
<CurriculumTab
  course={course}
  modules={modules}
  lessons={lessons}
  readyMedia={readyMedia}
  selectedLesson={selectedLesson}
  setSelectedLesson={setSelectedLesson}
  busy={busy}
  createModule={createModule}
  createLessonWithBlocks={createLessonWithBlocks}
  updateLessonWithBlocks={updateLessonWithBlocks}
  updateModule={updateModule}          {/* ← ADD */}
  patchCurriculum={patchCurriculum}
/>
```

---

## Step 5 — `CurriculumTab`

### `components/course-tabs/curriculum-tab.tsx`

**Six changes:**

**A — Add `Lock` to lucide-react imports:**

```typescript
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Lock,        // ← ADD
  Plus,
} from "lucide-react";
```

(`GripVertical` and `Layers3` were removed in EP-023 — confirm they are not in the current imports.)

**B — Extend `Module` interface:**

```typescript
interface Module {
  id: string;
  title: string;
  description: string | null;
  status: Status;
  sort_order: number;
  is_required: boolean;
  requires_previous_completion: boolean; // ← ADD
  lessons: Lesson[];
}
```

**C — Add `updateModule` to `Props`:**

```typescript
interface Props {
  course: { id: string; title: string };
  modules: Module[];
  lessons: Lesson[];
  readyMedia: Media[];
  selectedLesson: string | null;
  setSelectedLesson: (id: string | null) => void;
  busy: boolean;
  createModule: (fd: FormData) => Promise<void>;
  createLessonWithBlocks: (lesson: LessonWithBlocksInput) => Promise<void>;
  updateLessonWithBlocks: (lessonId: string, lesson: LessonWithBlocksInput) => Promise<void>;
  updateModule: (moduleId: string, updates: { requiresPreviousCompletion: boolean }) => Promise<void>; // ← ADD
  patchCurriculum: (payload: CurriculumPatch) => Promise<void>;
}
```

**D — Destructure `updateModule` in the function signature:**

```typescript
export function CurriculumTab({
  course, modules, lessons, readyMedia, selectedLesson, setSelectedLesson, busy,
  createModule, createLessonWithBlocks, updateLessonWithBlocks, updateModule, patchCurriculum,
}: Props) {
```

**E — Add `handleUpdateModule` helper:**

```typescript
async function handleUpdateModule(moduleId: string, requiresPreviousCompletion: boolean) {
  await updateModule(moduleId, { requiresPreviousCompletion });
}
```

**F — Update `modules.map()` to use an index and add the gate toggle:**

Change:
```tsx
{modules.map((module) => {
```

To:
```tsx
{modules.map((module, moduleIndex) => {
```

Inside the module row (`<div className={styles.moduleRow} ...>`), add the gate toggle **after** the status `<select>`:

```tsx
{moduleIndex > 0 && (
  <button
    className={`${styles.gateBtn} ${module.requires_previous_completion ? styles.gateBtnActive : ""}`}
    disabled={busy}
    onClick={(e) => {
      e.stopPropagation();
      handleUpdateModule(module.id, !module.requires_previous_completion);
    }}
    title={
      module.requires_previous_completion
        ? "Sequential gating ON — click to disable"
        : "Sequential gating OFF — click to enable"
    }
    type="button"
  >
    <Lock size={12} />
  </button>
)}
```

The gate toggle is hidden for `moduleIndex === 0` because the first module has no predecessor to complete.

---

## Step 6 — Mentor CSS additions

### `components/course-detail-manager.module.css`

Append:

```css
/* Module gate toggle */
.gateBtn {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 1px solid #dfe3e5;
  border-radius: 5px;
  background: transparent;
  color: #6c747a;
  cursor: pointer;
  flex-shrink: 0;
}

.gateBtn:hover {
  background: #e9edef;
  color: #111315;
}

.gateBtnActive {
  border-color: #1d6ef9;
  background: #eff5ff;
  color: #1d6ef9;
}
```

---

## Step 7 — Student curriculum page

### `app/student/courses/[courseId]/page.tsx`

**Four changes:**

**A — Add `Lock` to lucide-react imports:**

```typescript
import { BookOpen, CheckCircle2, Clock3, Lock, PlayCircle } from "lucide-react";
```

**B — Add `requires_previous_completion` to the modules query:**

**Before:**
```typescript
supabase
  .from("course_modules")
  .select("id,title,description,sort_order,is_required")
  .eq("course_id", courseId)
  .eq("trader_id", app.trader_id)
  .eq("status", "published")
  .order("sort_order"),
```

**After:**
```typescript
supabase
  .from("course_modules")
  .select("id,title,description,sort_order,is_required,requires_previous_completion")
  .eq("course_id", courseId)
  .eq("trader_id", app.trader_id)
  .eq("status", "published")
  .order("sort_order"),
```

**C — Compute module accessibility** (add before the `return` statement, after all data is fetched):

```typescript
// Compute which modules are accessible (sequential gating)
const accessibleModuleIds = new Set<string>();
(modules ?? []).forEach((module, idx) => {
  if (!module.requires_previous_completion || idx === 0) {
    accessibleModuleIds.add(module.id);
    return;
  }
  const prev = (modules ?? [])[idx - 1];
  if (!prev) {
    accessibleModuleIds.add(module.id);
    return;
  }
  const prevRequired = (lessons ?? []).filter(
    (l) => l.module_id === prev.id && l.is_required,
  );
  const allDone =
    prevRequired.length > 0 &&
    prevRequired.every((l) =>
      (progress ?? []).some((p) => p.lesson_id === l.id && p.is_completed),
    );
  if (prevRequired.length === 0 || allDone) {
    accessibleModuleIds.add(module.id);
  }
});
```

**D — Update the module render to show the locked state:**

Inside `modules.map()`, add `isAccessible` derivation alongside the existing `isModuleComplete` logic:

```typescript
const isAccessible = accessibleModuleIds.has(module.id);
```

Update the module card JSX:

```tsx
<div className={`${styles.moduleCard} ${!isAccessible ? styles.moduleCardLocked : ""}`} key={module.id}>
  <div className={styles.moduleHeader}>
    <div className={styles.moduleMeta}>
      <h2>{module.title}</h2>
      {module.description ? (
        <p className={styles.moduleDesc}>{module.description}</p>
      ) : null}
    </div>
    <div className={styles.moduleHeaderRight}>
      {!isAccessible ? (
        <Lock size={15} className={styles.moduleLockIcon} />
      ) : isModuleComplete ? (
        <CheckCircle2 className={styles.moduleComplete} size={16} />
      ) : null}
      <span>
        {moduleLessons.length} lesson{moduleLessons.length === 1 ? "" : "s"}
      </span>
    </div>
  </div>

  {isAccessible ? (
    <div className={styles.lessonList}>
      {moduleLessons.map((lesson) => {
        /* ... existing lesson row render, unchanged ... */
      })}
    </div>
  ) : (
    <div className={styles.moduleLockedMessage}>
      <Lock size={13} />
      Complete the previous module to unlock this one.
    </div>
  )}
</div>
```

For locked modules, we render the lock message instead of the lesson list — this prevents students from clicking into locked lessons entirely.

---

## Step 8 — Student curriculum CSS additions

### `app/student/courses/[courseId]/course-detail.module.css`

Append:

```css
/* Module sequential gating */
.moduleCardLocked .moduleHeader {
  background: #f8f9fa;
  opacity: 0.75;
}

.moduleLockIcon {
  color: #6c747a;
  flex-shrink: 0;
}

.moduleLockedMessage {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 18px 20px;
  color: #6c747a;
  font-size: 12px;
  font-weight: 600;
}
```

---

## Step 9 — Lesson player gate enforcement

### `app/student/courses/[courseId]/lessons/[lessonId]/page.tsx`

**Two changes:**

**A — Add `sort_order` and `requires_previous_completion` to the module select inside the lesson query:**

**Before:**
```typescript
"id,title,description,module_id,sort_order,...,module:course_modules!inner(title,status),..."
```

Find the `lesson_content_blocks` select string and locate the `module:course_modules!inner(...)` portion. Change:
```
module:course_modules!inner(title,status)
```
to:
```
module:course_modules!inner(title,status,sort_order,requires_previous_completion)
```

**B — Add gate check after the `if (!lesson) notFound()` line:**

```typescript
if (!lesson) notFound();

// ── Sequential gate check ────────────────────────────────────────────────────
const lessonModule = Array.isArray(lesson.module) ? lesson.module[0] : lesson.module;

if (lessonModule?.requires_previous_completion) {
  // Find the previous published module (lower sort_order in this course)
  const { data: prevMod } = await supabase
    .from("course_modules")
    .select("id")
    .eq("course_id", courseId)
    .eq("trader_id", app.trader_id)
    .eq("status", "published")
    .lt("sort_order", lessonModule.sort_order ?? 0)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (prevMod) {
    // Check if all required published lessons in that module are completed by this student
    const { data: prevRequired } = await supabase
      .from("lessons")
      .select("id")
      .eq("module_id", prevMod.id)
      .eq("trader_id", app.trader_id)
      .eq("status", "published")
      .eq("is_required", true);

    if (prevRequired && prevRequired.length > 0) {
      const { count: doneCount } = await supabase
        .from("lesson_progress")
        .select("id", { count: "exact", head: true })
        .eq("student_user_id", user.id)
        .in("lesson_id", prevRequired.map((l) => l.id))
        .eq("is_completed", true);

      if ((doneCount ?? 0) < prevRequired.length) {
        // Module is locked — redirect student to the course curriculum
        redirect(`${academy.basePath}/courses/${courseId}${academy.querySuffix}`);
      }
    }
  }
}
// ── End gate check ────────────────────────────────────────────────────────────
```

This gate check only runs when `requires_previous_completion = true` (uncommon case), so it adds 0–2 extra queries for the typical unlocked lesson.

The `lessonModule.sort_order` usage requires that `sort_order` was added to the module select in change A. The existing `const lessonModule = ...` line further down the file can remain — just ensure the new code at the gate check block references `lessonModule` before that line exists. If necessary, move the `lessonModule` derivation above the gate check (or inline it there as shown above).

---

## Verification

1. Apply the migration and verify `course_modules` now has `requires_previous_completion boolean NOT NULL DEFAULT false`.

2. `pnpm typecheck` — must exit 0. Watch for:
   - `Module` type in `CourseDetailManager` now has `requires_previous_completion: boolean` — the dashboard page query now returns it, so TypeScript should infer it
   - The `lessonModule` in the lesson player now has `sort_order` and `requires_previous_completion` — confirm the type is used correctly

3. `pnpm build` — must pass clean.

4. Manual acceptance (KaiTrades workspace):

   **Mentor side:**
   - Open a course with at least 2 modules
   - The first module should NOT show the lock button — confirm
   - The second module should show an unlocked lock icon button in the module row
   - Click the lock button on module 2 → it turns blue (active) → toast "Module updated." → page refreshes
   - Click again → it turns grey (inactive) → module is ungated

   **Student side (gate OFF):**
   - As a KaiTrades student, open the course curriculum → all modules show normally, no lock messages
   - Click any lesson in any module → plays normally

   **Student side (gate ON):**
   - As a mentor, enable gating on module 2
   - As a student (with module 1 incomplete) → curriculum shows module 2 with lock icon and "Complete the previous module to unlock this one." — lesson rows for module 2 are hidden
   - As a student, directly navigate to a lesson URL in module 2 → redirected to the course curriculum
   - Complete all required lessons in module 1 → refresh curriculum → module 2 unlocks

5. `pnpm test` — must pass at same count.

---

## What this does NOT change

- `app/api/courses/[courseId]/curriculum/route.ts` — untouched. The `reorder_course_curriculum` RPC handles reordering; gating is a separate concern on a new endpoint
- `components/course-tabs/add-lesson-panel.tsx`, `edit-lesson-panel.tsx` — untouched
- `ProtectedLessonContent` — untouched; the gate is enforced at the page level before the component renders
- The `can_access_course()` RPC — untouched; gating is purely UI + server-render logic, not an RLS concern
- No changes to email, notifications, or student application flows
