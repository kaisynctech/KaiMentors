# EP-041 — Hotfix: Active Learners Showing as 0 + File Restoration

**Status:** Ready for Engineering — push only, no code changes needed  
**Architect:** KaiMentors Enterprise Architect  
**Date:** 2026-06-29  
**Scope:** Push existing commit `78f3fb9` to origin  
**Migration required:** No  
**API changes:** No

---

## What was fixed

**Root cause:** `student_applications` has no `email` column. Two queries were selecting it:
- `app/dashboard/courses/[courseId]/page.tsx` — students query for the course editor
- `components/course-detail-manager.tsx` — Student type interface
- `components/course-tabs/access-tab.tsx` — Student type + display

The Supabase query failed silently, returning null students → `studentList = []` → `progress = []` → "Active Learners = 0" on the course Overview tab.

**Also fixed in this commit:** Several files were left truncated by previous implementation runs (EP-039, EP-040). The following files were restored to their complete state:
- `components/course-detail-manager.tsx`
- `components/course-manager.tsx`
- `components/course-tabs/curriculum-tab.tsx`
- `components/course-tabs/settings-tab.tsx`
- `components/protected-lesson-content.tsx`
- `app/dashboard/courses/[courseId]/page.tsx`
- `app/student/courses/[courseId]/page.tsx`
- `app/student/courses/[courseId]/lessons/[lessonId]/page.tsx`
- `app/api/courses/[courseId]/route.ts`

---

## Your only task

```bash
git push origin main
```

The commit is already on your local branch. No code changes are needed.

---

## Verification

After Vercel deploys:

1. Open any course in the mentor dashboard → Overview tab
2. Confirm "Active Learners" shows the correct count (not 0) for courses where students have completed lessons
3. Confirm the Access tab → Individual Students picker loads student names correctly
4. Confirm the Settings tab thumbnail upload still works
5. Confirm the course curriculum and lesson pages load without errors

---

## Action item for Engineering

Please investigate why your file-write tooling is truncating files. Multiple files across multiple sessions have been cut short mid-line. Every implementation run should include a typecheck (`npx tsc --noEmit`) before committing — truncated files produce JSX parser errors that make this immediately visible.
