# EP-028b — Cascade Publish Fix: always cascade, not just on transition

**Status:** Ready for Engineering  
**Architect:** KaiMentors Enterprise Architect  
**Date:** 2026-06-26  
**Scope:** 1 modified file  
**Migration required:** No  
**API changes:** No  
**Package install required:** No

---

## Objective

EP-028 introduced a transition-only cascade (draft → published). This had a gap: if a course was already published and new draft lessons were added later, saving Settings again would not cascade-publish them. The fix removes the transition check entirely — whenever a course is saved as published, all modules and lessons are always cascade-published.

---

## Pre-investigation

Read `app/api/courses/[courseId]/route.ts` and locate the cascade block (lines ~162–180). Confirm it currently reads:

```typescript
const isPublishTransition =
  existing.status !== "published" && parsed.data.status === "published";
if (isPublishTransition) {
```

---

## Change — `app/api/courses/[courseId]/route.ts`

**Before:**
```typescript
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
```

**After:**
```typescript
  // Cascade: whenever a course is saved as published, auto-publish all
  // its modules and lessons — published course means all content is live.
  if (parsed.data.status === "published") {
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
```

---

## Verification

1. `pnpm typecheck` — must exit 0
2. `pnpm build` — must pass clean
3. Manual verification in KaiTrades:
   - Published course → add a new lesson (draft by default) → go to Settings → save (status stays Published) → student refreshes My Learning → new lesson is visible
   - Regression: archiving or saving a draft course does NOT cascade-publish anything
