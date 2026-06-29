# EP-022 — Student Curriculum Enhancements

**Status:** Ready for Engineering  
**Architect:** KaiMentors Enterprise Architect  
**Date:** 2026-06-26  
**Scope:** `app/student/courses/[courseId]/page.tsx`, `app/student/courses/[courseId]/course-detail.module.css`  
**Migration required:** No  
**API changes:** No

---

## Objective

Make the student curriculum page enterprise-quality. Five targeted improvements — all purely presentational changes to one page and its CSS file, using data that is already being fetched (plus one small query addition):

1. **Lesson type icon** — replace the sort-order number with a block-type icon so students see at a glance what kind of content each lesson contains (video, PDF, text, etc.)
2. **Module description** — render `module.description` beneath the module title for mentors who write it
3. **Optional badge** — surface a small "Optional" tag on lessons where `is_required = false`
4. **Video watch progress bar** — show a mini progress bar under the lesson title when a lesson is in-progress (started but not completed), derived from existing `lesson_progress` data
5. **Module completion badge** — show a green checkmark on the module header when every required lesson in that module is completed

---

## Pre-investigation

Read the following files before making any changes:

- `app/student/courses/[courseId]/page.tsx`
- `app/student/courses/[courseId]/course-detail.module.css`
- `lib/courses.ts` (for `formatDuration` signature)

Confirm:
- The current `lessons` query selects: `id, module_id, title, description, duration_seconds, sort_order, is_required`
- The current `progress` query selects: `lesson_id, is_completed, is_started, position_seconds, last_activity_at`
- The current `modules` query selects: `id, title, description, sort_order, is_required`

---

## Change 1 — Update the lessons query to include block types

### File: `app/student/courses/[courseId]/page.tsx`

In the `Promise.all`, update the **lessons** query. Add `blocks:lesson_content_blocks(block_type)` to the select string.

**Before:**
```typescript
supabase
  .from("lessons")
  .select("id,module_id,title,description,duration_seconds,sort_order,is_required")
  .eq("course_id", courseId)
  .eq("trader_id", app.trader_id)
  .eq("status", "published")
  .order("sort_order"),
```

**After:**
```typescript
supabase
  .from("lessons")
  .select("id,module_id,title,description,duration_seconds,sort_order,is_required,blocks:lesson_content_blocks(block_type)")
  .eq("course_id", courseId)
  .eq("trader_id", app.trader_id)
  .eq("status", "published")
  .order("sort_order"),
```

The RLS policy `"students read accessible lesson blocks"` already permits this join for verified students on published lessons. No migration needed.

---

## Change 2 — Add icon imports and helper function

### File: `app/student/courses/[courseId]/page.tsx`

**Import additions** — add to the existing lucide-react import line:

```typescript
import { AlignLeft, BookOpen, CheckCircle2, Clock3, ExternalLink, FileImage, FileText, Film, LayoutGrid, PlayCircle } from "lucide-react";
```

(`BookOpen`, `CheckCircle2`, `Clock3`, `PlayCircle` are already imported. Add: `AlignLeft`, `ExternalLink`, `FileImage`, `FileText`, `Film`, `LayoutGrid`)

**Add two helper functions** after the imports, before the component function:

```typescript
const BLOCK_TYPE_PRIORITY = ["video", "pdf", "gallery", "image", "rich_text", "link"] as const;

function getPrimaryBlockType(blocks: { block_type: string }[]): string | null {
  if (!blocks.length) return null;
  const types = new Set(blocks.map((b) => b.block_type));
  return BLOCK_TYPE_PRIORITY.find((t) => types.has(t)) ?? null;
}

function ContentTypeIcon({ type }: { type: string | null }) {
  if (type === "video") return <Film size={16} />;
  if (type === "pdf") return <FileText size={16} />;
  if (type === "gallery") return <LayoutGrid size={16} />;
  if (type === "image") return <FileImage size={16} />;
  if (type === "rich_text") return <AlignLeft size={16} />;
  if (type === "link") return <ExternalLink size={16} />;
  return <BookOpen size={16} />;
}
```

---

## Change 3 — Update the module header to show description and completion badge

### File: `app/student/courses/[courseId]/page.tsx`

Inside the `modules.map()`, before the module header JSX, add the completion logic:

```typescript
const moduleRequiredLessons = moduleLessons.filter((l) => l.is_required);
const isModuleComplete =
  moduleRequiredLessons.length > 0 &&
  moduleRequiredLessons.every((l) =>
    (progress ?? []).some((p) => p.lesson_id === l.id && p.is_completed),
  );
```

**Replace the module header JSX:**

**Before:**
```tsx
<div className={styles.moduleHeader}>
  <h2>{module.title}</h2>
  <span>{moduleLessons.length} lesson{moduleLessons.length === 1 ? "" : "s"}</span>
</div>
```

**After:**
```tsx
<div className={styles.moduleHeader}>
  <div className={styles.moduleMeta}>
    <h2>{module.title}</h2>
    {module.description ? (
      <p className={styles.moduleDesc}>{module.description}</p>
    ) : null}
  </div>
  <div className={styles.moduleHeaderRight}>
    {isModuleComplete ? (
      <CheckCircle2 className={styles.moduleComplete} size={16} />
    ) : null}
    <span>
      {moduleLessons.length} lesson{moduleLessons.length === 1 ? "" : "s"}
    </span>
  </div>
</div>
```

---

## Change 4 — Update each lesson row

### File: `app/student/courses/[courseId]/page.tsx`

Inside `moduleLessons.map()`, add watch-progress derivation alongside the existing `done` and `isResume` constants:

```typescript
const lessonProg = (progress ?? []).find((p) => p.lesson_id === lesson.id);
const isInProgress = !!lessonProg?.is_started && !lessonProg?.is_completed;
const watchPercent =
  isInProgress && lesson.duration_seconds && lessonProg?.position_seconds
    ? Math.min(99, Math.round((lessonProg.position_seconds / lesson.duration_seconds) * 100))
    : 0;
const primaryType = getPrimaryBlockType(
  (lesson.blocks ?? []) as { block_type: string }[],
);
```

(`Math.min(99, ...)` prevents showing 100% on a lesson the student hasn't explicitly completed.)

**Replace the lesson row JSX:**

**Before:**
```tsx
<div className={styles.lessonIcon}>
  {done ? (
    <CheckCircle2 size={18} />
  ) : (
    <span>{lesson.sort_order}</span>
  )}
</div>
<div className={styles.lessonMeta}>
  <strong>{lesson.title}</strong>
  <p>{lesson.description || "Mixed-media lesson"}</p>
</div>
<div className={styles.lessonRight}>
  {isResume && (
    <span className={styles.resumeLabel}>
      <PlayCircle size={13} /> Resume
    </span>
  )}
  <span className={styles.duration}>
    <Clock3 size={11} /> {formatDuration(lesson.duration_seconds)}
  </span>
</div>
```

**After:**
```tsx
<div className={styles.lessonIcon}>
  {done ? (
    <CheckCircle2 size={18} />
  ) : (
    <ContentTypeIcon type={primaryType} />
  )}
</div>
<div className={styles.lessonMeta}>
  <strong>{lesson.title}</strong>
  {lesson.description ? <p>{lesson.description}</p> : null}
  {!lesson.is_required ? (
    <span className={styles.optionalBadge}>Optional</span>
  ) : null}
  {isInProgress && watchPercent > 0 ? (
    <div
      aria-label={`${watchPercent}% watched`}
      className={styles.watchBar}
      role="progressbar"
      aria-valuenow={watchPercent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${watchPercent}%` }} />
    </div>
  ) : null}
</div>
<div className={styles.lessonRight}>
  {isResume ? (
    <span className={styles.resumeLabel}>
      <PlayCircle size={13} /> Resume
    </span>
  ) : null}
  <span className={styles.duration}>
    <Clock3 size={11} /> {formatDuration(lesson.duration_seconds)}
  </span>
</div>
```

---

## Change 5 — CSS additions

### File: `app/student/courses/[courseId]/course-detail.module.css`

Append the following to the end of the file (before the `@media` blocks if you prefer, but appending after is fine):

```css
/* ── Module enhancements ─────────────────────────────────── */

.moduleMeta {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.moduleDesc {
  margin: 0;
  font-size: 11px;
  color: #6c747a;
  font-weight: 400;
  line-height: 1.5;
  max-width: 480px;
}

.moduleHeaderRight {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.moduleComplete {
  color: #22c55e;
  flex-shrink: 0;
}

/* ── Lesson enhancements ─────────────────────────────────── */

.optionalBadge {
  display: inline-block;
  margin-top: 4px;
  padding: 2px 7px;
  border-radius: 999px;
  background: #f3f4f6;
  color: #6c747a;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.watchBar {
  margin-top: 5px;
  height: 3px;
  max-width: 120px;
  border-radius: 999px;
  background: #e9edef;
  overflow: hidden;
}

.watchBar span {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: #1d6ef9;
}
```

**Also update `.moduleHeader`** — the existing rule has `align-items: center` which vertically centres the right side against a single-line title. When a module has a description, the left side grows taller. Change `align-items: center` to `align-items: flex-start` so the right-side badge and count pin to the top:

```css
.moduleHeader {
  display: flex;
  align-items: flex-start;   /* changed from center */
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #e9edef;
  background: #f8f9fa;
}
```

---

## Verification

1. Run `pnpm typecheck` — should pass with zero new errors. The `blocks` field returned from Supabase will be typed as `{ block_type: string }[]` inferred from the select string; cast with `as { block_type: string }[]` if the inferred type is wider.

2. Manually verify in KaiTrades student view:
   - A published module with a description shows it beneath the title
   - A published module with all required lessons completed shows a green checkmark
   - A lesson with a video block shows the Film icon (not a sort-order number)
   - A lesson with `is_required = false` shows the "Optional" badge
   - A lesson that is in-progress shows the blue watch-progress bar proportional to `position_seconds / duration_seconds`
   - A completed lesson still shows the green `CheckCircle2` — not the type icon

3. Run a full build (`pnpm build`) — must pass clean.

---

## What this does NOT change

- No changes to the lesson player page
- No API routes modified
- No database migrations
- No changes to the mentor-facing curriculum tab
- `formatDuration(null)` already returns `"Duration not set"` — no change needed there
