# EP-036 — Lesson Duplication

**Status:** Ready for Engineering  
**Architect:** KaiMentors Enterprise Architect  
**Date:** 2026-06-29  
**Scope:** New API route + `CurriculumTab` + `course-detail-manager.tsx`  
**Migration required:** No  
**API changes:** Yes — one new route  
**Package install required:** No

---

## Objective

Add a "Duplicate" action to each lesson row in the curriculum tree. The duplicate is created as `draft`, titled `"Copy of [original title]"`, inserted immediately after the original in the same module, and opened in the edit panel so the mentor can rename it right away.

---

## New API endpoint

### `POST /api/courses/[courseId]/lessons/[lessonId]/duplicate`

**File:** `app/api/courses/[courseId]/lessons/[lessonId]/duplicate/route.ts` (new file)

**Logic:**

1. Authenticate + resolve `trader_id` via `requireMentorCourseContext()`.
2. Fetch the source lesson:
   ```typescript
   const { data: source } = await context.supabase
     .from("lessons")
     .select("id,module_id,title,description,duration_seconds,sort_order,is_required")
     .eq("id", lessonId)
     .eq("course_id", courseId)
     .eq("trader_id", context.traderId)
     .maybeSingle();
   if (!source) return NextResponse.json({ error: "Lesson not found." }, { status: 404 });
   ```
3. Shift sort_order of all sibling lessons that come after the original to make a gap:
   ```typescript
   await context.supabase
     .from("lessons")
     .update({ sort_order: context.supabase.rpc("increment_sort_order") }) // see note below
   ```
   **Simpler approach (no RPC needed):** fetch all lessons in the same module with `sort_order > source.sort_order`, then update each with `sort_order + 1` in a loop. This is safe at low lesson counts.

   ```typescript
   const { data: siblings } = await context.supabase
     .from("lessons")
     .select("id,sort_order")
     .eq("module_id", source.module_id)
     .eq("course_id", courseId)
     .eq("trader_id", context.traderId)
     .gt("sort_order", source.sort_order)
     .order("sort_order", { ascending: false }); // descending so no collision during update

   for (const sibling of siblings ?? []) {
     await context.supabase
       .from("lessons")
       .update({ sort_order: sibling.sort_order + 1 })
       .eq("id", sibling.id)
       .eq("trader_id", context.traderId);
   }
   ```

4. Insert the duplicate lesson:
   ```typescript
   const { data: copy, error: copyError } = await context.supabase
     .from("lessons")
     .insert({
       trader_id: context.traderId,
       course_id: courseId,
       module_id: source.module_id,
       title: `Copy of ${source.title}`,
       description: source.description,
       duration_seconds: source.duration_seconds,
       status: "draft",
       sort_order: source.sort_order + 1,
       is_required: source.is_required,
       created_by: context.user.id,
     })
     .select("id")
     .single();
   if (copyError || !copy) return NextResponse.json({ error: "Could not duplicate lesson." }, { status: 400 });
   ```

5. Copy content blocks:
   ```typescript
   const { data: blocks } = await context.supabase
     .from("lesson_content_blocks")
     .select("id,block_type,sort_order,is_required,media_id,content")
     .eq("lesson_id", lessonId)
     .eq("trader_id", context.traderId);

   for (const block of blocks ?? []) {
     const { data: newBlock } = await context.supabase
       .from("lesson_content_blocks")
       .insert({
         lesson_id: copy.id,
         course_id: courseId,
         trader_id: context.traderId,
         created_by: context.user.id,
         block_type: block.block_type,
         sort_order: block.sort_order,
         media_id: block.media_id,
         content: block.content,
         is_required: block.is_required,
       })
       .select("id")
       .single();

     // Copy gallery media join rows (for gallery blocks)
     if (block.block_type === "gallery" && newBlock) {
       const { data: galleryItems } = await context.supabase
         .from("lesson_content_block_media")
         .select("media_id,sort_order")
         .eq("block_id", block.id);

       for (const item of galleryItems ?? []) {
         await context.supabase.from("lesson_content_block_media").insert({
           block_id: newBlock.id,
           lesson_id: copy.id,
           course_id: courseId,
           trader_id: context.traderId,
           media_id: item.media_id,
           sort_order: item.sort_order,
         });
       }
     }
   }
   ```

6. Do NOT copy `resources` — resources are attached to specific file uploads and are lesson-specific. The mentor can re-attach them in the edit panel.

7. Return: `{ lessonId: copy.id }`

---

## UI changes

### `components/course-detail-manager.tsx`

Add a `duplicateLesson` function alongside `createLessonWithBlocks` and `updateLessonWithBlocks`:

```typescript
async function duplicateLesson(lessonId: string) {
  setBusy(true);
  const res = await fetch(
    `/api/courses/${course.id}/lessons/${lessonId}/duplicate`,
    { method: "POST" },
  );
  if (!res.ok) {
    setBusy(false);
    return;
  }
  const { lessonId: newId } = await res.json();
  router.refresh();
  // After refresh, the new lesson exists in state — open it in the edit panel
  setSelectedLesson(newId);
  setBusy(false);
}
```

Pass `duplicateLesson` as a prop to `CurriculumTab`.

**Note:** `router.refresh()` triggers a server refetch which repopulates `lessons` from the parent server component. The `setSelectedLesson(newId)` call must come after the refresh resolves. Since `router.refresh()` is not awaitable in Next.js App Router, use a `useEffect` in `CourseDetailManager` to open the new lesson once the lessons array contains it:

```typescript
const [pendingSelectId, setPendingSelectId] = useState<string | null>(null);

// In duplicateLesson:
async function duplicateLesson(lessonId: string) {
  setBusy(true);
  const res = await fetch(
    `/api/courses/${course.id}/lessons/${lessonId}/duplicate`,
    { method: "POST" },
  );
  if (!res.ok) { setBusy(false); return; }
  const { lessonId: newId } = await res.json();
  setPendingSelectId(newId);
  router.refresh();
  setBusy(false);
}

// Effect to open the lesson once it appears in the refreshed list:
useEffect(() => {
  if (!pendingSelectId) return;
  const exists = lessons.some((l) => l.id === pendingSelectId);
  if (exists) {
    setSelectedLesson(pendingSelectId);
    setPendingSelectId(null);
  }
}, [lessons, pendingSelectId]);
```

---

### `components/course-tabs/curriculum-tab.tsx`

**Props change:** Add `duplicateLesson: (lessonId: string) => Promise<void>` to the `Props` interface.

**Lesson row change:** Add a `⋯` action button to each lesson row, identical in pattern to the EP-035 card menu. The lesson row already has a `role="button"` click target — the duplicate button must call `e.stopPropagation()` to prevent the row click from also selecting/opening the lesson.

```tsx
<div
  className={`${styles.lessonTreeRow} ${selectedLesson === lesson.id ? styles.selectedLesson : ""}`}
  key={lesson.id}
  onClick={() => selectLesson(lesson.id)}
  role="button"
  tabIndex={0}
  onKeyDown={(e) => e.key === "Enter" && selectLesson(lesson.id)}
>
  <span className={...}>{/* status icon */}</span>
  <span className={styles.lessonTreeTitle}>{lesson.title}</span>
  <span className={styles.lessonTreeDuration}>
    <Clock size={10} />
    {formatDuration(lesson.duration_seconds)}
  </span>
  <button
    aria-label="Duplicate lesson"
    className={styles.lessonDuplicateBtn}
    disabled={busy}
    title="Duplicate lesson"
    onClick={(e) => {
      e.stopPropagation();
      duplicateLesson(lesson.id);
    }}
    type="button"
  >
    <Copy size={12} />
  </button>
</div>
```

Import `Copy` from `lucide-react`.

---

### CSS additions (`components/course-detail-manager.module.css`)

```css
.lessonDuplicateBtn {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: none;
  background: none;
  cursor: pointer;
  opacity: 0;
  color: var(--muted-foreground, #6b7280);
  flex-shrink: 0;
  transition: opacity 0.12s, background 0.12s;
}

.lessonTreeRow:hover .lessonDuplicateBtn {
  opacity: 1;
}

.lessonDuplicateBtn:hover {
  background: var(--accent, #f3f4f6);
}
```

> **Note:** `.lessonTreeRow` already has `display: flex; align-items: center` — the button uses `margin-left: auto` to push it to the right edge, replacing the current gap that holds `.lessonTreeDuration`. Move the duration span before the button so the order is: icon → title → duration → duplicate button.

---

## Acceptance criteria

Test against KaiTrades only.

1. Hover over a lesson row in the curriculum tree — the `Copy` icon appears at the right edge
2. Click it — a new lesson titled `"Copy of [original title]"` appears immediately below the original in the same module
3. The edit panel opens with the duplicate pre-selected, ready to rename
4. The duplicate is `draft` regardless of the original's status
5. All content blocks from the original appear in the duplicate (text, video, image, gallery blocks)
6. Resources are NOT copied
7. Clicking the duplicate button does not trigger the row's select/edit action
8. The original lesson is undisturbed and still opens normally
