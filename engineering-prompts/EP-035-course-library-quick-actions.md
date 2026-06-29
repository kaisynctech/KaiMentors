# EP-035 — Course Library Quick Actions (Publish Toggle + Delete)

**Status:** Ready for Engineering  
**Architect:** KaiMentors Enterprise Architect  
**Date:** 2026-06-29  
**Scope:** Course library card UI + two new API handlers  
**Migration required:** No (assumes existing CASCADE FK constraints)  
**API changes:** Yes — two new handlers  
**Package install required:** No

---

## Objective

Add a `⋯` action menu to each course card in the mentor course library that lets the mentor publish/unpublish and delete a course without navigating into the editor.

---

## New API endpoints

### 1. `PATCH /api/courses/[courseId]/status`

**File:** `app/api/courses/[courseId]/status/route.ts` (new file)

Accepts: `{ status: "draft" | "published" | "archived" }` as JSON body.

Logic:
1. Authenticate user + resolve `trader_id` from `trader_members` (same as existing PATCH handler)
2. Fetch existing course — verify `trader_id` ownership, 404 if not found
3. Validate `status` with Zod: `z.object({ status: z.enum(["draft", "published", "archived"]) })`
4. If transitioning to `"published"`, run the cascade publish (same logic as existing PATCH handler):
   ```typescript
   await Promise.all([
     supabase.from("course_modules").update({ status: "published" }).eq("course_id", courseId).eq("trader_id", membership.trader_id),
     supabase.from("lessons").update({ status: "published" }).eq("course_id", courseId).eq("trader_id", membership.trader_id),
   ]);
   ```
5. Update `courses.status`
6. Return `{ status: "updated" }`

Do NOT require `acknowledgeImpact` for this lightweight endpoint — it is for simple publish/unpublish only.

---

### 2. `DELETE /api/courses/[courseId]`

**File:** `app/api/courses/[courseId]/route.ts` — add a `DELETE` export

Logic:
1. Authenticate user + resolve `trader_id`
2. Fetch course — verify ownership, 404 if not found
3. Check for active learners:
   ```typescript
   const { count: learnerCount } = await supabase
     .from("lesson_progress")
     .select("student_user_id", { count: "exact", head: true })
     .eq("course_id", courseId)
     .eq("trader_id", membership.trader_id);
   ```
4. If `learnerCount > 0` AND the request body does not include `{ acknowledgeImpact: true }`, return:
   ```json
   { "error": "This course has active learners.", "learnerCount": N, "requiresConfirmation": true }
   ```
   with status `409`.
5. If acknowledged (or no learners), delete the course:
   ```typescript
   await supabase
     .from("courses")
     .delete()
     .eq("id", courseId)
     .eq("trader_id", membership.trader_id);
   ```
   Rely on database CASCADE constraints to remove modules, lessons, blocks, progress, and access rules. If CASCADE is not in place, Engineering must add a migration to set `ON DELETE CASCADE` on all FK references to `courses.id` before shipping this.
6. Return `{ status: "deleted" }`

---

## UI changes

### `components/course-manager.tsx`

**`CourseLibraryCard`** is currently a full-card `<Link>`. Convert it to a `"use client"` sub-component (or keep in the same file) so it can hold local state for the action menu.

#### Card structure change

```tsx
// Wrap the card in a relative <div> instead of a single <Link>
<div className={styles.cardWrap}>
  <Link className={styles.card} href={`/dashboard/courses/${course.id}`}>
    {/* existing card content unchanged */}
  </Link>
  <button
    aria-label="Course actions"
    className={styles.cardMenuBtn}
    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(true); }}
  >
    <MoreHorizontal size={15} />
  </button>
  {menuOpen && (
    <div className={styles.cardMenu} ref={menuRef}>
      <button onClick={handleToggleStatus}>
        {course.status === "published" ? "Unpublish" : "Publish"}
      </button>
      <button className={styles.cardMenuDelete} onClick={() => { setMenuOpen(false); setConfirmDelete(true); }}>
        Delete
      </button>
    </div>
  )}
</div>
```

State per card: `menuOpen` (boolean), `confirmDelete` (boolean), `busy` (boolean).

Close the menu on outside click using a `useEffect` + `ref` (same pattern as existing modals in the file).

#### `handleToggleStatus`

```typescript
async function handleToggleStatus() {
  setMenuOpen(false);
  setBusy(true);
  const next = course.status === "published" ? "draft" : "published";
  await fetch(`/api/courses/${course.id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: next }),
  });
  router.refresh();
  setBusy(false);
}
```

#### `handleDelete`

```typescript
async function handleDelete(acknowledge: boolean) {
  setBusy(true);
  const res = await fetch(`/api/courses/${course.id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ acknowledgeImpact: acknowledge }),
  });
  if (res.status === 409) {
    const body = await res.json();
    setLearnerCount(body.learnerCount); // show warning in confirm modal
    setBusy(false);
    return;
  }
  router.refresh();
}
```

#### Delete confirmation modal

Show inline (not the global modal) when `confirmDelete` is true:

```
"Delete [course title]?"
"This will permanently remove the course, all modules, lessons and content."
[If learnerCount > 0]: "Warning: [N] learner(s) have progress on this course."
[Cancel]  [Delete permanently]
```

Clicking "Delete permanently" calls `handleDelete(true)`.

---

## CSS additions (`components/course-manager.module.css`)

```css
.cardWrap {
  position: relative;
}

.cardMenuBtn {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: rgba(255,255,255,0.85);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  z-index: 2;
}

.cardWrap:hover .cardMenuBtn {
  opacity: 1;
}

.cardMenu {
  position: absolute;
  top: 36px;
  right: 8px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.10);
  min-width: 140px;
  z-index: 10;
  padding: 4px 0;
}

.cardMenu button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 14px;
  font-size: 13px;
  background: none;
  border: none;
  cursor: pointer;
}

.cardMenu button:hover {
  background: #f3f4f6;
}

.cardMenuDelete {
  color: #dc2626;
}
```

---

## Import additions

Add to `course-manager.tsx` imports:
```typescript
import { MoreHorizontal } from "lucide-react";
```

---

## Acceptance criteria

Test against KaiTrades only.

1. Hover over a draft course card — the `⋯` button appears in the top-right corner
2. Click `⋯` → menu shows "Publish" and "Delete"
3. Click "Publish" → card status badge updates to "published" without page reload (after `router.refresh()`)
4. Open the menu on the now-published card → shows "Unpublish"
5. Click "Unpublish" → card reverts to draft
6. Click "Delete" → confirmation modal appears with course title
7. Click "Delete permanently" → course disappears from the list
8. If the course has active learners, the confirm modal shows the learner count warning before allowing deletion
9. Clicking outside the `⋯` menu closes it
10. Clicking the card body (not the `⋯` button) still navigates to the course editor
