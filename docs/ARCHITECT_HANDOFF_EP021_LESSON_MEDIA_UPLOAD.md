# Architect Handoff — EP-021: Media Upload in Add Lesson Panel
**Status:** Ready for Engineering  
**Date:** 2026-06-26  
**Product Owner:** KaiMentors Product Owner  
**Depends on:** EP-020 (Add Lesson panel deployed and working)

---

## Objective

EP-020 delivered the Add Lesson panel with content block chips (Written text, Video, PDF, Image, Gallery, Link). When a mentor clicks "+ Video", "+ PDF", or "+ Image", the block card currently shows only a dropdown to select from existing Media Library assets. There is no way to upload a new file from within the lesson creation flow.

**This EP adds real file upload to every media block type in the Add Lesson panel.** A mentor should be able to drag-and-drop or browse for a video, PDF, or image directly in the block card — without leaving the lesson form or visiting the Media Library page first.

---

## How the Existing Upload Flow Works

The full upload flow is already implemented in `components/course-media-library.tsx`. The steps are:

1. **`POST /api/course-media`** — call with `{ title, fileName, mimeType, sizeBytes, mediaType }`. Returns `{ mediaId, uploadUrl, bucketName, storagePath }`.
2. **TUS upload** — use `tus-js-client` `Upload` to stream the file directly from the browser to Supabase Storage. Uses the `uploadUrl` and the user's bearer token. Chunk size 6 MB, resumable. `onProgress` gives a 0–100 percent value.
3. **`POST /api/course-media/{mediaId}/finalize`** — call on TUS `onSuccess` to verify the upload and mark the asset `ready`. Returns `{ ok: true }` on success.
4. On finalize success, the `mediaId` is ready to use in a lesson content block.

This entire flow must be extracted into a reusable hook so `AddLessonPanel` can use it without duplicating code.

---

## Scope of Changes

### 1. New hook: `lib/use-media-upload.ts`

Extract the TUS upload logic from `CourseMediaLibrary` into a standalone hook.

```typescript
import { useState } from "react";
import { Upload } from "tus-js-client";
import { createClient } from "@/lib/supabase/browser";

type UploadState = "idle" | "uploading" | "ready" | "error";

interface UseMediaUploadResult {
  state: UploadState;
  progress: number;           // 0–100
  mediaId: string | null;     // set when state === "ready"
  errorMessage: string | null;
  startUpload: (file: File, title?: string) => Promise<void>;
  reset: () => void;
}

export function useMediaUpload(
  mediaType: "video" | "pdf" | "image",
): UseMediaUploadResult {
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function startUpload(file: File, title?: string) {
    setState("uploading");
    setProgress(0);
    setMediaId(null);
    setErrorMessage(null);

    // Step 1 — register media record
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

    // Step 2 — TUS upload
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setState("error");
      setErrorMessage("Session expired. Sign in and retry.");
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
        setErrorMessage("Upload failed. Check your connection and retry.");
      },
      onSuccess: async () => {
        // Step 3 — finalize
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

**After extracting this hook, update `CourseMediaLibrary` to use it** — remove the inline TUS logic, call `useMediaUpload` instead. This ensures the two implementations stay in sync.

---

### 2. New component: `components/media-block-uploader.tsx`

A self-contained upload widget for a single media block within the Add Lesson panel.

```typescript
interface MediaBlockUploaderProps {
  mediaType: "video" | "pdf" | "image";
  availableMedia: Media[];   // pre-filtered to the correct media_type
  value: string | null;      // currently selected/uploaded mediaId
  onChange: (mediaId: string | null) => void;
}
```

**UI layout (three sub-states):**

**Sub-state A — Nothing selected yet:**
```
┌─────────────────────────────────────────────┐
│  ↑  Drop file here or click to browse       │  ← drag-and-drop / file input
│     MP4, WebM up to 500 MB                  │
└─────────────────────────────────────────────┘
— or choose from Media Library —
[ Select an existing video…  ▼ ]
```

**Sub-state B — Uploading:**
```
📎 intro-video.mp4
[████████████░░░░░░░░]  67%
Uploading…
```
(The file input is hidden. The Create Lesson button is disabled.)

**Sub-state C — Ready:**
```
✓ intro-video.mp4   [Change ×]
```
(Clicking "Change" resets to sub-state A via `reset()`.)

**Implementation notes:**
- Use a `<input type="file">` with `accept` set based on `mediaType`:
  - `video`: `accept="video/mp4,video/webm"`
  - `pdf`: `accept="application/pdf"`
  - `image`: `accept="image/png,image/jpeg,image/webp"`
- On file input `onChange`, call `startUpload(file)` immediately.
- On drag-over, highlight the drop zone border. On drop, call `startUpload(file)`.
- The "select from Media Library" dropdown calls `onChange(selectedId)` directly — no upload needed.
- When a library item is selected, hide the upload zone (the media already has a `mediaId`). Show a "Clear / use different file" link to reset.
- `onChange` is called with the `mediaId` from the hook's `state === "ready"` OR from the library picker.
- When the component unmounts or "Change" is clicked, call `reset()`.

---

### 3. New component: `components/media-block-gallery-uploader.tsx`

For the Gallery block type — allows adding multiple images, each either uploaded or picked from the library.

```typescript
interface MediaBlockGalleryUploaderProps {
  availableImages: Media[];           // library images
  value: string[];                    // current list of mediaIds
  onChange: (mediaIds: string[]) => void;
}
```

**UI:**
- Shows one `MediaBlockUploader` per existing gallery item (image type, no library dropdown — use dedicated image uploader).
- An "+ Add image" button appends a new uploader slot.
- Each slot has a "Remove" button that removes it from the list.
- `onChange` is called any time the array changes (add, remove, or an individual slot's mediaId resolves).

For Phase 1, the multi-select `<select multiple>` from the current implementation is replaced with this component.

---

### 4. Update `components/course-tabs/add-lesson-panel.tsx`

Replace the `<select>` in each block card with the new uploader components.

**Video block** — replace:
```tsx
// BEFORE
<label>
  Video
  <select onChange={(e) => updateBlock(index, { mediaId: e.target.value || null })} ...>
    <option value="">Select a video…</option>
    {videos.map(...)}
  </select>
</label>
```
```tsx
// AFTER
<MediaBlockUploader
  mediaType="video"
  availableMedia={videos}
  value={block.mediaId ?? null}
  onChange={(mediaId) => updateBlock(index, { mediaId })}
/>
```

**PDF block** — same pattern, `mediaType="pdf"`, `availableMedia={pdfs}`.

**Image block** — same pattern, `mediaType="image"`, `availableMedia={images}`.

**Gallery block** — replace `<select multiple>` with:
```tsx
<MediaBlockGalleryUploader
  availableImages={images}
  value={block.galleryMediaIds ?? []}
  onChange={(ids) => updateBlock(index, { galleryMediaIds: ids })}
/>
```

**Written text and Link blocks** — no change.

---

### 5. Disable "Create lesson" while uploads are in progress

`AddLessonPanel` needs to know if any block currently has an upload in progress. Since `useMediaUpload` lives inside `MediaBlockUploader`, one clean approach is a ref-based busy flag:

Option A (simplest) — lift state: pass an `onUploadStateChange: (busy: boolean) => void` prop to `MediaBlockUploader`; `AddLessonPanel` tracks a counter of in-progress uploads and disables the submit button when the counter > 0.

Option B — track it in block state: add an `uploading: boolean` field to the block state in `AddLessonPanel`, updated by `MediaBlockUploader` via a callback.

Either approach is acceptable. Engineering should choose based on what integrates most cleanly with the existing `LessonBlockInput` type.

The submit button must be disabled when any upload is in progress:
```tsx
<button
  disabled={busy || !modules.length || anyBlockUploading}
  type="submit"
>
  Create lesson{blocks.length > 0 ? ` with ${blocks.length} block${blocks.length === 1 ? "" : "s"}` : ""}
</button>
```

---

### 6. Update `CourseMediaLibrary` to use `useMediaUpload`

After the hook is extracted, refactor `CourseMediaLibrary` to call `useMediaUpload("video" | "pdf" | "image")` — detect `mediaType` from the chosen file as it does today, but delegate the actual upload to the hook. This removes ~30 lines of duplicated TUS logic from the library component.

The `onSuccess` callback in the library needs `router.refresh()` — add an `onReady?: (mediaId: string) => void` option to `useMediaUpload` if needed, or handle via a `useEffect` watching `state === "ready"`.

---

## What Is NOT Changing

- The TUS endpoint, `POST /api/course-media`, and `POST /api/course-media/{id}/finalize` — no changes.
- The lesson creation API (`POST /api/courses/[courseId]/lessons`) — no changes. By the time "Create lesson" is clicked, all uploads are already finalized and the `mediaId` is ready in block state.
- RLS, tenant isolation, `can_access_course` — no changes.
- The Media Library page — still works as before; just refactored to use the shared hook.
- Student-side learning views — no changes.
- Add Module, Add Block forms — no changes.

---

## Acceptance Criteria

1. In the Add Lesson panel, clicking "+ Video" and then selecting or dropping an MP4/WebM file starts an upload. A progress bar appears in the block card. The "Create lesson" button is disabled during upload.
2. When the video upload completes, the block card shows the filename with a checkmark. The "Create lesson" button re-enables.
3. Same for PDF (accept: pdf) and Image (accept: png/jpeg/webp) blocks.
4. Each media block card still shows the "choose from Media Library" dropdown for existing ready assets. Selecting one works immediately without uploading.
5. For a Gallery block, the mentor can add multiple images — each can be uploaded or selected from the library. Individual images can be removed with their own "Remove" button.
6. Submitting the form with uploaded media creates the lesson and all blocks correctly — the `mediaId` values from completed uploads appear in the lesson content blocks in the DB.
7. If a file upload fails (network error), an error message appears in the block card. The mentor can retry without losing the rest of the form.
8. The Media Library page continues to work correctly and uses the same underlying upload hook — no regression.
9. `npm run typecheck` and `npm run build` pass with no new errors.
10. Existing acceptance runner passes without modification.

---

## Final Delivery Summary from Engineering

Engineering must confirm:

- `useMediaUpload` hook extracted to `lib/use-media-upload.ts` with the exact three-step flow
- `MediaBlockUploader` component created with upload zone, progress bar, library picker, and ready state
- `MediaBlockGalleryUploader` component created for multi-image blocks
- `AddLessonPanel` uses `MediaBlockUploader` / `MediaBlockGalleryUploader` for video, pdf, image, gallery blocks
- "Create lesson" button disabled while any block upload is in progress
- `CourseMediaLibrary` refactored to use `useMediaUpload` hook (no regression)
- Acceptance criteria 1–10 verified in KaiTrades browser session with real file uploads
- Commit hash and files changed
