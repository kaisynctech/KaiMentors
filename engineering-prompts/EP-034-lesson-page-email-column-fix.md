# EP-034 — Hotfix: Lesson Page Redirecting to Dashboard

**Status:** Ready for Engineering — apply immediately  
**Architect:** KaiMentors Enterprise Architect  
**Date:** 2026-06-29  
**Scope:** `app/student/courses/[courseId]/lessons/[lessonId]/page.tsx` — two-line change  
**Migration required:** No  
**API changes:** No  
**Package install required:** No

---

## Root cause

The lesson page (`page.tsx`) selects `email` from the `student_applications` table, but that column does not exist. The Supabase query returns an error, `app` comes back null, and the `if (!app)` guard redirects the student straight to the My Learning dashboard — the lesson never renders.

The curriculum page works because it does not select `email` from that table.

---

## Fix

The Architect has already applied both changes to the file. Commit and push as-is.

**Change 1 — Remove `email` from the select:**

```typescript
// Before
"trader_id,full_name,email,portal:portals!inner(portal_name,slug)"

// After
"trader_id,full_name,portal:portals!inner(portal_name,slug)"
```

**Change 2 — Replace `app.email` with `user.email` in the watermark:**

```typescript
// Before
watermark={`${portal?.portal_name ?? "Academy"} · ${app.full_name} · ${app.email}`}

// After
watermark={`${portal?.portal_name ?? "Academy"} · ${app.full_name} · ${user.email ?? ""}`}
```

`user` is already in scope from `supabase.auth.getUser()` earlier in the same function.

---

## Deploy steps

```bash
git add "app/student/courses/[courseId]/lessons/[lessonId]/page.tsx"
git commit -m "fix: remove non-existent email column from student_applications select — caused app=null and redirect on lesson page"
git push origin main
```

---

## Verification

1. Log in as a KaiTrades student
2. Open a course from My Learning
3. Click a lesson — confirm it opens the lesson player (with the EP-029 sidebar)
4. Confirm the lesson does NOT redirect to the dashboard
