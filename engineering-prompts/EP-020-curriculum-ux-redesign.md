# EP-020 Engineering Prompt — Curriculum UX Redesign

**Status:** Ready for Engineering  
**Date:** 2026-06-25  
**Depends on:** Protected Courses Phase 1 (migrations 025/026 deployed)  
**No database migration required.**

---

## Objective

Fix two UX problems in the Curriculum tab:

1. **Both the Add Module and Add Lesson forms show simultaneously** in the right panel at all times when no lesson is selected. The right panel should show exactly one form at a time, triggered by a specific action, and be empty by default.

2. **Creating a lesson requires a second pass** to add content blocks. The new Add Lesson form should include an inline block builder so the mentor can add all content in one step before submitting.

---

## Pre-Implementation Investigation

Read these files before writing any code and report findings:

1. `components/course-tabs/curriculum-tab.tsx` — confirm `addingLesson: boolean` state (line 90). Confirm the header "+ Add module" button calls `setAddingLesson(false)` (line 133). Confirm the bottom "+ Add module" row also calls `setAddingLesson(false)` (line 228). Confirm the inline "+ Add lesson" row calls `setAddingLesson(true)` and `setSelectedLesson(null)` (lines 204–205). Confirm the "+ Add block" button inside the blocks panel calls `setAddingLesson(true)` (line 248). Confirm the right panel is controlled by `selectedLessonData && !addingLesson` ternary (line 237).

2. `components/course-detail-manager.tsx` — confirm `createLesson(fd: FormData)` function exists (line ~149) and calls `/api/courses/${course.id}/lessons`. Confirm `createLesson={createLesson}` is passed to `CurriculumTab` (line ~323). Confirm a `call()` helper exists for fetch calls.

3. `app/api/courses/[courseId]/lessons/route.ts` — confirm current POST body schema (no `blocks` field). Confirm it uses `context.supabase` (not admin client). Confirm it returns `{ lessonId: data.id }`.

Report exact line numbers for all items above before touching any file.

---

## Shared Type: `LessonWithBlocksInput`

Define this type in `lib/courses.ts` (alongside existing course types). It is used by both `CurriculumTab` and `AddLessonPanel`.

```typescript
export interface LessonBlockInput {
  blockType: "rich_text" | "video" | "pdf" | "image" | "gallery" | "link";
  sortOrder: number;
  mediaId?: string | null;
  galleryMediaIds?: string[];
  text?: string;
  url?: string;
  label?: string;
  caption?: string;
  isRequired?: boolean;
}

export interface LessonWithBlocksInput {
  moduleId: string;
  title: string;
  description?: string | null;
  status: "draft" | "published";
  sortOrder: number;
  durationSeconds?: number | null;
  isRequired: boolean;
  blocks: LessonBlockInput[];
}
```

---

## Change 1 — `app/api/courses/[courseId]/lessons/route.ts`

Extend the Zod schema and POST handler to accept an optional `blocks` array.

### Updated schema

```typescript
const blockSchema = z.object({
  blockType: z.enum(["rich_text", "video", "pdf", "image", "gallery", "link"]),
  sortOrder: z.number().int().min(0).max(100000),
  mediaId: z.string().uuid().nullable().optional(),
  galleryMediaIds: z.array(z.string().uuid()).optional().default([]),
  text: z.string().max(50000).optional(),
  url: z.string().url().max(2000).optional(),
  label: z.string().max(200).optional(),
  caption: z.string().max(500).optional(),
  isRequired: z.boolean().default(false),
});

const schema = z.object({
  moduleId: z.string().uuid(),
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(1200).nullable().optional(),
  durationSeconds: z.number().int().positive().max(86400).nullable().optional(),
  status: z.enum(["draft", "published", "archived"]),
  sortOrder: z.number().int().min(0).max(100000),
  isRequired: z.boolean().default(true),
  blocks: z.array(blockSchema).max(50).optional().default([]),
});
```

### Updated POST handler

After the existing lesson insert succeeds, if `blocks` is non-empty:

1. **Validate media tenant isolation.** Collect all non-null `mediaId` values and all `galleryMediaIds` across all blocks. If there are any, query:
   ```typescript
   const allMediaIds = [
     ...blocks.flatMap(b => b.mediaId ? [b.mediaId] : []),
     ...blocks.flatMap(b => b.galleryMediaIds ?? []),
   ];
   if (allMediaIds.length > 0) {
     const { count } = await context.supabase
       .from("course_media")
       .select("id", { count: "exact", head: true })
       .in("id", allMediaIds)
       .eq("trader_id", context.traderId);
     if (count !== allMediaIds.length) {
       // Rollback: delete the lesson we just created
       await context.supabase.from("lessons").delete().eq("id", data.id);
       return NextResponse.json(
         { error: "One or more media assets do not belong to this workspace." },
         { status: 400 }
       );
     }
   }
   ```

2. **Insert each block** using `context.supabase` (not admin). For each block:
   ```typescript
   const { data: block, error: blockError } = await context.supabase
     .from("lesson_content_blocks")
     .insert({
       lesson_id: data.id,
       trader_id: context.traderId,
       block_type: block.blockType,
       sort_order: block.sortOrder,
       media_id: block.mediaId ?? null,
       content: buildContent(block),
       is_required: block.isRequired ?? false,
     })
     .select("id")
     .single();
   ```

   Where `buildContent` returns:
   ```typescript
   function buildContent(block: LessonBlockInput) {
     if (block.blockType === "rich_text") return { html: block.text ?? "" };
     if (block.blockType === "link") return { url: block.url ?? "", label: block.label ?? "" };
     return { caption: block.caption ?? "" };
   }
   ```

3. **For gallery blocks**, after inserting the block row, insert each `galleryMediaId` into `lesson_content_block_media`:
   ```typescript
   for (const [i, mediaId] of (block.galleryMediaIds ?? []).entries()) {
     await context.supabase.from("lesson_content_block_media").insert({
       block_id: block.id,
       media_id: mediaId,
       sort_order: i,
     });
   }
   ```

4. **On any block insert error**, delete the lesson (best-effort rollback) and return 400.

5. **Return** `{ lessonId: data.id, blockCount: blocks.length }` with status 201.

---

## Change 2 — `components/course-detail-manager.tsx`

### 2a — Add `createLessonWithBlocks` function

Add this function alongside the existing `createModule` and `createLesson` functions:

```typescript
async function createLessonWithBlocks(lesson: LessonWithBlocksInput) {
  await call(`/api/courses/${course.id}/lessons`, lesson);
}
```

Import `LessonWithBlocksInput` from `@/lib/courses`.

### 2b — Update prop pass-through to `CurriculumTab`

```typescript
// REMOVE:
createLesson={createLesson}

// ADD:
createLessonWithBlocks={createLessonWithBlocks}
```

The existing `createLesson` function can be kept or removed — it is no longer used by `CurriculumTab`. Remove it to avoid dead code.

---

## Change 3 — `components/course-tabs/curriculum-tab.tsx`

### 3a — State

Replace:
```typescript
const [addingLesson, setAddingLesson] = useState(false);
```

With:
```typescript
const [activePanel, setActivePanel] = useState<"add_module" | "add_lesson" | "add_block" | null>(null);
const [pendingModuleId, setPendingModuleId] = useState<string | null>(null);
```

Remove all references to `addingLesson` and `setAddingLesson`.

### 3b — Props

Remove `createLesson` from the Props interface. Add `createLessonWithBlocks`:

```typescript
// REMOVE:
createLesson: (fd: FormData) => Promise<void>;

// ADD:
createLessonWithBlocks: (lesson: LessonWithBlocksInput) => Promise<void>;
```

Import `LessonWithBlocksInput` from `@/lib/courses`.

### 3c — `selectLesson` helper

Add a helper to clear `activePanel` when selecting a lesson:

```typescript
function selectLesson(id: string | null) {
  setSelectedLesson(id);
  setActivePanel(null);
}
```

### 3d — Form submission handlers

Convert the server-action `action=` forms to client-side `onSubmit` handlers so `activePanel` can be reset on success:

```typescript
async function handleCreateModule(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  await createModule(fd);
  setActivePanel(null);
  e.currentTarget.reset();
}

async function handleCreateLessonWithBlocks(lesson: LessonWithBlocksInput) {
  await createLessonWithBlocks(lesson);
  setActivePanel(null);
  setPendingModuleId(null);
}

async function handleAddBlock(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  await addBlock(fd);
  setActivePanel(null);
  e.currentTarget.reset();
}
```

### 3e — Left panel trigger wiring

**Header "+ Add module" button** (currently `onClick={() => setAddingLesson(false)}`):
```typescript
onClick={() => {
  setActivePanel("add_module");
  setSelectedLesson(null);
}}
```

**Bottom "+ Add module" row** (same handler as above):
```typescript
onClick={() => {
  setActivePanel("add_module");
  setSelectedLesson(null);
}}
```

**Inline "+ Add lesson" row under each module** (currently `setAddingLesson(true)`):
```typescript
onClick={() => {
  setActivePanel("add_lesson");
  setPendingModuleId(module.id);
  setSelectedLesson(null);
}}
```
Also update the `onKeyDown` handler on the same element to match.

**Lesson row click** (currently `setSelectedLesson(lesson.id)`):
```typescript
onClick={() => selectLesson(lesson.id)}
```
Also update the `onKeyDown` handler.

**"+ Add block" button in the blocks panel header** (currently `setAddingLesson(true)` at line ~248):
```typescript
onClick={() => setActivePanel("add_block")}
```

### 3f — Right panel render logic

Replace the entire `{selectedLessonData && !addingLesson ? (...) : (...)}` ternary (lines 237–494) with:

```tsx
<div className={styles.formStack}>
  {/* Default empty state */}
  {activePanel === null && !selectedLesson && (
    <div className={styles.panelEmpty}>
      <p>Select a lesson to edit, or use <strong>+ Add module</strong> to begin.</p>
    </div>
  )}

  {/* Add Module form */}
  {activePanel === "add_module" && (
    <form onSubmit={handleCreateModule} className={styles.panel}>
      <h3><Plus size={15} /> Add module</h3>
      {/* existing Add Module form fields — title, description, status, sortOrder, isRequired — no change */}
    </form>
  )}

  {/* Add Lesson form — comprehensive */}
  {activePanel === "add_lesson" && (
    <AddLessonPanel
      modules={modules}
      defaultModuleId={pendingModuleId}
      readyMedia={readyMedia}
      busy={busy}
      onSubmit={handleCreateLessonWithBlocks}
    />
  )}

  {/* Lesson blocks view */}
  {activePanel !== "add_module" && activePanel !== "add_lesson" && selectedLesson && selectedLessonData && (
    <>
      <div className={styles.blocksPanel}>
        <div className={styles.blocksPanelHeader}>
          <div className={styles.blocksPanelTitle}>
            <p>{selectedModule?.title ?? "Module"}</p>
            <h4>{selectedLessonData.title}</h4>
          </div>
          <button
            className={styles.ghostBtn}
            disabled={busy}
            onClick={() => setActivePanel("add_block")}
            type="button"
          >
            <Plus size={12} /> Add block
          </button>
        </div>
        {/* existing block rows — no change */}
      </div>

      {/* Add Block form */}
      {activePanel === "add_block" && (
        <form onSubmit={handleAddBlock} className={styles.panel}>
          {/* existing Add Block form fields — no change */}
        </form>
      )}
    </>
  )}
</div>
```

The Add Module form body and Add Block form body are identical to their current implementations — only the wrapper logic changes.

---

## Change 4 — New component: `components/course-tabs/add-lesson-panel.tsx`

```typescript
"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { LessonBlockInput, LessonWithBlocksInput } from "@/lib/courses";
import styles from "../course-detail-manager.module.css";

type Media = { id: string; title: string; media_type: "video" | "pdf" | "image"; processing_state: string };
type Module = { id: string; title: string };

interface AddLessonPanelProps {
  modules: Module[];
  defaultModuleId: string | null;
  readyMedia: Media[];
  busy: boolean;
  onSubmit: (lesson: LessonWithBlocksInput) => Promise<void>;
}
```

**Section 1 — Lesson info fields:**
- Module `<select>` pre-selected to `defaultModuleId` (if `defaultModuleId` is null, no pre-selection)
- Title `<input required>`
- Description `<textarea>`
- Status `<select>` — Draft / Published
- Order `<input type="number" defaultValue={0}>`
- Duration in minutes `<input type="number">` — multiply by 60 to get `durationSeconds` on submit
- Required `<input type="checkbox" defaultChecked>`

**Section 2 — Inline block builder:**

Local state:
```typescript
const [blocks, setBlocks] = useState<LessonBlockInput[]>([]);
```

Chip row: `+ Written text`, `+ Video`, `+ PDF`, `+ Image`, `+ Gallery`, `+ Link` — each appends a new block with the correct `blockType` and `sortOrder = blocks.length`.

Each block renders as a card with:
- A heading showing the block type label
- A "Remove" button (`onClick` splices the block from the array, renumbers `sortOrder`)
- Type-specific fields:
  - `rich_text`: `<textarea>` for content body → stored in block `text`
  - `video`: `<select>` from `readyMedia.filter(m => m.media_type === "video")` → stored in block `mediaId`
  - `pdf`: `<select>` from `readyMedia.filter(m => m.media_type === "pdf")` → stored in block `mediaId`
  - `image`: `<select>` from `readyMedia.filter(m => m.media_type === "image")` → stored in block `mediaId`
  - `gallery`: `<select multiple>` from `readyMedia.filter(m => m.media_type === "image")` → stored in block `galleryMediaIds`
  - `link`: URL `<input type="url">` + Label `<input>` → stored in block `url` and `label`

File upload is deferred to Phase 2. Media Library picker is the only media input in this EP.

**Submit handler:**
```typescript
async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const durationMinutes = Number(fd.get("durationMinutes")) || null;
  await onSubmit({
    moduleId: String(fd.get("moduleId")),
    title: String(fd.get("title")),
    description: String(fd.get("description")) || null,
    status: fd.get("status") as "draft" | "published",
    sortOrder: Number(fd.get("sortOrder")),
    durationSeconds: durationMinutes ? durationMinutes * 60 : null,
    isRequired: fd.get("isRequired") === "on",
    blocks,
  });
}
```

---

## Change 5 — CSS: `course-detail-manager.module.css`

Add at the end of the file:

```css
.panelEmpty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  color: var(--color-text-tertiary);
  font-size: 13px;
  text-align: center;
}
```

---

## What Is NOT Changing

- Existing lesson blocks view (click a lesson in the tree → see its blocks).
- Add Block form fields.
- `patchCurriculum` status-change selects on module/lesson rows.
- Module collapse/expand behaviour.
- All API endpoints except the lesson POST (extended, not replaced).
- `/api/lessons/[lessonId]/blocks` — still used by the Add Block form.
- RLS, tenant isolation, `can_access_course`.
- Student-side learning views.

---

## Acceptance Criteria

Test in a KaiTrades browser session.

1. Opening the Curriculum tab shows the right panel empty. No forms are visible.
2. Clicking "+ Add module" (header button) shows ONLY the Add Module form. No lesson form visible.
3. Clicking "+ Add module" (bottom row) shows ONLY the Add Module form. Same behaviour.
4. Submitting the Add Module form creates the module, right panel returns to empty, new module appears in left tree.
5. Clicking "+ Add lesson" under a module shows ONLY the comprehensive Add Lesson form, with that module pre-selected.
6. The Add Lesson form has: module selector, title, description, status, order, duration (minutes), required toggle, and chip row: `+ Written text`, `+ Video`, `+ PDF`, `+ Image`, `+ Gallery`, `+ Link`.
7. Clicking a chip appends a block card. Clicking "Remove" removes it. Block count in the list matches what was added.
8. Submitting the Add Lesson form with blocks creates the lesson and all blocks in one API call. Right panel returns to empty. New lesson appears in the left tree under its module.
9. Clicking a lesson in the tree shows the blocks panel (unchanged). Neither the Add Module nor Add Lesson form is visible.
10. Clicking "+ Add block" inside the blocks panel shows ONLY the Add Block form alongside the blocks panel. No other form visible.
11. Submitting the Add Block form adds the block, Add Block form disappears, blocks panel remains.
12. At no point are two independent forms simultaneously visible in the right panel.
13. `npm run typecheck` passes with no new errors.
14. `npm run build` completes cleanly.
15. Existing acceptance runner passes without modification.

---

## Final Delivery Summary from Engineering

Engineering must confirm:

1. Pre-implementation investigation findings (exact lines for all items listed).
2. `LessonWithBlocksInput` and `LessonBlockInput` types added to `lib/courses.ts`.
3. Lesson POST API extended: `blocks` schema, media tenant validation, block inserts, gallery media inserts, rollback on failure.
4. `course-detail-manager.tsx`: `createLessonWithBlocks` added, passed to `CurriculumTab`, `createLesson` removed.
5. `CurriculumTab`: `addingLesson` removed; `activePanel` / `pendingModuleId` added; all five trigger sites updated (header add-module, bottom add-module, add-lesson row, lesson row click, add-block button); right panel render logic replaced.
6. `AddLessonPanel` component created with lesson info fields + inline block builder.
7. `panelEmpty` CSS class added.
8. Acceptance criteria 1–15 verified in KaiTrades browser session.
9. Commit hash and files changed.
