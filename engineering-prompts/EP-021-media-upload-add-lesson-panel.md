# EP-021 Engineering Prompt — Media Upload in Add Lesson Panel

**Status:** Ready for Engineering  
**Date:** 2026-06-26  
**Depends on:** EP-020 (Add Lesson panel deployed)  
**No database migration required.**

---

## Objective

Add real file upload to the video, PDF, image, and gallery block cards in `AddLessonPanel`. Currently these blocks show only a library picker dropdown. After this EP, each block card has a drag-and-drop upload zone alongside the library picker — using the same three-step TUS flow that `CourseMediaLibrary` already implements.

The upload flow is extracted into a shared hook so both components use identical logic.

---

## Pre-Implementation Investigation

Read these files and report findings before writing code:

1. `components/course-media-library.tsx` — confirm the three-step upload flow: `POST /api/course-media` → TUS upload → `POST /api/course-media/${mediaId}/finalize`. Confirm `mediaType` is derived from `file.type` at file-selection time (not at component init). Confirm `router.refresh()` is called inside the TUS `onSuccess` callback.

2. `components/course-tabs/add-lesson-panel.tsx` — confirm `updateBlock(index, { mediaId })` is the function for updating a block's media ID. Confirm video/PDF/image blocks currently use `<select>` dropdowns. Confirm gallery blocks use `<select multiple>`. Confirm the submit button is `disabled={busy || !modules.length}`.

3. `components/course-detail-manager.module.css` — confirm `blockCard`, `blockCardHeader`, `removeBtn` classes exist. Confirm there is no existing `dropZone`, `uploadZone`, or similar class.

Report exact findings before touching any file.

---

## Change 1 — `lib/use-media-upload.ts` (new file)

```typescript
import { useState } from "react";
import { Upload } from "tus-js-client";
import { createClient } from "@/lib/supabase/browser";

export type UploadState = "idle" | "uploading" | "ready" | "error";

export interface UseMediaUploadResult {
  state: UploadState;
  progress: number;            // 0–100
  mediaId: string | null;      // set when state === "ready"
  errorMessage: string | null;
  startUpload: (
    file: File,
    mediaType: "video" | "pdf" | "image",
    title?: string,
  ) => Promise<void>;
  reset: () => void;
}

export function useMediaUpload(): UseMediaUploadResult {
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function startUpload(
    file: File,
    mediaType: "video" | "pdf" | "image",
    title?: string,
  ) {
    setState("uploading");
    setProgress(0);
    setMediaId(null);
    setErrorMessage(null);

    const init = await fetch("/api/course-media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title ?? file.name,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        mediaType,
        replacesMediaId: null,
      }),
    });
    const payload = await init.json();
    if (!init.ok) {
      setState("error");
      setErrorMessage(payload.error ?? "Upload could not start.");
      return;
    }

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setState("error");
      setErrorMessage("Your session expired. Sign in and retry.");
      return;
    }

    const upload = new Upload(file, {
      endpoint: payload.uploadUrl,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        "x-upsert": "false",
      },
      metadata: {
        bucketName: payload.bucketName,
        objectName: payload.storagePath,
        contentType: file.type,
        cacheControl: "private, max-age=0",
      },
      chunkSize: 6 * 1024 * 1024,
      removeFingerprintOnSuccess: true,
      onProgress: (sent, total) => setProgress(Math.round((sent / total) * 100)),
      onError: () => {
        setState("error");
        setErrorMessage("Upload paused after repeated network failures. Retry to resume.");
      },
      onSuccess: async () => {
        const final = await fetch(`/api/course-media/${payload.mediaId}/finalize`, {
          method: "POST",
        });
        const result = await final.json();
        if (!final.ok) {
          setState("error");
          setErrorMessage(result.error ?? "Upload verification failed.");
          return;
        }
        setMediaId(payload.mediaId);
        setState("ready");
      },
    });

    const previous = await upload.findPreviousUploads();
    if (previous[0]) upload.resumeFromPreviousUpload(previous[0]);
    upload.start();
  }

  function reset() {
    setState("idle");
    setProgress(0);
    setMediaId(null);
    setErrorMessage(null);
  }

  return { state, progress, mediaId, errorMessage, startUpload, reset };
}
```

**Key design decision:** `mediaType` is a parameter of `startUpload`, not of the hook constructor. This is required for `CourseMediaLibrary` compatibility — the library determines `mediaType` from `file.type` at file-selection time, after the hook is already initialised. A hook whose type is fixed at init cannot serve that use case.

---

## Change 2 — New component: `components/media-block-uploader.tsx`

A self-contained upload + library-picker widget for a single media block.

```typescript
"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, UploadCloud } from "lucide-react";
import { useMediaUpload } from "@/lib/use-media-upload";
import styles from "./media-block-uploader.module.css";

type Media = {
  id: string;
  title: string;
  media_type: "video" | "pdf" | "image";
  processing_state: string;
};

interface MediaBlockUploaderProps {
  mediaType: "video" | "pdf" | "image";
  availableMedia: Media[];
  value: string | null;
  onChange: (mediaId: string | null) => void;
  onUploadStateChange?: (uploading: boolean) => void;
}
```

**Accept attributes by type:**
```typescript
const ACCEPT: Record<"video" | "pdf" | "image", string> = {
  video: "video/mp4,video/webm",
  pdf: "application/pdf",
  image: "image/png,image/jpeg,image/webp",
};
const HINT: Record<"video" | "pdf" | "image", string> = {
  video: "MP4, WebM — up to 500 MB",
  pdf: "PDF — up to 100 MB",
  image: "PNG, JPG, WebP — up to 20 MB",
};
```

**Three display sub-states:**

**Sub-state: idle (no value selected)**
```tsx
<div
  className={`${styles.dropZone} ${dragging ? styles.dragging : ""}`}
  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
  onDragLeave={() => setDragging(false)}
  onDrop={(e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }}
  onClick={() => fileRef.current?.click()}
>
  <UploadCloud size={20} />
  <span>Drop file here or click to browse</span>
  <span className={styles.hint}>{HINT[mediaType]}</span>
  <input
    accept={ACCEPT[mediaType]}
    className={styles.hiddenInput}
    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
    ref={fileRef}
    type="file"
  />
</div>
{availableMedia.length > 0 && (
  <>
    <p className={styles.orDivider}>— or choose from Media Library —</p>
    <select onChange={(e) => { if (e.target.value) onChange(e.target.value); }} defaultValue="">
      <option value="" disabled>Select an existing {mediaType}…</option>
      {availableMedia.map((m) => (
        <option key={m.id} value={m.id}>{m.title}</option>
      ))}
    </select>
  </>
)}
```

**Sub-state: uploading**
```tsx
<div className={styles.uploadingState}>
  <span className={styles.fileName}>{uploadingFileName}</span>
  <div className={styles.progressBar}>
    <span style={{ width: `${progress}%` }} />
  </div>
  <span className={styles.progressLabel}>{progress}% — Uploading…</span>
</div>
```

**Sub-state: ready (value is set — either uploaded or from library)**
```tsx
<div className={styles.readyState}>
  <CheckCircle2 size={16} />
  <span>{readyLabel}</span>
  <button
    className={styles.changeBtn}
    onClick={() => { reset(); onChange(null); }}
    type="button"
  >
    Change ×
  </button>
</div>
```

When `value` is set (e.g., selected from library), show the ready state. `readyLabel` is the media title from `availableMedia.find(m => m.id === value)?.title` or "Selected" if not in the list (i.e., just uploaded).

**`handleFile` function:**
```typescript
async function handleFile(file: File) {
  setUploadingFileName(file.name);
  await startUpload(file, mediaType);
  // mediaId is set via useEffect below when state === "ready"
}
```

**`useEffect` to call `onChange` when upload completes:**
```typescript
useEffect(() => {
  if (state === "ready" && mediaId) {
    onChange(mediaId);
  }
}, [state, mediaId]);
```

**`useEffect` to notify parent of upload state changes:**
```typescript
useEffect(() => {
  onUploadStateChange?.(state === "uploading");
}, [state]);
```

**On error:** show `errorMessage` with a "Retry" button that resets and allows re-selection.

---

## Change 3 — New component: `components/media-block-gallery-uploader.tsx`

Replaces the `<select multiple>` in the gallery block.

```typescript
"use client";

import { Plus } from "lucide-react";
import { MediaBlockUploader } from "./media-block-uploader";
import styles from "./media-block-uploader.module.css";

type Media = { id: string; title: string; media_type: "video" | "pdf" | "image"; processing_state: string };

interface MediaBlockGalleryUploaderProps {
  availableImages: Media[];
  value: string[];
  onChange: (mediaIds: string[]) => void;
  onUploadStateChange?: (index: number, uploading: boolean) => void;
}
```

**Render:** one `MediaBlockUploader` per slot, plus an "+ Add image" button.

```tsx
{value.map((mediaId, i) => (
  <div className={styles.gallerySlot} key={i}>
    <MediaBlockUploader
      mediaType="image"
      availableMedia={availableImages}
      value={mediaId || null}
      onChange={(id) => {
        const next = [...value];
        next[i] = id ?? "";
        onChange(next);
      }}
      onUploadStateChange={(uploading) => onUploadStateChange?.(i, uploading)}
    />
    <button
      className={styles.removeSlotBtn}
      onClick={() => onChange(value.filter((_, j) => j !== i))}
      type="button"
    >
      Remove image
    </button>
  </div>
))}
<button
  className={styles.addSlotBtn}
  onClick={() => onChange([...value, ""])}
  type="button"
>
  <Plus size={11} /> Add image
</button>
```

---

## Change 4 — New CSS: `components/media-block-uploader.module.css`

Create a new CSS module (do not add to `course-detail-manager.module.css`). Required classes:

```css
.dropZone {
  border: 2px dashed var(--color-border);
  border-radius: 8px;
  padding: 20px;
  text-align: center;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
  transition: border-color 0.15s, background 0.15s;
}
.dropZone:hover,
.dragging {
  border-color: var(--color-primary, #3b82f6);
  background: var(--color-surface-hover, rgba(59,130,246,0.04));
}
.hint {
  font-size: 11px;
  color: var(--color-text-tertiary);
}
.hiddenInput {
  display: none;
}
.orDivider {
  text-align: center;
  font-size: 11px;
  color: var(--color-text-tertiary);
  margin: 8px 0;
}
.uploadingState {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 0;
}
.fileName {
  font-size: 12px;
  font-weight: 500;
}
.progressBar {
  height: 6px;
  background: var(--color-border);
  border-radius: 3px;
  overflow: hidden;
}
.progressBar span {
  display: block;
  height: 100%;
  background: var(--color-primary, #3b82f6);
  transition: width 0.2s;
}
.progressLabel {
  font-size: 11px;
  color: var(--color-text-tertiary);
}
.readyState {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  padding: 8px 0;
  color: var(--color-text-primary);
}
.changeBtn {
  margin-left: auto;
  font-size: 11px;
  color: var(--color-text-tertiary);
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 6px;
}
.changeBtn:hover {
  color: var(--color-text-primary);
}
.gallerySlot {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 0;
  border-bottom: 1px solid var(--color-border);
}
.removeSlotBtn {
  font-size: 11px;
  color: var(--color-text-tertiary);
  background: none;
  border: none;
  cursor: pointer;
  align-self: flex-end;
}
.addSlotBtn {
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: 1px dashed var(--color-border);
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
  color: var(--color-text-secondary);
  margin-top: 6px;
}
```

---

## Change 5 — Update `components/course-tabs/add-lesson-panel.tsx`

### 5a — Imports

```typescript
import { MediaBlockUploader } from "@/components/media-block-uploader";
import { MediaBlockGalleryUploader } from "@/components/media-block-gallery-uploader";
```

### 5b — Upload-in-progress tracking

Add state to track which block indices are currently uploading:
```typescript
const [uploadingBlocks, setUploadingBlocks] = useState<Set<number>>(new Set());

function handleUploadStateChange(index: number, uploading: boolean) {
  setUploadingBlocks((prev) => {
    const next = new Set(prev);
    if (uploading) next.add(index);
    else next.delete(index);
    return next;
  });
}
```

Update `removeBlock` to also clear the index from `uploadingBlocks`:
```typescript
function removeBlock(index: number) {
  setBlocks((prev) =>
    prev.filter((_, i) => i !== index).map((b, i) => ({ ...b, sortOrder: i })),
  );
  setUploadingBlocks((prev) => {
    // Rebuild the set with renumbered indices (indices above removed one shift down by 1)
    const next = new Set<number>();
    prev.forEach((i) => {
      if (i < index) next.add(i);
      else if (i > index) next.add(i - 1);
      // i === index is discarded
    });
    return next;
  });
}
```

### 5c — Replace media block selects with uploader components

**Video block** — replace `<label>Video <select ...></label>` with:
```tsx
<MediaBlockUploader
  mediaType="video"
  availableMedia={videos}
  value={block.mediaId ?? null}
  onChange={(mediaId) => updateBlock(index, { mediaId })}
  onUploadStateChange={(uploading) => handleUploadStateChange(index, uploading)}
/>
```

**PDF block** — same pattern, `mediaType="pdf"`, `availableMedia={pdfs}`.

**Image block** — same pattern, `mediaType="image"`, `availableMedia={images}`.

**Gallery block** — replace `<label>Images <select multiple ...></label>` with:
```tsx
<MediaBlockGalleryUploader
  availableImages={images}
  value={block.galleryMediaIds ?? []}
  onChange={(ids) => updateBlock(index, { galleryMediaIds: ids })}
  onUploadStateChange={(slotIndex, uploading) => {
    // Use a composite key: blockIndex * 1000 + slotIndex (sufficient for reasonable block/slot counts)
    const key = index * 1000 + slotIndex;
    handleUploadStateChange(key, uploading);
  }}
/>
```

### 5d — Update submit button

```tsx
<button
  disabled={busy || !modules.length || uploadingBlocks.size > 0}
  type="submit"
>
  Create lesson
  {blocks.length > 0 ? ` with ${blocks.length} block${blocks.length === 1 ? "" : "s"}` : ""}
</button>
```

---

## Change 6 — Refactor `components/course-media-library.tsx` to use `useMediaUpload`

Replace the inline TUS upload logic with the hook. The library determines `mediaType` from the selected file at runtime, which is why `mediaType` is a parameter of `startUpload` (not the hook constructor).

```typescript
// Add to imports:
import { useMediaUpload } from "@/lib/use-media-upload";
import { useEffect } from "react";

// Replace state declarations:
// REMOVE: const [state, setState] = useState<"idle" | "uploading" | "error">("idle");
// REMOVE: const [progress, setProgress] = useState(0);
// ADD:
const { state, progress, mediaId, errorMessage, startUpload, reset } = useMediaUpload();
const [message, setMessage] = useState("");

// Add useEffect to handle post-upload refresh:
useEffect(() => {
  if (mediaId) {
    setMessage("Media uploaded and verified.");
    router.refresh();
    reset();
  }
}, [mediaId]);

// Replace uploadMedia function body:
async function uploadMedia(formData: FormData) {
  const file = fileRef.current?.files?.[0];
  if (!file) return setMessage("Choose a video, PDF, or image.");
  const mediaType = file.type.startsWith("video/")
    ? "video"
    : file.type === "application/pdf"
      ? "pdf"
      : "image";
  setMessage("");
  await startUpload(file, mediaType, String(formData.get("title") || file.name));
}
```

**Note:** The existing `replacesMediaId` field is no longer sent (the hook hardcodes `null`). If the Replace feature needs to be preserved, pass `replacesMediaId` as an optional parameter to `startUpload` and thread it through. Confirm with the product owner whether the Replace feature is in active use before removing it.

**Error display:** Replace `{message}` and `{state === "error"}` references to use `errorMessage` from the hook:
```tsx
{(message || errorMessage) ? (
  <p className={state === "error" ? styles.error : styles.message}>
    {errorMessage ?? message}
  </p>
) : null}
```

---

## What Is NOT Changing

- `/api/course-media`, `/api/course-media/[mediaId]/finalize` — no changes.
- `POST /api/courses/[courseId]/lessons` — no changes. All `mediaId` values in blocks are already finalised before the lesson form is submitted.
- `LessonBlockInput`, `LessonWithBlocksInput` — no changes.
- Written text and Link block cards — no changes.
- RLS, tenant isolation, `can_access_course` — no changes.
- Student-side learning views — no changes.

---

## Acceptance Criteria

Test in a KaiTrades browser session with real files.

1. In the Add Lesson panel, clicking "+ Video" shows a block card with a drag-and-drop upload zone and a "select from Media Library" dropdown.
2. Dropping or browsing for an MP4/WebM file starts a TUS upload. A progress bar appears. The "Create lesson" button is disabled.
3. When the upload finishes, the block card shows the filename with a checkmark. The "Create lesson" button re-enables.
4. Same behaviour for "+ PDF" (accept .pdf) and "+ Image" (accept .png/.jpg/.webp).
5. Selecting an existing asset from the Media Library dropdown skips the upload and immediately shows the ready state.
6. For "+ Gallery": the slot shows individual `MediaBlockUploader` components. "+ Add image" appends a new slot. "Remove image" removes a slot. "Create lesson" is disabled while any slot is uploading.
7. Submitting the lesson with uploaded blocks creates the lesson correctly — the finalised `mediaId` values appear in `lesson_content_blocks` in the DB.
8. If a file upload fails (network error), an error message appears in the block card with a Retry option. The rest of the form is unaffected.
9. If a block with an in-progress upload is removed via "Remove", the "Create lesson" button correctly re-enables (the uploading-blocks counter is cleaned up).
10. The Media Library page (`/dashboard/courses/[id]` Media tab) continues to work correctly with no regression — uploads complete and the library table refreshes.
11. `npm run typecheck` passes with no new errors.
12. `npm run build` completes cleanly.
13. Existing acceptance runner passes without modification.

---

## Final Delivery Summary from Engineering

Engineering must confirm:

1. Pre-implementation investigation findings.
2. `useMediaUpload` hook extracted to `lib/use-media-upload.ts` — `mediaType` is a `startUpload` parameter, not a hook constructor parameter.
3. `MediaBlockUploader` component created with three sub-states (idle/uploading/ready), drag-and-drop, library picker, `onUploadStateChange` callback.
4. `MediaBlockGalleryUploader` component created — each slot is a `MediaBlockUploader`.
5. `media-block-uploader.module.css` created with all required classes.
6. `AddLessonPanel` updated: uploader components in place of selects, `uploadingBlocks` Set tracking with index renumbering on `removeBlock`, submit button disabled when `uploadingBlocks.size > 0`.
7. `CourseMediaLibrary` refactored to use `useMediaUpload`; `replacesMediaId` disposition confirmed.
8. Acceptance criteria 1–13 verified in KaiTrades browser session with real file uploads.
9. Commit hash and files changed.
