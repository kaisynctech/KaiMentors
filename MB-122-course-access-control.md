# MB-122 — Course Access Control Enforcement

**Status:** Ready for implementation  
**Author:** Enterprise Architect  
**Date:** 2026-08-27  
**Scope:** Platform-wide (all portals with restricted courses)

---

## 1. Context & Problem

The `courses` table has a three-value `access_mode` enum:

| Value | Meaning |
|---|---|
| `all_verified` | Any verified/subscribed student can see and access the course (default) |
| `restricted` | Only students in a granted group or individually granted can access |
| `one_to_one` | Only a single specifically granted student can access |

The `can_access_course(course_id, user_id)` Postgres function correctly implements all three branches, using `content_access_grants` and `student_group_members` for the restricted cases.

**The mentor UI to set access mode is already fully built** (`AccessTab` component, wired to `PATCH /api/courses/[courseId]` → `update_course_curriculum_settings` RPC → `set_course_access` function). Mentors can already set a course to `restricted` and assign groups or individual students.

**The bug:** Migration `202607081800_student_access_policy.sql` dropped the grant-aware RLS policy on `courses` and replaced it with a simpler one:

```sql
-- What migration 0028 dropped (the correct policy from migration 0025):
create policy "students read accessible published courses" on public.courses
  for select using (status = 'published' and public.can_access_course(id, auth.uid()));

-- What migration 0028 put in its place (the current, incorrect policy):
create policy "verified students read published courses" on public.courses
  for select using (status = 'published' and public.has_student_module_access(trader_id));
```

`has_student_module_access(trader_id)` only checks whether the student is verified/subscribed — it does not consult `access_mode` or `content_access_grants`. As a result, every verified student can read every published course regardless of `access_mode`. A mentor who has set a course to `restricted` gets no effect — the course still appears for all students.

**Note:** The lesson player, modules, content blocks, and resources are all correctly gated by `can_access_course()` via their own RLS policies. A student without a grant can't access lesson content even on a restricted course. The gap is specifically at the course-list level — students see courses they shouldn't be able to click into.

---

## 2. The Fix — One Migration

Drop the current permissive policy and restore the grant-aware one:

```sql
-- Migration name: restore_course_access_rls

drop policy if exists "verified students read published courses" on public.courses;

create policy "students read accessible published courses"
  on public.courses
  for select
  using (
    status = 'published'
    and public.can_access_course(id, auth.uid())
  );
```

### Verify `can_access_course` exists and is correct

Before applying the migration, confirm `can_access_course(uuid, uuid)` exists in `pg_proc` and matches the expected logic (branches on `access_mode`, uses `content_access_grants` + `student_group_members` for restricted/one_to_one, and falls back to `has_student_module_access()` for `all_verified`). Do not assume it exists — verify against the live DB.

### Why migration 0028 dropped it (and why restoring is safe)

The most likely reason was a performance concern or a conflict with the subscription access model being introduced at the time. Restoring is safe because:

1. All existing courses platform-wide default to `access_mode = 'all_verified'`. For these, `can_access_course()` calls `has_student_module_access()` internally — identical behaviour to the current policy.
2. Only courses a mentor has explicitly set to `restricted` or `one_to_one` will now be filtered. No existing course will unexpectedly disappear for a student who was previously able to see it, unless that course was intentionally restricted by the mentor.
3. The `can_access_course()` function is already in production use on `course_modules`, `lessons`, `lesson_content_blocks`, etc. — it is not new or untested.

---

## 3. No Application-Layer Changes

The student course list query in `/app/student/courses/page.tsx` runs on the session-client (student's own JWT). Once RLS is restored, the DB will correctly filter the results — no changes to the query or the component are needed.

The `/app/academy/courses/` mirror works identically — same session-client query, same RLS — no changes needed there either.

---

## 4. Mentor-Side Note

The mentor's course management UI (`AccessTab`) is fully functional. After this migration is applied, any course a mentor sets to `restricted` will immediately stop appearing for students without grants. Mentors should be informed of this in release notes — it is the intended behaviour, but it will be the first time it actually works.

---

## 5. Testing Checklist

All tests should be run against the sandbox/staging environment using a test mentor workspace and at least two test student accounts (one with a grant, one without).

- [ ] Verify `can_access_course()` function exists in the live DB before applying the migration.
- [ ] Apply the migration.
- [ ] Course with `access_mode = 'all_verified'`: visible to all verified students — unchanged.
- [ ] Course with `access_mode = 'restricted'`, granted to Group A:
  - [ ] Student in Group A → course appears in their course list.
  - [ ] Student NOT in Group A → course does not appear in their course list.
- [ ] Course with `access_mode = 'one_to_one'`, granted to Student X:
  - [ ] Student X → course appears.
  - [ ] Any other student → course does not appear.
- [ ] Mentor changes a course from `restricted` back to `all_verified` → all verified students can now see it.
- [ ] Student with no grants and all courses set to `all_verified` — no change to their experience.
- [ ] `tsc --noEmit` exits clean (no application code changes, but run as confirmation).

---

## 6. Implementation Order

1. Confirm `can_access_course(uuid, uuid)` exists in the live DB and its body matches expected logic.
2. Apply the migration (`restore_course_access_rls`).
3. Verify via DB query that the old policy is gone and the new one exists on `pg_policies`.
4. Run the testing checklist on staging.
