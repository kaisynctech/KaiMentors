# EP-024 — Duration Auto-Detection

**Status:** Ready for Engineering  
**Architect:** KaiMentors Enterprise Architect  
**Date:** 2026-06-26  
**Scope:** 3 files modified — all in `components/`  
**Migration required:** No  
**API changes:** No

---

## Objective

When a mentor uploads a video file into any lesson block, the "Duration (minutes)" field on the lesson form should automatically populate with the video's duration, derived entirely client-side from the file's metadata. The field stays editable — it is a suggestion, not a lock. No server round-trip required.

Detection fires only for **newly uploaded video files**. Selecting an existing asset from the media library does not trigger detection (the library does not yet expose `duration_seconds` in the `readyMedia` type — a future improvement).

---

## Pre-investigation

Read these three files before making any changes:

- `components/media-block-uploader.tsx`
- `components/course-tabs/add-lesson-panel.tsx`
- `components/course-tabs/edit-lesson-panel.tsx`

Confirm:
- `MediaBlockUploaderProps` does not yet have an `onDurationDetected` prop
- `AddLessonPanel` and `EditLessonPanel` both have a duration input with `name="durationMinutes"` — currently uncontrolled (no React state drives its value)
- `AddLessonPanel`'s duration input has no `defaultValue`; `EditLessonPanel`'s has `defaultValue={durationMinutesDefault}`

---

## Change 1 — `MediaBlockUploader`

### `components/media-block-uploader.tsx`

**A — Add `onDurationDetected` to the props interface**

```typescript
interface MediaBlockUploaderProps {
  mediaType: "video" | "pdf" | "image";
  availableMedia: Media[];
  value: string | null;
  onChange: (mediaId: string | null) => void;
  onUploadStateChange?: (uploading: boolean) => void;
  onDurationDetected?: (seconds: number) => void; // fires only when mediaType === "video"
}
```

Destructure in the component signature:
```typescript
export function MediaBlockUploader({
  mediaType,
  availableMedia,
  value,
  onChange,
  onUploadStateChange,
  onDurationDetected,   // ← add
}: MediaBlockUploaderProps) {
```

**B — Add `detectVideoDuration` helper function**

Place this as a module-level function above the component (not inside):

```typescript
function detectVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      const secs = Math.round(video.duration);
      if (isFinite(secs) && secs > 0) resolve(secs);
      else reject(new Error("Unreadable duration"));
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Video could not be loaded"));
    };
    video.src = url;
  });
}
```

**C — Call detection inside `handleFile`**

The existing `handleFile` function:

```typescript
async function handleFile(file: File) {
  setUploadingFileName(file.name);
  await startUpload(file, mediaType);
}
```

Replace with:

```typescript
async function handleFile(file: File) {
  setUploadingFileName(file.name);
  if (mediaType === "video" && onDurationDetected) {
    detectVideoDuration(file)
      .then(onDurationDetected)
      .catch(() => {
        // metadata unreadable — duration field stays as-is
      });
  }
  await startUpload(file, mediaType);
}
```

Detection is fire-and-forget: it runs in parallel with the upload start. The upload does not wait for `onloadedmetadata`. On most browsers, `loadedmetadata` fires within milliseconds of the `src` assignment for a local file, so the callback arrives before the upload even begins — but the implementation does not depend on ordering.

---

## Change 2 — `AddLessonPanel`

### `components/course-tabs/add-lesson-panel.tsx`

**A — Add a `ref` for the duration input**

At the top of the component, alongside existing `useState` calls, add:

```typescript
const durationRef = useRef<HTMLInputElement>(null);
```

(`useRef` is already imported from React — confirm this; if not, add it to the import.)

**B — Add `handleDurationDetected` callback**

```typescript
function handleDurationDetected(seconds: number) {
  if (durationRef.current) {
    durationRef.current.value = String(Math.max(1, Math.round(seconds / 60)));
  }
}
```

This always writes the detected value. If the mentor has already typed a duration, detecting a new video overwrites it — intentional, since the new video's duration is more accurate. The field is editable so the mentor can correct it.

**C — Attach `ref` to the duration input**

Find the duration input:

```tsx
<input min="1" name="durationMinutes" type="number" />
```

Replace with:

```tsx
<input min="1" name="durationMinutes" ref={durationRef} type="number" />
```

**D — Pass `onDurationDetected` to the video block's `MediaBlockUploader`**

Find the video block render:

```tsx
{block.blockType === "video" && (
  <MediaBlockUploader
    availableMedia={videos}
    mediaType="video"
    onChange={(mediaId) => updateBlock(index, { mediaId })}
    onUploadStateChange={(uploading) => handleUploadStateChange(index, uploading)}
    value={block.mediaId ?? null}
  />
)}
```

Replace with:

```tsx
{block.blockType === "video" && (
  <MediaBlockUploader
    availableMedia={videos}
    mediaType="video"
    onChange={(mediaId) => updateBlock(index, { mediaId })}
    onDurationDetected={handleDurationDetected}
    onUploadStateChange={(uploading) => handleUploadStateChange(index, uploading)}
    value={block.mediaId ?? null}
  />
)}
```

---

## Change 3 — `EditLessonPanel`

### `components/course-tabs/edit-lesson-panel.tsx`

Identical pattern to `AddLessonPanel`. Three sub-changes:

**A — Add `durationRef`** at the top of the component:

```typescript
const durationRef = useRef<HTMLInputElement>(null);
```

**B — Add `handleDurationDetected`:**

```typescript
function handleDurationDetected(seconds: number) {
  if (durationRef.current) {
    durationRef.current.value = String(Math.max(1, Math.round(seconds / 60)));
  }
}
```

**C — Attach `ref` to the duration input:**

Find:
```tsx
<input
  defaultValue={durationMinutesDefault}
  min="1"
  name="durationMinutes"
  type="number"
/>
```

Replace with:
```tsx
<input
  defaultValue={durationMinutesDefault}
  min="1"
  name="durationMinutes"
  ref={durationRef}
  type="number"
/>
```

**D — Pass `onDurationDetected` to the video block's `MediaBlockUploader`:**

Find:
```tsx
{block.blockType === "video" && (
  <MediaBlockUploader
    availableMedia={videos}
    mediaType="video"
    onChange={(mediaId) => updateBlock(index, { mediaId })}
    onUploadStateChange={(uploading) => handleUploadStateChange(index, uploading)}
    value={block.mediaId ?? null}
  />
)}
```

Replace with:
```tsx
{block.blockType === "video" && (
  <MediaBlockUploader
    availableMedia={videos}
    mediaType="video"
    onChange={(mediaId) => updateBlock(index, { mediaId })}
    onDurationDetected={handleDurationDetected}
    onUploadStateChange={(uploading) => handleUploadStateChange(index, uploading)}
    value={block.mediaId ?? null}
  />
)}
```

---

## Verification

1. Run `pnpm typecheck` — must pass. `onDurationDetected` is optional (`?`) on `MediaBlockUploaderProps` so all existing call sites that don't pass it remain valid.

2. Manually verify in the KaiTrades workspace:
   - Add a new lesson → add a video block → drop a `.mp4` file → before the upload progress bar completes, the Duration (minutes) field should populate automatically
   - The populated value should equal `Math.round(video.duration / 60)` — e.g. a 3m 45s video → 4 minutes
   - The field is editable: type a different value, submit — the overridden value is sent
   - For `EditLessonPanel`: open an existing lesson → add a video block → drop a file → duration field updates

3. Run `pnpm build` — must pass clean.

---

## What this does NOT change

- Duration detection does not fire when selecting from the Media Library dropdown (existing media)
- PDF and image `MediaBlockUploader` instances are unaffected (`onDurationDetected` is only passed for video blocks, and `detectVideoDuration` only runs when `mediaType === "video" && onDurationDetected` is truthy)
- The `course_media` table `duration_seconds` column is not written by this EP — that remains null for now (a future EP can backfill from metadata on finalize)
- No changes to student-facing pages, API routes, or database
