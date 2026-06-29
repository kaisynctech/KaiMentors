# EP-038 — Course Completion State

**Status:** Ready for Engineering  
**Architect:** KaiMentors Enterprise Architect  
**Date:** 2026-06-29  
**Scope:** Two student pages + `ProtectedLessonContent` component  
**Migration required:** No  
**API changes:** No  
**Package install required:** No

---

## Objective

When a student finishes all required lessons in a course, show a completion celebration on the curriculum page and an enhanced "course complete" state on the final lesson page.

---

## Change 1 — Curriculum page completion banner

**File:** `app/student/courses/[courseId]/page.tsx`

`percent` is already computed (lines 101–103). When `percent === 100`, replace the progress bar + label with a completion banner:

```tsx
{percent === 100 ? (
  <div className={styles.completionBanner} role="status">
    <PartyPopper size={20} />
    <div>
      <strong>Course complete!</strong>
      <p>You've finished all required lessons. Well done.</p>
    </div>
  </div>
) : (
  <>
    <div
      className={styles.progressBar}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Course completion"
    >
      <span style={{ width: `${percent}%` }} />
    </div>
    <p className={styles.progressLabel}>
      {percent}% complete · {completed}/{required.length} required lessons done
    </p>
  </>
)}
```

Add `PartyPopper` to the lucide-react import at the top of the file.

**CSS addition** in `app/student/courses/[courseId]/course-detail.module.css`:

```css
.completionBanner {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 18px;
  border-radius: 12px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #176c42;
  margin-top: 4px;
}

.completionBanner strong {
  display: block;
  font-size: 14px;
  font-weight: 700;
}

.completionBanner p {
  margin: 2px 0 0;
  font-size: 12px;
  opacity: 0.85;
}
```

---

## Change 2 — Final lesson "course complete" state

### 2a. Add `is_required` to the curriculum query

**File:** `app/student/courses/[courseId]/lessons/[lessonId]/page.tsx`

In the `curriculum` query (inside the `Promise.all`), add `is_required` to the select string:

```typescript
// Before
"id,title,module_id,sort_order,module:course_modules!inner(id,title,sort_order,status)"

// After
"id,title,module_id,sort_order,is_required,module:course_modules!inner(id,title,sort_order,status)"
```

### 2b. Compute `courseWillBeComplete` after the queries resolve

Add this computation after the `Promise.all` block (before the `if (!lesson) notFound()` line):

```typescript
// Is this lesson the last required one the student hasn't yet completed?
const currentLessonIsRequired = lesson.is_required ?? true;
const otherRequired = (ordered).filter(
  (l) => l.is_required && l.id !== lessonId,
);
const otherRequiredDone = otherRequired.every((l) =>
  (allProgress ?? []).some((p) => p.lesson_id === l.id && p.is_completed),
);
const alreadyComplete = (allProgress ?? []).some(
  (p) => p.lesson_id === lessonId && p.is_completed,
);
// True if completing THIS lesson would finish the whole course
const courseWillBeComplete =
  currentLessonIsRequired && otherRequiredDone && !alreadyComplete;
```

Note: `ordered` is already computed above (sorted curriculum array). `lesson.is_required` comes from the existing lesson select which already includes `is_required` via the full lesson query at the top of the `Promise.all`.

### 2c. Pass `courseWillBeComplete` to `ProtectedLessonContent`

```tsx
<ProtectedLessonContent
  blocks={blocks}
  completed={progress?.is_completed ?? false}
  courseWillBeComplete={courseWillBeComplete}
  courseId={courseId}          {/* needed for the back-link */}
  lessonId={lesson.id}
  resumeSeconds={progress?.position_seconds ?? 0}
  watermark={`${portal?.portal_name ?? "Academy"} · ${app.full_name} · ${user.email ?? ""}`}
  previewMode={false}
/>
```

---

## Change 3 — `ProtectedLessonContent` course-complete overlay

**File:** `components/protected-lesson-content.tsx`

### Props addition

```typescript
export function ProtectedLessonContent({
  lessonId,
  blocks,
  resumeSeconds,
  completed,
  watermark,
  previewMode = false,
  courseWillBeComplete = false,
  courseId,
}: {
  lessonId: string;
  blocks: Block[];
  resumeSeconds: number;
  completed: boolean;
  watermark: string;
  previewMode?: boolean;
  courseWillBeComplete?: boolean;
  courseId?: string;
}) {
```

### State addition

Add `const [courseComplete, setCourseComplete] = useState(false);` alongside the existing `done` state.

### Trigger on lesson completion

In the `progress()` function, when `isCompleted` is true and the lesson transitions to done, check `courseWillBeComplete`:

```typescript
async function progress(position: number, isCompleted = false) {
  if (previewMode) return;
  // ... existing fetch ...
  if (isCompleted) {
    setDone(true);
    if (courseWillBeComplete) {
      setCourseComplete(true);
    }
  }
}
```

Also update the `setDone(true)` call in the manual "Mark lesson complete" button's `onClick`:

```tsx
<button
  className={styles.complete}
  disabled={done}
  onClick={() => {
    progress(resumeSeconds, true);
    // setDone and setCourseComplete are handled inside progress()
  }}
>
```

### Course-complete overlay

After the existing `<button className={styles.complete} ...>` element, add:

```tsx
{courseComplete && courseId && (
  <div className={styles.courseCompleteOverlay}>
    <PartyPopper size={28} className={styles.courseCompleteIcon} />
    <h2>Course complete!</h2>
    <p>You've finished all required lessons. Well done.</p>
    <a className={styles.courseCompleteLink} href={`/student/courses/${courseId}`}>
      View your progress
    </a>
  </div>
)}
```

Import `PartyPopper` from `lucide-react`.

### CSS additions (`components/protected-lesson-content.module.css`)

```css
.courseCompleteOverlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin: 24px 0 0;
  padding: 32px 24px;
  border-radius: 16px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  text-align: center;
  animation: fadeUp 0.4s ease both;
}

.courseCompleteOverlay h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  color: #176c42;
}

.courseCompleteOverlay p {
  margin: 0;
  font-size: 13px;
  color: #176c42;
  opacity: 0.8;
}

.courseCompleteIcon {
  color: #16a34a;
}

.courseCompleteLink {
  margin-top: 4px;
  display: inline-block;
  padding: 8px 20px;
  border-radius: 8px;
  background: #16a34a;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  transition: background 0.15s;
}

.courseCompleteLink:hover {
  background: #15803d;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

---

## Acceptance criteria

Test against KaiTrades only.

1. On the curriculum page with < 100% progress — progress bar and label show as before
2. On the curriculum page with all required lessons complete — progress bar is replaced by the green "Course complete!" banner
3. On the final required lesson, click "Mark lesson complete" (or watch to end) — the course-complete overlay fades in below the lesson content
4. The "View your progress" link navigates to the course curriculum page where the completion banner is shown
5. If a student revisits a lesson after the course is complete, the course-complete overlay does NOT re-appear (it only triggers on the transition: `courseWillBeComplete` is false if `alreadyComplete` is true)
6. Optional lessons do not block the completion state
7. Preview mode: `previewMode={true}` — the overlay never fires (guarded by the `if (previewMode) return` in `progress()`)
