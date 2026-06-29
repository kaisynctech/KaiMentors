# EP-025 — Video Auto-Completion

**Status:** Ready for Engineering  
**Architect:** KaiMentors Enterprise Architect  
**Date:** 2026-06-26  
**Scope:** 1 file — `components/protected-lesson-content.tsx`  
**Migration required:** No  
**API changes:** No

---

## Objective

When a student watches 90% or more of a video block, the lesson is automatically marked complete — the same API call and state update that the "Mark lesson complete" button triggers. The manual button remains as a fallback for text, PDF, and gallery lessons, and for students who want to mark completion earlier.

The 90% threshold is standard in LMS platforms (Coursera, Udemy). It accounts for students who navigate away just before the video ends, and for videos with trailing silence or credits.

---

## Pre-investigation

Read `components/protected-lesson-content.tsx` in full before making any changes.

Confirm:
- The component already has `const lastWrite = useRef(0)` — we add a second ref alongside it
- The `<video>` element has three event handlers: `onEnded`, `onTimeUpdate`, `onLoadedMetadata`
- The `onTimeUpdate` handler currently calls `progress(event.currentTarget.currentTime)` — **no** completion logic
- `done` state is initialised from the `completed` prop
- The `blocks.map()` renders each block with access to `block.id` in the closure

---

## The single change

### `components/protected-lesson-content.tsx`

**A — Add `autoCompleted` ref**

Alongside the existing `const lastWrite = useRef(0)`, add:

```typescript
const autoCompleted = useRef<Set<string>>(new Set());
```

Using a `Set<string>` keyed by `block.id` allows lessons with multiple video blocks to each trigger completion independently, while guaranteeing that each block fires the API call at most once per page load. The outer `!done` check ensures the lesson is only marked complete once even if multiple videos reach threshold simultaneously.

**B — Update the `onTimeUpdate` handler on the `<video>` element**

The `<video>` is rendered inside `blocks.map((block) => { ... })`. The `block` variable is available via closure.

**Before:**
```tsx
onTimeUpdate={(event) => progress(event.currentTarget.currentTime)}
```

**After:**
```tsx
onTimeUpdate={(event) => {
  const video = event.currentTarget;
  if (
    !done &&
    !autoCompleted.current.has(block.id) &&
    video.duration > 0 &&
    video.currentTime / video.duration >= 0.9
  ) {
    autoCompleted.current.add(block.id);
    progress(video.currentTime, true);
    return;
  }
  progress(video.currentTime);
}}
```

That is the complete change. No other lines are modified.

---

## Behaviour notes

**Resuming a completed lesson:** `done` initialises as `completed` (the prop). If the lesson is already complete, `!done` is false and the auto-complete branch never fires. No spurious re-completion on resume.

**Resuming an incomplete lesson at > 90%:** If `position_seconds` puts the student immediately past the 90% mark when they resume, `onTimeUpdate` will fire on the first frame and trigger completion. This is intentional — the student had already watched to that point.

**Multiple video blocks in one lesson:** Each block has its own entry in `autoCompleted`. The first block to reach 90% marks the lesson complete (`done` becomes true). The `!done` guard prevents subsequent blocks from firing additional completion calls.

**`onEnded` is kept unchanged:** It calls `progress(event.currentTarget.duration, true)` — a redundant completion at 100% that serves as a safety net if `onTimeUpdate` somehow missed the 90% crossing.

---

## Verification

1. `pnpm typecheck` — must exit 0. The only new type is `Set<string>` on the ref — no issues expected.

2. Manual verification in KaiTrades student view:
   - Open a lesson with a video block
   - Seek the video to 92% of its duration → within one second the "Mark lesson complete" button should switch to disabled "Lesson completed" and `lesson_progress.is_completed` should be `true` in the database
   - Refresh the page — the lesson should still show as completed on the curriculum
   - Open a lesson with NO video blocks (text or PDF only) — the manual button should still work correctly and auto-complete should not fire

3. `pnpm build` — must pass clean.

---

## What this does NOT change

- The `/api/course-progress` endpoint — called identically to before
- The "Mark lesson complete" manual button — retained, still functional
- PDF, image, gallery, link, and rich_text blocks — none of these emit `onTimeUpdate`; no change to their rendering
- No database schema changes
- No student curriculum page changes (the completed state updates via `router.refresh()` called after progress is recorded — this already exists)
