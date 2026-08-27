# MB-124 — Broadcast Content RLS Fix: Announcements & Live Classes

**Status:** Ready for implementation  
**Author:** Enterprise Architect  
**Date:** 2026-08-27  
**Scope:** Platform-wide (`announcements` and `live_classes` tables)

---

## 1. Context

This brief completes the work started in MB-122. That migration fixed the dual-policy RLS leak on `courses`, `lessons`, and `resources`. As the engineer flagged at the time, the same leak exists on `announcements` and `live_classes`. `daily_signals` is intentionally grant-free and is not affected.

Both `announcements` and `live_classes` have:
- An `access_scope` column (`all_verified` | `restricted`) — the `restricted` value means "only students in a granted group or explicitly granted"
- A correct grant-aware RLS policy (`"entitled students read published ..."`) that uses `can_access_content()`
- A duplicate permissive policy (`"verified students read published ..."`) that uses only `has_student_module_access()`

Because Postgres ORs multiple permissive SELECT policies together, the permissive policy silently wins for every row, regardless of `access_scope`. Mentors cannot restrict an announcement or live class to a specific group — the restriction is enforced at the DB level only on paper.

**Additional gap:** There is no mentor UI to set `access_scope = 'restricted'` on announcements or live classes. The `access_scope` column exists and the grant infrastructure works, but mentors have no way to use it from the dashboard. This brief must address both the RLS fix and the missing mentor UI — fixing only the RLS without the UI would leave a feature that is correctly secured but completely unusable.

---

## 2. Part A — RLS Migration

### The Fix

Drop the permissive duplicate policies on both tables. The grant-aware policies (`"entitled students read published ..."`) already exist and are correct — they call `can_access_content()` which handles both `all_verified` (pass-through) and `restricted` (requires a grant row) correctly.

```sql
-- Migration name: mb124_broadcast_content_rls_fix

-- Announcements
drop policy if exists "verified students read published announcements" on public.announcements;
-- The remaining policy "entitled students read published announcements" is the correct one.
-- It uses: status='published' AND expires_at check AND can_access_content(trader_id,'announcement',id,access_scope)

-- Live classes
drop policy if exists "verified students read published live classes" on public.live_classes;
-- The remaining policy "entitled students read published live classes" is the correct one.
-- It uses: status='published' AND can_access_content(trader_id,'live_class',id,access_scope)
```

### Pre-migration verification

Before applying, confirm the live policy names match exactly using `pg_policies`. The MB-122 experience showed that policy names from migration files may not match what is actually installed. Verify:

```sql
select policyname, qual
from pg_policies
where tablename in ('announcements', 'live_classes')
  and cmd = 'SELECT'
  and roles @> array['authenticated']::name[]
order by tablename, policyname;
```

If the policy names differ from what the migration drops, adjust accordingly. Do not proceed without this verification.

### Post-migration verification

After applying:
```sql
select tablename, policyname
from pg_policies
where tablename in ('announcements', 'live_classes')
  and cmd = 'SELECT'
  and roles @> array['authenticated']::name[];
```

Each table should have **exactly one** student SELECT policy. If two remain on either table, the fix did not take effect — re-check the policy name used in the DROP.

### Safety

All existing announcements and live classes default to `access_scope = 'all_verified'`. For those, `can_access_content()` calls `has_student_module_access()` internally — identical behaviour. No existing student loses access to any content they previously had access to, unless the mentor had explicitly set `access_scope = 'restricted'` (which the UI does not currently allow — so this cannot be the case in production).

---

## 3. Part B — Mentor UI for Restricted Scope

### Announcements

Find the announcement create/edit form in the mentor dashboard (search for the component that posts to the announcements API route). Add an **access scope selector** to the form:

**UI pattern** (match the style used in the course AccessTab — radio cards):

```
Who can see this announcement?
  ○ All students          — Every enrolled student with access
  ● Specific groups       — Only students in selected groups
```

When "Specific groups" is selected, render a checkbox list of all active `student_groups` for the workspace (excluding the `all_students` system group — `system_key IS NULL`).

On save, the API route must:
1. Set `access_scope = 'restricted'` on the `announcements` row when groups are selected, `access_scope = 'all_verified'` otherwise.
2. Call `set_content_access()` — if this function exists — or directly manage `content_access_grants` rows: delete existing grants for this announcement, then insert one row per selected `group_id` with `entity_type = 'announcement'`, `entity_id = announcement.id`.

**Check first:** Verify whether a `set_content_access()` or similar RPC exists for non-course entities, or whether `set_course_access()` is the only one. If only `set_course_access()` exists, the developer must either extend it to accept other entity types, or write direct insert/delete logic for the API route. Do not assume a generic RPC exists — verify in `pg_proc` before writing the API route.

**Default for new announcements:** `access_scope = 'all_verified'` (no change from current behaviour). Existing announcements remain `all_verified` unless the mentor edits them.

### Live Classes

Find the live class create/edit form in the mentor dashboard. Apply the same access scope selector pattern as announcements above, with identical group-selection UI and the same API route logic (`entity_type = 'live_class'`).

**Note:** The `live_classes` API route already handles `access_scope` for the `recording_url` field added in MB-120. Check whether the PATCH route already selects and updates `access_scope` — if so, only the UI selector and grant management logic need to be added.

---

## 4. No Changes to Student-Facing Pages

The student live-classes and announcements queries rely entirely on RLS. Once the permissive policy is dropped, RLS correctly enforces the scope. No application-layer changes are needed on the student side.

---

## 5. `daily_signals` — Confirmed No Change Needed

`daily_signals` has no `access_scope` column and no grant-aware policy — it is intentionally broadcast to all module-access students. The current single-policy state is correct. Do not touch it.

---

## 6. Testing Checklist

### RLS fix (Part A)
- [ ] Verify `pg_policies` before migration — confirm exact policy names to drop.
- [ ] Apply migration.
- [ ] Verify `pg_policies` after — each table has exactly one student SELECT policy.
- [ ] Announcement with `access_scope = 'all_verified'`: visible to all module-access students — unchanged.
- [ ] Live class with `access_scope = 'all_verified'`: visible to all module-access students — unchanged.
- [ ] (After Part B UI is built) Announcement set to `restricted` with Group A grant: Student in Group A sees it; student not in Group A does not.
- [ ] (After Part B UI is built) Live class set to `restricted` with Group A grant: Same pattern.

### Mentor UI (Part B)
- [ ] New announcement defaults to "All students" scope.
- [ ] Selecting "Specific groups" shows the active group list (system `all_students` group excluded).
- [ ] Saving with groups selected: `access_scope = 'restricted'` on the row, correct `content_access_grants` rows inserted.
- [ ] Changing from restricted back to all: `access_scope = 'all_verified'`, all grant rows removed.
- [ ] Same for live classes.
- [ ] `tsc --noEmit` exits clean.

---

## 7. Implementation Order

1. Check `pg_policies` live — confirm exact policy names.
2. Apply Part A migration (drop permissive policies).
3. Verify post-migration policy state.
4. Check whether a generic `set_content_access()` RPC exists — decide approach for grant management in the API routes.
5. Add access scope selector to the announcement form + update API route.
6. Add access scope selector to the live class form + update API route.
7. Run `tsc --noEmit`.
