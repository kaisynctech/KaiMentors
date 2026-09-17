# MB-125 — Mentor Dashboard Performance

**Status:** Ready for implementation  
**Author:** Enterprise Architect  
**Date:** 2026-08-27  
**Scope:** Mentor dashboard — courses list, community, resources pages

---

## 1. Context

Three performance bottlenecks in the mentor dashboard that will degrade visibly as workspace data grows:

| Page | Problem | Current cost | At scale |
|---|---|---|---|
| `/dashboard/courses` | Full `lesson_progress` table scan + in-memory counting | O(all_progress_rows) per page load | 10k rows = noticeable lag |
| `/dashboard/community` | Gallery items signed URLs generated in a serial `for` loop with `await` | N sequential round-trips to storage | 50 items = 50 serial calls |
| `/dashboard/resources` | Two `createSignedUrl` calls per resource, awaited sequentially inside each `Promise.all` callback | 2N sequential storage calls | 30 resources = 60 serial calls |

None of these are broken today. All three will become slow as content accumulates.

---

## 2. Fix 1 — `lesson_progress` Aggregate RPC

### Current code (`/app/dashboard/courses/page.tsx`)

```ts
// Fetches every progress row for the trader — no limit, no aggregation
supabase.from("lesson_progress").select("course_id,student_user_id").eq("trader_id", traderId)
```

Then in-memory, for N courses:
```ts
const activeLearnerCount = new Set(
  allProgress.filter(p => p.course_id === course.id).map(p => p.student_user_id)
).size;
const activeLearners = new Set(allProgress.map(p => p.student_user_id)).size;
```

This fetches every row, then filters N times in JS. A trader with 500 students × 20 lessons = 10,000 rows transferred on every courses-page load.

### New migration: `get_course_learner_counts` RPC

```sql
create or replace function public.get_course_learner_counts(target_trader_id uuid)
returns table (
  course_id       uuid,
  learner_count   bigint
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    course_id,
    count(distinct student_user_id) as learner_count
  from public.lesson_progress
  where trader_id = target_trader_id
  group by course_id;
$$;

-- Grant to authenticated role so the mentor's session client can call it
grant execute on function public.get_course_learner_counts(uuid) to authenticated;
```

Add an RLS/auth guard inside the function body if needed — verify the RLS pattern used by other RPCs in the codebase (some use `is_trader_member()`, some use `security definer` with an inline check). Match the established pattern.

### Updated page code

Replace the `lesson_progress` query:
```ts
// Before
supabase.from("lesson_progress").select("course_id,student_user_id").eq("trader_id", traderId)

// After
supabase.rpc("get_course_learner_counts", { target_trader_id: traderId })
```

Replace the in-memory counting:
```ts
// Build a map from the RPC result
const learnerCountMap = new Map(
  (learnerCounts ?? []).map(row => [row.course_id, Number(row.learner_count)])
);

// Per-course:
const activeLearnerCount = learnerCountMap.get(course.id) ?? 0;

// Global total distinct learners (sum of per-course counts is wrong — a student
// in two courses would be counted twice). Keep a separate total query, or add a
// second RPC field. Simplest: add a total field to the same RPC:
```

**Preferred approach — extend the RPC to also return a total:**

Add a second function (or a single function returning both):

```sql
create or replace function public.get_trader_learner_stats(target_trader_id uuid)
returns json
language sql
security definer
set search_path = ''
stable
as $$
  select json_build_object(
    'total_learners', (
      select count(distinct student_user_id)
      from public.lesson_progress
      where trader_id = target_trader_id
    ),
    'by_course', (
      select json_object_agg(course_id, learner_count)
      from (
        select course_id, count(distinct student_user_id) as learner_count
        from public.lesson_progress
        where trader_id = target_trader_id
        group by course_id
      ) sub
    )
  );
$$;

grant execute on function public.get_trader_learner_stats(uuid) to authenticated;
```

The developer may choose either two separate RPCs or this combined approach — whichever fits better with the existing RPC patterns in the codebase. The goal is: one database round-trip replaces the full table scan.

### Type update

The `lesson_progress` query return type and its references in the page must be updated to use the RPC response shape instead. The existing in-memory `allProgress` array can be removed entirely.

---

## 3. Fix 2 — Community Gallery Items: Serial Loop → `Promise.all`

### Current code (`/app/dashboard/community/page.tsx`, lines 65–75)

```ts
// Serial — each await blocks the loop
for (const item of rawItems) {
  const mediaUrl = item.file_path ? await signedUrl(item.file_path) : null;
  itemsByAlbum[item.album_id]?.push({ ...item, mediaUrl });
}
```

### Fix

**Option A — `Promise.all` the loop (minimal change):**
```ts
const signedItems = await Promise.all(
  rawItems.map(async (item) => ({
    ...item,
    mediaUrl: item.file_path ? await signedUrl(item.file_path) : null,
  }))
);
for (const item of signedItems) {
  if (!itemsByAlbum[item.album_id]) itemsByAlbum[item.album_id] = [];
  itemsByAlbum[item.album_id].push(item);
}
```

All N URL requests now fire concurrently rather than sequentially.

**Option B — Supabase bulk signed URLs (preferred if available):**

Supabase storage JS client v2 exposes `createSignedUrls(paths[], expiresIn)` which generates multiple signed URLs in a single API call. Check whether this method is available in the installed version:

```ts
const paths = rawItems.map(i => i.file_path).filter(Boolean) as string[];
const { data: signedData } = await admin.storage
  .from("academy-media")
  .createSignedUrls(paths, 3600);

// signedData is an array of { path, signedUrl, error }
const urlMap = new Map(signedData?.map(d => [d.path, d.signedUrl ?? null]) ?? []);
```

If `createSignedUrls` (plural) exists in the installed `@supabase/storage-js` version, use Option B — it's a single network call regardless of N. If it doesn't exist, use Option A.

Check: `node_modules/@supabase/storage-js/dist` or `package.json` for the storage-js version. The method was added in `@supabase/storage-js` v2.4.0.

---

## 4. Fix 3 — Resources: Two Sequential Awaits → Parallel Per Row

### Current code (`/app/dashboard/resources/page.tsx`, lines 23–29)

```ts
const resources = await Promise.all(
  (rows ?? []).map(async (r) => {
    // Awaited sequentially — second call waits for first
    const mediaUrl = r.storage_path
      ? (await admin.storage.from("academy-media").createSignedUrl(r.storage_path, 3600)).data?.signedUrl ?? null
      : null;
    const thumbnailUrl = r.thumbnail_path
      ? (await admin.storage.from("academy-media").createSignedUrl(r.thumbnail_path, 3600)).data?.signedUrl ?? null
      : null;
    return { ...r, mediaUrl, thumbnailUrl };
  })
);
```

The outer `Promise.all` correctly parallelises across rows. But within each row, the two `createSignedUrl` calls are sequential — 2N calls, not truly concurrent.

### Fix — parallelise within each row

```ts
const resources = await Promise.all(
  (rows ?? []).map(async (r) => {
    const [mediaUrl, thumbnailUrl] = await Promise.all([
      r.storage_path
        ? admin.storage.from("academy-media").createSignedUrl(r.storage_path, 3600)
            .then(res => res.data?.signedUrl ?? null)
        : Promise.resolve(null),
      r.thumbnail_path
        ? admin.storage.from("academy-media").createSignedUrl(r.thumbnail_path, 3600)
            .then(res => res.data?.signedUrl ?? null)
        : Promise.resolve(null),
    ]);
    return { ...r, mediaUrl, thumbnailUrl };
  })
);
```

Both calls per row now fire concurrently. Combined with the outer `Promise.all`, all 2N calls run as concurrently as the runtime allows.

If `createSignedUrls` (bulk API) is available (see Fix 2), apply the same batch approach here: collect all `storage_path` and `thumbnail_path` values into a single array, make one bulk API call, then map results back.

---

## 5. Shared Signed URL Utility (Optional but Recommended)

If Fix 2 and Fix 3 both end up using the same `createSignedUrls` bulk approach, extract a shared utility to avoid duplication:

**`/lib/storage.ts` (new file):**
```ts
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Generate signed URLs for multiple storage paths in a single API call.
 * Falls back to individual calls if the bulk API is unavailable.
 * Returns a Map<path, signedUrl | null>.
 */
export async function signedUrls(
  client: SupabaseClient,
  bucket: string,
  paths: (string | null | undefined)[],
  expiresIn = 3600
): Promise<Map<string, string | null>> {
  const validPaths = paths.filter((p): p is string => !!p);
  if (!validPaths.length) return new Map();

  const { data } = await client.storage.from(bucket).createSignedUrls(validPaths, expiresIn);
  return new Map(data?.map(d => [d.path, d.signedUrl ?? null]) ?? []);
}
```

Use this in both the community and resources pages. If `createSignedUrls` isn't available in the installed version, implement it as `Promise.all(paths.map(...createSignedUrl))` internally — the call signature stays the same.

---

## 6. Testing Checklist

### Fix 1 (lesson_progress RPC)
- [ ] Migration applies cleanly — `get_trader_learner_stats` (or equivalent) exists in `pg_proc`.
- [ ] Courses list page loads without querying `lesson_progress` directly (verify via Supabase logs or network tab).
- [ ] Active learner count per course matches the previous in-memory calculation.
- [ ] Total active learners stat card shows the correct count.
- [ ] A workspace with zero progress rows shows 0 counts — no errors.
- [ ] `tsc --noEmit` exits clean.

### Fix 2 (community gallery)
- [ ] Community page loads correctly — all gallery item images have signed URLs.
- [ ] Page loads faster with a large gallery (subjective, but measurable if you have test data).
- [ ] No race condition in album grouping — items land in the correct album.

### Fix 3 (resources)
- [ ] Resources page loads correctly — media and thumbnail URLs both present.
- [ ] Resources with no `storage_path` or no `thumbnail_path` render without error.

---

## 7. Implementation Order

1. Write + apply the `get_trader_learner_stats` migration.
2. Update `/app/dashboard/courses/page.tsx` to use the RPC.
3. Check `@supabase/storage-js` version for `createSignedUrls` availability.
4. Fix community gallery items loop (Option A or B per version check).
5. Fix resources double-await (parallel `Promise.all` or bulk API).
6. Optionally extract shared `lib/storage.ts` utility.
7. Run `tsc --noEmit`.
