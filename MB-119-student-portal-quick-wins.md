# MB-119 — Student Portal Quick Wins: Display Name + Resources Access Scope

**Status:** Ready for implementation  
**Author:** Enterprise Architect  
**Date:** 2026-08-27  
**Scope:** All student portals (platform-wide)

---

## 1. Context

Two low-risk, high-visibility fixes that affect every student on every portal.

### Fix A — Display name shows email prefix instead of full name

Every page in the student portal builds the display name like this:
```ts
const displayName = user.email?.split("@")[0] ?? "Student";
```
So a student named **Sipho Dlamini** who signed up with `sipho@gmail.com` sees "sipho" in the top-right avatar and everywhere their name appears. The correct `full_name` is already stored on `student_applications` at registration — it is just never fetched outside of the lesson player page.

### Fix B — Resources page ignores `access_scope`

The `resource_items` table has an `access_scope` column with two values: `"all_students"` (visible to everyone enrolled) and `"all_verified"` (visible only to students with `hasModuleAccess = true`, i.e. active subscribers or verified students). The server-side query in `/app/student/resources/page.tsx` fetches all resource items for the `trader_id` with no filter on `access_scope`. A student who has not yet subscribed can see items the mentor intended only for paying students.

---

## 2. Fix A — Display Name

### What to change

**`/lib/student-access-server.ts` — `loadStudentSessionContext()`**

The existing query on `student_applications` already has access to `full_name` (it is a column on that table). Add `full_name` to the select, and return it as part of `StudentSessionContext`.

Current select (approximate):
```ts
.select("id, trader_id, portal_id, status, broker_verified, ..., portals!inner(...)")
```

Add `full_name` to the select:
```ts
.select("id, trader_id, portal_id, status, broker_verified, full_name, ..., portals!inner(...)")
```

Add to the returned context object:
```ts
fullName: application.full_name ?? null,
```

Add `fullName: string | null` to the `StudentSessionContext` type.

---

**Every page in `/app/student/` and `/app/academy/` that currently does:**
```ts
const displayName = user.email?.split("@")[0] ?? "Student";
```

Replace with:
```ts
const { fullName } = await loadStudentSessionContext(...);
const displayName = fullName?.trim() || user.email?.split("@")[0] || "Student";
```

The fallback chain ensures that if `full_name` is somehow null or empty (legacy accounts, edge cases), the email prefix still appears rather than a blank name.

**Pages to update** (all that pass `displayName` to `StudentShell`):
- `/app/student/page.tsx`
- `/app/student/courses/page.tsx`
- `/app/student/courses/[courseId]/page.tsx`
- `/app/student/courses/[courseId]/lessons/[lessonId]/page.tsx`
- `/app/student/live-classes/page.tsx`
- `/app/student/messages/page.tsx`
- `/app/student/groups/page.tsx`
- `/app/student/bookings/page.tsx`
- `/app/student/bookings/sessions/page.tsx`
- `/app/student/resources/page.tsx`
- `/app/student/broker/page.tsx`
- All mirrors under `/app/academy/`

The developer should search for `displayName = user.email` across the codebase and replace every occurrence. Do not leave any email-prefix derivation in place.

### Avatar letter
`StudentShellClient` already uses `displayName.trim().charAt(0).toUpperCase()` for the avatar initial. Once `displayName` is the full name, this automatically shows the correct first letter (e.g. "S" for Sipho).

### No database migration needed
`full_name` already exists on `student_applications`.

---

## 3. Fix B — Resources Access Scope

### What to change

**`/app/student/resources/page.tsx`**

The current query fetches all resource items without filtering by `access_scope`:
```ts
supabase
  .from("resource_items")
  .select("...")
  .eq("trader_id", app.trader_id)
  .order(...)
```

Replace with a conditional filter based on `hasModuleAccess`:

```ts
let query = supabase
  .from("resource_items")
  .select("...")
  .eq("trader_id", app.trader_id)
  .order(...);

if (!hasModuleAccess) {
  // Unverified / unsubscribed students only see items scoped to all_students
  query = query.eq("access_scope", "all_students");
}
// hasModuleAccess = true → no filter → both "all_students" and "all_verified" are returned
```

This is a one-line conditional on the query — minimal risk.

### Note on `ResourcesView`
The `ResourcesView` component receives `accessScope` per item but does not use it. After this server-side fix, the client component does not need to change — it simply won't receive items the student shouldn't see. The `accessScope` prop on `ResourceItem` can remain for now; removing it is cosmetic and out of scope.

### Also applies to `/app/academy/resources/page.tsx`
The academy mirror of the resources page has the same query. Apply the identical fix there.

### No database migration needed
`access_scope` already exists on `resource_items`.

---

## 4. Testing Checklist

**Display name:**
- [ ] Student with a `full_name` set sees their real name in the top-right avatar and username across all pages.
- [ ] Student with no `full_name` (null) falls back to email prefix — no blank name displayed.
- [ ] Avatar initial letter matches the first character of the full name.
- [ ] Fix applies on both platform domain (`/student/*`) and custom domain (`/academy/*`).

**Resources access scope:**
- [ ] Student with `hasModuleAccess = false` (unsubscribed / unverified): only `access_scope = "all_students"` items appear on the Resources page.
- [ ] Student with `hasModuleAccess = true` (subscribed / verified): all items appear regardless of `access_scope`.
- [ ] A mentor with no `all_students` items and only `all_verified` items: unsubscribed student sees an empty Resources page (not an error).
- [ ] Fix applies on both `/app/student/resources/` and `/app/academy/resources/`.

---

## 5. Implementation Order

1. Add `full_name` to the select + return value in `loadStudentSessionContext`.
2. Update `StudentSessionContext` type.
3. Replace all `displayName = user.email?.split("@")[0]` derivations across `/app/student/` and `/app/academy/`.
4. Add `access_scope` filter to both resources page queries.
5. Run `tsc --noEmit` — expect zero new errors.
