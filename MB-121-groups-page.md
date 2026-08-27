# MB-121 — Groups Page Improvements

**Status:** Ready for implementation  
**Author:** Enterprise Architect  
**Date:** 2026-08-27  
**Scope:** Student portal groups page (platform-wide)

---

## 1. Context & Problem

The student Groups page currently shows a static card per group: a colour dot, the group name, an optional description, and the hard-coded word "Member". There are no interactive elements and no useful information beyond what a mentor manually typed into the group description. Students have no idea how many people are in their group, what content the group unlocks, or what the group is for beyond reading its name.

There is also a structural issue: the `system_key = 'all_students'` auto-created system group currently appears on the student's groups list. This is an internal platform construct used for broadcast announcements and access control — it is not a meaningful group from a student's perspective and should not be visible.

---

## 2. Fix 1 — Hide the System Group

The `student_groups` table has a `system_key` column. The only used value is `'all_students'`. This group is auto-created for every workspace and is never a real group the student was intentionally placed in.

**Change:** In `/app/student/groups/page.tsx`, add a filter to exclude rows where `system_key` is not null.

The Supabase query currently joins to `student_groups` and filters client-side on `is_active`. Add a server-side filter:

```ts
.select("id,group_id,student_groups!inner(id,name,description,color,is_active,system_key)")
.eq("student_groups.system_key", null)
// or equivalently:
.is("student_groups.system_key", null)
```

Alternatively, apply this as a client-side filter alongside the existing `is_active` check:
```ts
.filter(m => m.student_groups?.is_active && m.student_groups?.system_key == null)
```

Either approach is acceptable. The server-side filter is preferred — it avoids fetching data the page will never display.

**Also add `system_key` to the select** so the filter field is available:
```ts
.select("id,group_id,student_groups(id,name,description,color,is_active,system_key)")
```

---

## 3. Fix 2 — Member Count

Students benefit from knowing how many people are in their group. This builds community context — "You're in a group of 12 builders" is motivating.

**Change:** Add a member count to each group card.

The simplest approach is a single additional query after the group membership query:

```ts
// Collect all group IDs the student belongs to
const groupIds = members.map(m => m.group_id);

// Fetch member counts for each group
const { data: counts } = await supabase
  .from("student_group_members")
  .select("group_id")
  .in("group_id", groupIds)
  .eq("trader_id", app.trader_id);

// Build a count map
const countMap = new Map<string, number>();
counts?.forEach(row => {
  countMap.set(row.group_id, (countMap.get(row.group_id) ?? 0) + 1);
});
```

Pass `countMap` (or a plain object equivalent) to the inline card JSX. Render the count on each card as: `{count} member{count !== 1 ? "s" : ""}`.

**Note:** This counts all members of the group, not just the student themselves. This is intentional — it gives group size context. Individual member names are not shown (privacy consideration — not in scope for this brief).

If `groupIds` is empty (student has no active groups after filtering), skip the count query entirely.

---

## 4. Fix 3 — Linked Courses

When a mentor uses `set_course_access()` to restrict a course to specific groups, students in that group should see which courses they've been granted access to through the group.

**Change:** Query `content_access_grants` for the student's groups and join to `courses` to get course titles.

```ts
// Only run this query if the student has groups
const { data: grants } = await supabase
  .from("content_access_grants")
  .select("group_id, entity_id, courses!inner(id,title,cover_path)")
  .eq("trader_id", app.trader_id)
  .eq("entity_type", "course")
  .in("group_id", groupIds);

// Build a map of group_id → course list
const courseMap = new Map<string, { id: string; title: string }[]>();
grants?.forEach(g => {
  const course = Array.isArray(g.courses) ? g.courses[0] : g.courses;
  if (!course) return;
  const existing = courseMap.get(g.group_id) ?? [];
  courseMap.set(g.group_id, [...existing, { id: course.id, title: course.title }]);
});
```

**Render on each card:** If `courseMap.get(group.id)` has entries, show them as a small list below the description:

```
📚 Courses in this group
  → AI Agents Masterclass
  → Web App Development
```

Each course title is a link to `/student/courses/{courseId}` (or `${basePath}/courses/${courseId}`).

If no courses are linked to the group, render nothing — the card is unchanged from today.

**Important note for the developer:** The `content_access_grants` table is populated only through the `set_course_access()` Postgres RPC, called from the mentor dashboard. There is currently no mentor UI to call this RPC (that is MB-122). Until MB-122 is implemented, this section will render empty for all groups on all portals. The query is harmless — it simply returns no rows. Build it now so it is ready when MB-122 delivers the grant UI.

---

## 5. Empty State Update

The current empty state message is:
> "No groups found. Your mentor will assign you to a group once your access is confirmed."

This message is shown when a student has no active non-system groups. This is appropriate. No change needed to the message text, but if the student has `hasModuleAccess = false`, the existing `ContentGate` already blocks the page — the empty state is only shown to students who do have access but genuinely have no groups.

---

## 6. Card Layout

The card currently renders inline JSX in the page file (no dedicated component). The developer may extract a `GroupCard` component to keep things clean, or continue with inline JSX — either is acceptable.

Suggested card information hierarchy (top to bottom):
1. Color dot + group name (existing)
2. Member count — e.g. "12 members" (new, shown below name as muted text)
3. Description (existing, optional)
4. Linked courses list (new, optional — only when grants exist)
5. "Member" badge (existing — keep it, it confirms the student's membership)

---

## 7. Academy Mirror

Check whether `/app/academy/groups/` exists. If it does, apply the same three fixes identically. If it does not exist, no action needed.

---

## 8. Testing Checklist

- [ ] The `system_key = 'all_students'` group does not appear on the student's groups list.
- [ ] A student in one active group sees one card; a student in two active groups sees two cards.
- [ ] Each card shows the correct member count for that group.
- [ ] Member count updates if the mentor adds or removes students from the group (next page load).
- [ ] When no courses are linked to a group, no courses section appears on the card.
- [ ] When courses are linked (after MB-122 is implemented and grants are set), course titles appear with working links to the course page.
- [ ] A student with no active non-system groups sees the empty state message.
- [ ] `tsc --noEmit` exits clean.

---

## 9. Implementation Order

1. Add `system_key` to the groups select; filter out rows where `system_key` is not null.
2. Add the member count query and pass count data to cards.
3. Add the `content_access_grants` + courses query and pass linked courses to cards.
4. Update card JSX to render member count and linked courses.
5. Check for `/app/academy/groups/` — apply fixes there if the route exists.
6. Run `tsc --noEmit`.

---

## 10. Dependencies

- **MB-122** (access control enforcement) is NOT a prerequisite — this brief is independently implementable. The linked courses section will render empty until MB-122 delivers the grant-writing UI, which is expected and correct.
