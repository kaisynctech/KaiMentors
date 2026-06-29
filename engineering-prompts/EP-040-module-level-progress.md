# EP-040 — Module-Level Progress on Curriculum Page

**Status:** Ready for Engineering  
**Architect:** KaiMentors Enterprise Architect  
**Date:** 2026-06-29  
**Scope:** `app/student/courses/[courseId]/page.tsx` + `course-detail.module.css`  
**Migration required:** No  
**API changes:** No  
**Package install required:** No

---

## Objective

Show per-module progress in the module card header — a mini progress bar and completed/total fraction — so students can see how far through each module they are without opening the lesson list.

---

## Change 1 — Compute module-level progress inside the `modules.map()`

**File:** `app/student/courses/[courseId]/page.tsx`

Inside the `modules.map((module) => { ... })` block, immediately after the existing `isAccessible` computation, add:

```typescript
const moduleCompletedRequired = moduleRequiredLessons.filter((l) =>
  (progress ?? []).some((p) => p.lesson_id === l.id && p.is_completed),
).length;
const modulePct =
  moduleRequiredLessons.length > 0
    ? Math.round((moduleCompletedRequired / moduleRequiredLessons.length) * 100)
    : 0;
```

No new queries — `moduleRequiredLessons` and `progress` are already in scope.

---

## Change 2 — Update the module header JSX

Replace the current `<div className={styles.moduleHeaderRight}>` block with:

```tsx
<div className={styles.moduleHeaderRight}>
  {!isAccessible ? (
    <Lock size={15} className={styles.moduleLockIcon} />
  ) : isModuleComplete ? (
    <CheckCircle2 className={styles.moduleComplete} size={16} />
  ) : moduleRequiredLessons.length > 0 ? (
    <div className={styles.moduleProgress}>
      <div
        aria-label={`${modulePct}% of module complete`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={modulePct}
        className={styles.moduleProgressBar}
        role="progressbar"
      >
        <span style={{ width: `${modulePct}%` }} />
      </div>
      <span className={styles.moduleProgressLabel}>
        {moduleCompletedRequired}/{moduleRequiredLessons.length}
      </span>
    </div>
  ) : null}
  <span>
    {moduleLessons.length} lesson{moduleLessons.length === 1 ? "" : "s"}
  </span>
</div>
```

**Logic summary:**
- Locked → lock icon (unchanged)
- Accessible + all required done → green checkmark (unchanged)
- Accessible + required lessons exist + not complete → mini progress bar + `X/Y` fraction
- Accessible + no required lessons (all optional) → nothing extra, just lesson count

---

## Change 3 — CSS additions

**File:** `app/student/courses/[courseId]/course-detail.module.css`

Add after the `.moduleComplete` rule:

```css
.moduleProgress {
  display: flex;
  align-items: center;
  gap: 8px;
}

.moduleProgressBar {
  width: 72px;
  height: 4px;
  border-radius: 999px;
  background: #e9edef;
  overflow: hidden;
  flex-shrink: 0;
}

.moduleProgressBar span {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: #1d6ef9;
  transition: width 400ms ease;
}

.moduleProgressLabel {
  font-size: 11px;
  font-weight: 700;
  color: #6c747a;
  white-space: nowrap;
}
```

---

## Acceptance criteria

Test against KaiTrades only.

1. Open a course with multiple modules and some lesson progress
2. Each accessible module header shows a 72px progress bar + `X/Y` fraction (e.g., `2/5`) to the left of the lesson count
3. The bar fills proportionally to completed required lessons
4. A fully completed module shows the green checkmark instead of the bar (no fraction)
5. A locked module shows the lock icon only (no bar, no fraction)
6. A module with only optional lessons (no `is_required` lessons) shows no bar and no fraction
7. A module with 0% progress shows an empty bar with `0/N`
8. The module header remains a single row — the right-side cluster doesn't wrap on desktop
