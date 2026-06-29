# EP-023 — Lesson Block Editor

**Status:** Ready for Engineering  
**Architect:** KaiMentors Enterprise Architect  
**Date:** 2026-06-26  
**Scope:** 2 new files + 2 modified files  
**Migration required:** No  
**API changes:** New `GET` and `PATCH` handlers on `/api/courses/[courseId]/lessons/[lessonId]`

---

## Objective

Mentors can currently create a lesson with blocks but cannot edit or remove them after the fact. This EP replaces the primitive "Add block" dropdown form in the Curriculum tab with a full `EditLessonPanel` — a rich edit surface that pre-populates all existing lesson metadata and blocks, allows adding/removing blocks using `MediaBlockUploader`, and saves via a new PATCH endpoint that fully replaces the block set.

The `activePanel === "add_block"` flow and the `addBlock` server action are **removed**. The `blocksPanel` read-only view is **removed**. Clicking any lesson row in the tree now opens the `EditLessonPanel` directly.

---

## Pre-investigation

Read these files in full before making any changes:

- `app/api/courses/[courseId]/lessons/route.ts` (reuse `blockSchema` and `buildContent`)
- `components/course-tabs/add-lesson-panel.tsx` (model the EditLessonPanel on this)
- `components/course-tabs/curriculum-tab.tsx`
- `components/course-detail-manager.tsx`

Verify:
- `addBlock` in `CourseDetailManager` calls `POST /api/lessons/${selectedLesson}/blocks` — this endpoint can remain untouched; we are only removing the UI path to it
- `CurriculumTab.Props` currently includes `addBlock: (fd: FormData) => Promise<void>` — this prop is removed in this EP
- `activePanel` type is currently `"add_module" | "add_lesson" | "add_block" | null` — extended to include `"edit_lesson"`
- The `blockSchema` and `buildContent` function in `lessons/route.ts` are reused verbatim in the new PATCH endpoint

---

## File 1 — New API route

### `app/api/courses/[courseId]/lessons/[lessonId]/route.ts` *(new file)*

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMentorCourseContext } from "@/lib/course-access";

// ── Shared schemas (identical to lessons/route.ts) ────────────────────────────

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

const patchSchema = z.object({
  moduleId: z.string().uuid(),
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(1200).nullable().optional(),
  durationSeconds: z.number().int().positive().max(86400).nullable().optional(),
  status: z.enum(["draft", "published", "archived"]),
  sortOrder: z.number().int().min(0).max(100000),
  isRequired: z.boolean().default(true),
  blocks: z.array(blockSchema).max(50).optional().default([]),
});

function buildContent(block: z.infer<typeof blockSchema>) {
  if (block.blockType === "rich_text") return { html: block.text ?? "" };
  if (block.blockType === "link") return { url: block.url ?? "", label: block.label ?? "" };
  return { caption: block.caption ?? "" };
}

// ── GET /api/courses/[courseId]/lessons/[lessonId] ────────────────────────────
// Returns full lesson + blocks (with content + gallery media IDs) for the edit panel.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ courseId: string; lessonId: string }> },
) {
  const { courseId, lessonId } = await params;
  const context = await requireMentorCourseContext();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const { data: lesson } = await context.supabase
    .from("lessons")
    .select(
      "id,module_id,title,description,status,sort_order,duration_seconds,is_required,published_at," +
      "blocks:lesson_content_blocks(id,block_type,sort_order,is_required,media_id,content," +
        "gallery:lesson_content_block_media(media_id,sort_order))",
    )
    .eq("id", lessonId)
    .eq("course_id", courseId)
    .eq("trader_id", context.traderId)
    .maybeSingle();

  if (!lesson) return NextResponse.json({ error: "Lesson not found." }, { status: 404 });

  type RawBlock = {
    id: string;
    block_type: string;
    sort_order: number;
    is_required: boolean;
    media_id: string | null;
    content: Record<string, unknown> | null;
    gallery: Array<{ media_id: string; sort_order: number }> | null;
  };

  const blocks = ((lesson.blocks ?? []) as RawBlock[])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((b) => ({
      blockType: b.block_type,
      sortOrder: b.sort_order,
      isRequired: b.is_required,
      mediaId: b.media_id ?? null,
      galleryMediaIds: (b.gallery ?? [])
        .sort((x, y) => x.sort_order - y.sort_order)
        .map((g) => g.media_id),
      text: b.block_type === "rich_text" ? ((b.content?.html as string) ?? null) : null,
      url: b.block_type === "link" ? ((b.content?.url as string) ?? null) : null,
      label: b.block_type === "link" ? ((b.content?.label as string) ?? null) : null,
      caption: ["image", "pdf", "video", "gallery"].includes(b.block_type)
        ? ((b.content?.caption as string) ?? null)
        : null,
    }));

  return NextResponse.json({
    id: lesson.id,
    moduleId: lesson.module_id,
    title: lesson.title,
    description: lesson.description,
    status: lesson.status,
    sortOrder: lesson.sort_order,
    durationSeconds: lesson.duration_seconds,
    isRequired: lesson.is_required,
    publishedAt: lesson.published_at,
    blocks,
  });
}

// ── PATCH /api/courses/[courseId]/lessons/[lessonId] ──────────────────────────
// Updates lesson metadata and fully replaces its block set.

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ courseId: string; lessonId: string }> },
) {
  const { courseId, lessonId } = await params;
  const context = await requireMentorCourseContext();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid lesson details." }, { status: 400 });

  // Confirm lesson belongs to this trader and course
  const { data: existing } = await context.supabase
    .from("lessons")
    .select("id,published_at")
    .eq("id", lessonId)
    .eq("course_id", courseId)
    .eq("trader_id", context.traderId)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Lesson not found." }, { status: 404 });

  // Confirm new module belongs to this trader and course (allows moving lesson between modules)
  const { data: mod } = await context.supabase
    .from("course_modules")
    .select("id")
    .eq("id", parsed.data.moduleId)
    .eq("course_id", courseId)
    .eq("trader_id", context.traderId)
    .maybeSingle();
  if (!mod) return NextResponse.json({ error: "Module not found." }, { status: 404 });

  // Validate all referenced media IDs belong to this trader (before touching any data)
  const blocks = parsed.data.blocks;
  if (blocks.length > 0) {
    const allMediaIds = [
      ...blocks.flatMap((b) => (b.mediaId ? [b.mediaId] : [])),
      ...blocks.flatMap((b) => b.galleryMediaIds ?? []),
    ];
    if (allMediaIds.length > 0) {
      const { count } = await context.supabase
        .from("course_media")
        .select("id", { count: "exact", head: true })
        .in("id", allMediaIds)
        .eq("trader_id", context.traderId);
      if (count !== allMediaIds.length) {
        return NextResponse.json(
          { error: "One or more media assets do not belong to this workspace." },
          { status: 400 },
        );
      }
    }
  }

  // Determine published_at: preserve original if already published; set now if first publish; clear if unpublished
  const existingPublishedAt = (existing as { id: string; published_at: string | null }).published_at;
  const publishedAt =
    parsed.data.status === "published"
      ? (existingPublishedAt ?? new Date().toISOString())
      : null;

  // Update lesson metadata
  const { error: updateError } = await context.supabase
    .from("lessons")
    .update({
      module_id: mod.id,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      duration_seconds: parsed.data.durationSeconds ?? null,
      status: parsed.data.status,
      sort_order: parsed.data.sortOrder,
      is_required: parsed.data.isRequired,
      published_at: publishedAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lessonId)
    .eq("trader_id", context.traderId);

  if (updateError) return NextResponse.json({ error: "Lesson could not be updated." }, { status: 400 });

  // Replace block set: delete existing, insert new
  await context.supabase
    .from("lesson_content_block_media")
    .delete()
    .eq("lesson_id", lessonId)
    .eq("trader_id", context.traderId);

  await context.supabase
    .from("lesson_content_blocks")
    .delete()
    .eq("lesson_id", lessonId)
    .eq("trader_id", context.traderId);

  for (const block of blocks) {
    const { data: blockData, error: blockError } = await context.supabase
      .from("lesson_content_blocks")
      .insert({
        lesson_id: lessonId,
        course_id: courseId,
        trader_id: context.traderId,
        created_by: context.user.id,
        block_type: block.blockType,
        sort_order: block.sortOrder,
        media_id: block.mediaId ?? null,
        content: buildContent(block),
        is_required: block.isRequired ?? false,
      })
      .select("id")
      .single();

    if (blockError || !blockData) {
      return NextResponse.json(
        { error: "A content block could not be saved. The lesson metadata was updated but blocks may be incomplete." },
        { status: 400 },
      );
    }

    if (block.blockType === "gallery") {
      for (const [i, mediaId] of (block.galleryMediaIds ?? []).entries()) {
        await context.supabase.from("lesson_content_block_media").insert({
          block_id: blockData.id,
          trader_id: context.traderId,
          course_id: courseId,
          lesson_id: lessonId,
          media_id: mediaId,
          sort_order: i,
        });
      }
    }
  }

  return NextResponse.json({ lessonId, blockCount: blocks.length });
}
```

---

## File 2 — New `EditLessonPanel` component

### `components/course-tabs/edit-lesson-panel.tsx` *(new file)*

Model this file on `add-lesson-panel.tsx`. Key differences:
- On mount, fetches the lesson via `GET /api/courses/${courseId}/lessons/${lessonId}`
- Pre-populates all form fields and block state from the fetch result
- Submit calls `onSubmit(lessonId, lesson)` (PATCH semantics) instead of `onSubmit(lesson)` (POST)
- Has a **Cancel** button that calls `onCancel()`
- Submit button label: **"Save changes"** (not "Create lesson")
- Shows a loading state while fetching, an error state if fetch fails

```typescript
"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, X } from "lucide-react";
import type { LessonBlockInput, LessonWithBlocksInput } from "@/lib/courses";
import { MediaBlockUploader } from "@/components/media-block-uploader";
import { MediaBlockGalleryUploader } from "@/components/media-block-gallery-uploader";
import styles from "../course-detail-manager.module.css";

type Media = { id: string; title: string; media_type: "video" | "pdf" | "image"; processing_state: string };
type Module = { id: string; title: string };

interface FetchedLesson {
  id: string;
  moduleId: string;
  title: string;
  description: string | null;
  status: "draft" | "published" | "archived";
  sortOrder: number;
  durationSeconds: number | null;
  isRequired: boolean;
  blocks: LessonBlockInput[];
}

interface EditLessonPanelProps {
  courseId: string;
  lessonId: string;
  modules: Module[];
  readyMedia: Media[];
  busy: boolean;
  onSubmit: (lessonId: string, lesson: LessonWithBlocksInput) => Promise<void>;
  onCancel: () => void;
}

const BLOCK_TYPE_LABELS: Record<LessonBlockInput["blockType"], string> = {
  rich_text: "Written text",
  video: "Video",
  pdf: "PDF",
  image: "Image",
  gallery: "Gallery",
  link: "Link",
};

const BLOCK_TYPES = ["rich_text", "video", "pdf", "image", "gallery", "link"] as const;
```

**Component state and fetch logic:**

```typescript
export function EditLessonPanel({
  courseId,
  lessonId,
  modules,
  readyMedia,
  busy,
  onSubmit,
  onCancel,
}: EditLessonPanelProps) {
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [initialData, setInitialData] = useState<FetchedLesson | null>(null);
  const [blocks, setBlocks] = useState<LessonBlockInput[]>([]);
  const [uploadingBlocks, setUploadingBlocks] = useState<Set<number>>(new Set());

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFetchError(null);
    setInitialData(null);
    setBlocks([]);
    fetch(`/api/courses/${courseId}/lessons/${lessonId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data: FetchedLesson) => {
        if (!active) return;
        setInitialData(data);
        setBlocks(data.blocks);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setFetchError("Could not load lesson details. Please try again.");
        setLoading(false);
      });
    return () => { active = false; };
  }, [courseId, lessonId]);
```

**Block management functions** — identical to `AddLessonPanel`:
- `appendBlock(blockType)` — appends to blocks state with `sortOrder: blocks.length`
- `removeBlock(index)` — removes and re-indexes
- `updateBlock(index, updates)` — merges partial updates
- `handleUploadStateChange(key, uploading)` — manages uploadingBlocks set

**Submit handler:**

```typescript
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!initialData) return;
    const fd = new FormData(e.currentTarget);
    const durationMinutes = Number(fd.get("durationMinutes")) || null;
    await onSubmit(lessonId, {
      moduleId: String(fd.get("moduleId")),
      title: String(fd.get("title")),
      description: String(fd.get("description")) || null,
      status: fd.get("status") as "draft" | "published" | "archived",
      sortOrder: Number(fd.get("sortOrder")),
      durationSeconds: durationMinutes ? durationMinutes * 60 : null,
      isRequired: fd.get("isRequired") === "on",
      blocks,
    });
  }
```

**Render — loading / error states:**

```tsx
  if (loading) {
    return (
      <div className={styles.panel}>
        <p className={styles.panelLoading}>Loading lesson…</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className={styles.panel}>
        <p className={styles.panelError}>{fetchError}</p>
        <button className={styles.ghostBtn} onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
    );
  }

  if (!initialData) return null;
```

**Render — main form:**

Use `key={initialData.id}` on the `<form>` so that if the user switches to editing a different lesson, the uncontrolled inputs reset their `defaultValue`. Use `defaultValue` for all metadata fields (title, description, status, sort order, duration, required, moduleId) — these are derived from `initialData`. The blocks list is fully controlled via `blocks` state.

```tsx
  const videos = readyMedia.filter((m) => m.media_type === "video");
  const pdfs = readyMedia.filter((m) => m.media_type === "pdf");
  const images = readyMedia.filter((m) => m.media_type === "image");
  const durationMinutesDefault = initialData.durationSeconds
    ? Math.round(initialData.durationSeconds / 60) || ""
    : "";

  return (
    <form key={initialData.id} onSubmit={handleSubmit} className={styles.panel}>
      <div className={styles.panelTitleRow}>
        <h3><Pencil size={15} /> Edit lesson</h3>
        <button className={styles.iconBtn} onClick={onCancel} type="button" aria-label="Cancel editing">
          <X size={15} />
        </button>
      </div>

      <label>
        Module
        <select name="moduleId" required defaultValue={initialData.moduleId}>
          {modules.map((m) => (
            <option key={m.id} value={m.id}>{m.title}</option>
          ))}
        </select>
      </label>
      <label>
        Title
        <input name="title" required defaultValue={initialData.title} />
      </label>
      <label>
        Description
        <textarea name="description" defaultValue={initialData.description ?? ""} />
      </label>
      <div className={styles.columns}>
        <label>
          Status
          <select name="status" defaultValue={initialData.status}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <label>
          Order
          <input defaultValue={initialData.sortOrder} min="0" name="sortOrder" type="number" />
        </label>
      </div>
      <label>
        Duration (minutes)
        <input
          defaultValue={durationMinutesDefault}
          min="1"
          name="durationMinutes"
          type="number"
        />
      </label>
      <label className={styles.check}>
        <input
          defaultChecked={initialData.isRequired}
          name="isRequired"
          type="checkbox"
        />{" "}
        Required
      </label>

      {/* Block type chips */}
      <div className={styles.blockChips}>
        {BLOCK_TYPES.map((type) => (
          <button
            className={styles.chipBtn}
            key={type}
            onClick={() => appendBlock(type)}
            type="button"
          >
            + {BLOCK_TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      {/* Block list — identical render logic to AddLessonPanel */}
      {blocks.map((block, index) => (
        <div className={styles.blockCard} key={index}>
          <div className={styles.blockCardHeader}>
            <strong>{BLOCK_TYPE_LABELS[block.blockType]}</strong>
            <button
              className={styles.removeBtn}
              onClick={() => removeBlock(index)}
              type="button"
            >
              <X size={12} /> Remove
            </button>
          </div>

          {block.blockType === "rich_text" && (
            <label>
              Content
              <textarea
                onChange={(e) => updateBlock(index, { text: e.target.value })}
                placeholder="Enter written content…"
                value={block.text ?? ""}
              />
            </label>
          )}

          {block.blockType === "video" && (
            <MediaBlockUploader
              availableMedia={videos}
              mediaType="video"
              onChange={(mediaId) => updateBlock(index, { mediaId })}
              onUploadStateChange={(uploading) => handleUploadStateChange(index, uploading)}
              value={block.mediaId ?? null}
            />
          )}

          {block.blockType === "pdf" && (
            <MediaBlockUploader
              availableMedia={pdfs}
              mediaType="pdf"
              onChange={(mediaId) => updateBlock(index, { mediaId })}
              onUploadStateChange={(uploading) => handleUploadStateChange(index, uploading)}
              value={block.mediaId ?? null}
            />
          )}

          {block.blockType === "image" && (
            <MediaBlockUploader
              availableMedia={images}
              mediaType="image"
              onChange={(mediaId) => updateBlock(index, { mediaId })}
              onUploadStateChange={(uploading) => handleUploadStateChange(index, uploading)}
              value={block.mediaId ?? null}
            />
          )}

          {block.blockType === "gallery" && (
            <MediaBlockGalleryUploader
              availableImages={images}
              onChange={(ids) => updateBlock(index, { galleryMediaIds: ids })}
              onUploadStateChange={(slotIndex, uploading) =>
                handleUploadStateChange(index * 1000 + slotIndex, uploading)
              }
              value={block.galleryMediaIds ?? []}
            />
          )}

          {block.blockType === "link" && (
            <>
              <label>
                URL
                <input
                  onChange={(e) => updateBlock(index, { url: e.target.value })}
                  placeholder="https://…"
                  type="url"
                  value={block.url ?? ""}
                />
              </label>
              <label>
                Label
                <input
                  onChange={(e) => updateBlock(index, { label: e.target.value })}
                  placeholder="Link text"
                  value={block.label ?? ""}
                />
              </label>
            </>
          )}
        </div>
      ))}

      <div className={styles.panelActions}>
        <button
          disabled={busy || !modules.length || uploadingBlocks.size > 0}
          type="submit"
        >
          Save changes{blocks.length > 0 ? ` · ${blocks.length} block${blocks.length === 1 ? "" : "s"}` : ""}
        </button>
        <button className={styles.ghostBtn} onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
    </form>
  );
}
```

---

## File 3 — Modified `CurriculumTab`

### `components/course-tabs/curriculum-tab.tsx`

**Summary of changes:**
1. Add `"edit_lesson"` to the `activePanel` type
2. Remove `addBlock` from `Props` interface
3. Add `updateLessonWithBlocks: (lessonId: string, lesson: LessonWithBlocksInput) => Promise<void>` to `Props`
4. Import `EditLessonPanel`
5. Remove `GripVertical` import (no longer used in the blocks panel)
6. Change `selectLesson()` to set `activePanel = "edit_lesson"` instead of `null`
7. Add `handleUpdateLesson` function
8. Replace the entire `blocksPanel` + `add_block` render block with a single `EditLessonPanel` render
9. Add CSS class `styles.panelTitleRow` usage (already in `EditLessonPanel` — check that the class exists in `course-detail-manager.module.css`; add it if missing)

**Exact changes:**

### activePanel type (line ~90)

**Before:**
```typescript
const [activePanel, setActivePanel] = useState<"add_module" | "add_lesson" | "add_block" | null>(null);
```

**After:**
```typescript
const [activePanel, setActivePanel] = useState<"add_module" | "add_lesson" | "edit_lesson" | null>(null);
```

### Props interface

**Before:**
```typescript
interface Props {
  course: { id: string; title: string };
  ...
  addBlock: (fd: FormData) => Promise<void>;
  patchCurriculum: (payload: CurriculumPatch) => Promise<void>;
}
```

**After:**
```typescript
interface Props {
  course: { id: string; title: string };
  ...
  updateLessonWithBlocks: (lessonId: string, lesson: LessonWithBlocksInput) => Promise<void>;
  patchCurriculum: (payload: CurriculumPatch) => Promise<void>;
}
```

(Remove `addBlock`, add `updateLessonWithBlocks`.)

### Destructured prop in function signature

**Before:**
```typescript
export function CurriculumTab({
  modules, lessons, readyMedia, selectedLesson, setSelectedLesson, busy,
  createModule, createLessonWithBlocks, addBlock, patchCurriculum,
}: Props) {
```

**After:**
```typescript
export function CurriculumTab({
  course, modules, lessons, readyMedia, selectedLesson, setSelectedLesson, busy,
  createModule, createLessonWithBlocks, updateLessonWithBlocks, patchCurriculum,
}: Props) {
```

(Add `course`, remove `addBlock`, add `updateLessonWithBlocks`.)

Note: `course` is already in `Props` but was not being destructured before — add it to destructuring since `EditLessonPanel` needs `course.id`.

### `selectLesson` function

**Before:**
```typescript
function selectLesson(id: string | null) {
  setSelectedLesson(id);
  setActivePanel(null);
}
```

**After:**
```typescript
function selectLesson(id: string | null) {
  setSelectedLesson(id);
  setActivePanel(id ? "edit_lesson" : null);
}
```

### Add `handleUpdateLesson` function (after `handleCreateLessonWithBlocks`)

```typescript
async function handleUpdateLesson(lessonId: string, lesson: LessonWithBlocksInput) {
  await updateLessonWithBlocks(lessonId, lesson);
  setActivePanel(null);
  setSelectedLesson(null);
}
```

### Remove `handleAddBlock` function entirely

Delete the `handleAddBlock` function (it's no longer needed):
```typescript
// DELETE this function:
async function handleAddBlock(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  await addBlock(fd);
  setActivePanel(null);
  e.currentTarget.reset();
}
```

### Replace the right-panel render

**Remove the entire block starting from:**
```tsx
{activePanel !== "add_module" && activePanel !== "add_lesson" && selectedLesson && selectedLessonData && (
  <>
    <div className={styles.blocksPanel}>
      ...
    </div>

    {activePanel === "add_block" && (
      <form onSubmit={handleAddBlock} className={styles.panel}>
        ...
      </form>
    )}
  </>
)}
```

**Replace with:**
```tsx
{activePanel === "edit_lesson" && selectedLesson && (
  <EditLessonPanel
    courseId={course.id}
    lessonId={selectedLesson}
    modules={modules}
    readyMedia={readyMedia}
    busy={busy}
    onSubmit={handleUpdateLesson}
    onCancel={() => {
      setActivePanel(null);
      setSelectedLesson(null);
    }}
  />
)}
```

### Update imports

Add `EditLessonPanel` import:
```typescript
import { EditLessonPanel } from "./edit-lesson-panel";
```

Remove `GripVertical` from lucide-react imports (no longer used after removing the blocksPanel drag handle).

---

## File 4 — Modified `CourseDetailManager`

### `components/course-detail-manager.tsx`

**Two changes only:**

### 1 — Add `updateLessonWithBlocks` function (after `createLessonWithBlocks`)

```typescript
async function updateLessonWithBlocks(lessonId: string, lesson: LessonWithBlocksInput) {
  setBusy(true);
  setError("");
  setMessage("");
  const response = await fetch(`/api/courses/${course.id}/lessons/${lessonId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(lesson),
  });
  const payload = await response.json();
  setBusy(false);
  if (!response.ok) {
    setError(payload.error ?? "The lesson could not be updated.");
    return false;
  }
  setMessage("Lesson updated successfully.");
  router.refresh();
  return true;
}
```

Note: this does NOT use the shared `call()` helper because it uses `PATCH` instead of `POST`. Add it as a standalone `async function`.

### 2 — Update `CurriculumTab` props in JSX

**Before:**
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
  addBlock={addBlock}
  patchCurriculum={patchCurriculum}
/>
```

**After:**
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
  patchCurriculum={patchCurriculum}
/>
```

(Remove `addBlock={addBlock}`, add `updateLessonWithBlocks={updateLessonWithBlocks}`.)

The `addBlock` function body in `CourseDetailManager` can be **left in place** — it calls `POST /api/lessons/${selectedLesson}/blocks` which still exists. Removing the function body would just trigger a lint unused-variable warning. Either remove or keep — typecheck will not error either way since the prop was removed from `CurriculumTab`.

---

## CSS additions

### `components/course-detail-manager.module.css`

Check if these classes exist. If any are missing, append them:

```css
/* Edit lesson panel */
.panelTitleRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.panelTitleRow h3 {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  font-size: 14px;
}

.iconBtn {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #6c747a;
  cursor: pointer;
}

.iconBtn:hover {
  background: #e9edef;
  color: #111315;
}

.panelActions {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-top: 4px;
}

.panelActions button[type="submit"] {
  flex: 1;
}

.panelLoading {
  color: #6c747a;
  font-size: 12px;
  padding: 24px 0;
  text-align: center;
}

.panelError {
  color: #dc2626;
  font-size: 12px;
  padding: 24px 0;
  text-align: center;
}
```

---

## Verification

1. Run `pnpm typecheck` — must exit 0. Key checks:
   - `addBlock` is no longer referenced anywhere (remove the function body from `CourseDetailManager` if TypeScript flags it as unused)
   - `GripVertical` is no longer imported in `curriculum-tab.tsx`
   - `EditLessonPanel` props match the interface

2. Test the flow in KaiTrades workspace:
   - Click any lesson in the tree → right panel shows "Loading lesson…" → form appears pre-populated
   - Edit the title, change status → Save → toast "Lesson updated successfully." → tree reflects new title
   - Add a video block to an existing lesson → upload / select from library → Save → refresh → student curriculum shows updated lesson
   - Click Cancel → panel closes, no change
   - Create a new module + lesson → confirm `AddLessonPanel` still works correctly (regression)

3. Run `pnpm build` — must pass clean.

---

## What this does NOT change

- `POST /api/lessons/[lessonId]/blocks` — endpoint still exists but has no UI path; leave it
- `AddLessonPanel` — untouched
- All other tabs in `CourseDetailManager` — untouched
- Student-facing pages — untouched
- No database migration
