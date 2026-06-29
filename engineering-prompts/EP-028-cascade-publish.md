# EP-028 — Cascade Publish: Auto-publish modules and lessons when course is published

**Status:** Ready for Engineering  
**Architect:** KaiMentors Enterprise Architect  
**Date:** 2026-06-26  
**Scope:** 1 modified file  
**Migration required:** No  
**API changes:** No  
**Package install required:** No

---

## Objective

When a mentor publishes a course (status transitions from `draft` or `archived` → `published`), automatically publish all modules and lessons in that course. This removes the need for mentors to manually publish each module and lesson individually — the course-level status is the single control.

The cascade fires **only on transition to published** — not on every save. A mentor who later adds a new draft module to an already-published course is not affected until they explicitly publish that new content.

---

## Pre-investigation

Read this file before starting:

- `app/api/courses/[courseId]/route.ts` — understand the full PATCH handler

Confirm:
- Line 65–73: the handler fetches `existing` with `existing.status` before parsing the new payload
- Line 141–151: the RPC `update_course_curriculum_settings` runs the course update
- Line 162–168: cleanup and return happen after the RPC
- The `membership.trader_id` variable is already in scope

---

## Change — `app/api/courses/[courseId]/route.ts`

### After the RPC succeeds, insert a cascade block

**Find** (the block after the RPC call — lines ~152–168):

```typescript
  if (error) {
    if (coverPath !== existing.cover_path && coverPath) {
      await supabase.storage.from("course-content").remove([coverPath]);
    }
    return NextResponse.json(
      { error: "The course could not be updated." },
      { status: 400 },
    );
  }

  if (existing.cover_path && coverPath !== existing.cover_path) {
    await supabase.storage
      .from("course-content")
      .remove([existing.cover_path]);
  }

  return NextResponse.json({ status: "updated" });
```

**Replace with:**

```typescript
  if (error) {
    if (coverPath !== existing.cover_path && coverPath) {
      await supabase.storage.from("course-content").remove([coverPath]);
    }
    return NextResponse.json(
      { error: "The course could not be updated." },
      { status: 400 },
    );
  }

  // Cascade: when a course transitions to published for the first time,
  // auto-publish all its modules and lessons so mentors don't have to
  // manually publish each piece of content.
  const isPublishTransition =
    existing.status !== "published" && parsed.data.status === "published";
  if (isPublishTransition) {
    await Promise.all([
      supabase
        .from("course_modules")
        .update({ status: "published" })
        .eq("course_id", courseId)
        .eq("trader_id", membership.trader_id),
      supabase
        .from("lessons")
        .update({ status: "published" })
        .eq("course_id", courseId)
        .eq("trader_id", membership.trader_id),
    ]);
  }

  if (existing.cover_path && coverPath !== existing.cover_path) {
    await supabase.storage
      .from("course-content")
      .remove([existing.cover_path]);
  }

  return NextResponse.json({ status: "updated" });
```

---

## What this does NOT change

- The `update_course_curriculum_settings` RPC — unchanged
- Module and lesson status fields — still exist, still editable; this just sets them on transition
- Any other PATCH handler — only the course route is modified
- No frontend changes — the mentor flow is identical; publishing the course just now does more server-side work silently

---

## Verification

1. `pnpm typecheck` — must exit 0 (no new types introduced)
2. `pnpm build` — must pass clean
3. Manual verification in KaiTrades:
   - Create a new course with one module and one lesson (both in Draft)
   - Open Settings → change Status to Published → Save settings
   - Sign in as a KaiTrades student → open My Learning → open the course
   - **Expected:** the module and lesson are visible (they were auto-published by the cascade)
   - **Regression:** edit an already-published course's settings (title change) → save → no modules or lessons are affected
   - **Regression:** re-save a published course with status still set to Published → no duplicate cascade fires (transition check: `existing.status !== "published"` is false, so the block is skipped)
