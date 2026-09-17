# MB-127 — Bookings: Remove Hard Cap, Add Pagination

**Status:** Ready for implementation  
**Author:** Enterprise Architect  
**Date:** 2026-08-28  
**Scope:** Mentor dashboard — `/app/dashboard/bookings/page.tsx`, `BookingsPanel` in `/components/booking-session-type-manager.tsx`

---

## 1. Context & Problem

The dashboard bookings query has a hard `.limit(100)` with no pagination fallback:

```ts
supabase
  .from("bookings")
  .select("id,student_user_id,...")
  .eq("trader_id", traderId)
  .order("starts_at", { ascending: false })
  .limit(100)
```

Once a mentor accumulates more than 100 total bookings, the oldest are silently dropped from the dashboard. No warning is shown. The five client-side filter tabs (All / Pending / Upcoming / Past / Cancelled) filter the already-loaded 100 records in memory — so a mentor on the "Pending" tab may see zero results even though pending bookings exist beyond the 100-record window.

The pattern to follow is the students page, which uses URL params (`page`, `tab`) and server-side queries with exact counts.

---

## 2. Design

### Page size

Default **50 bookings per page**. Bookings are high-value records — 50 per page is scannable and keeps initial load fast. Configurable via a `pageSize` URL param (50 / 100 / 200) if desired, but a fixed 50 is acceptable for this brief.

### Tab → server-side filter mapping

Move tab filtering from client-side to the server query. Each tab maps to a Supabase filter condition:

| Tab | Server-side filter |
|---|---|
| `all` (default) | No status filter |
| `pending` | `.eq("status", "pending")` |
| `upcoming` | `.eq("status", "confirmed").gt("starts_at", new Date().toISOString())` |
| `past` | `.in("status", ["completed", "no_show"]).lt("starts_at", new Date().toISOString())` |
| `cancelled` | `.eq("status", "cancelled")` |

**Note:** Verify the exact status enum values in use before implementation. Check `bookings.status` column type against what the existing client-side tab filter uses. The mapping above is based on the tab names inferred from the audit — confirm against the actual component code.

### Count query

Use Supabase's `{ count: "exact" }` option on the same query to get the total matching row count without fetching all rows:

```ts
const { data, count, error } = await supabase
  .from("bookings")
  .select(
    "id,student_user_id,...",
    { count: "exact" }
  )
  .eq("trader_id", traderId)
  /* tab filter applied here */
  .order("starts_at", { ascending: false })
  .range(offset, offset + PAGE_SIZE - 1);
```

`range(offset, offset + PAGE_SIZE - 1)` replaces `.limit(100)`. `count` is the total number of matching rows (used to compute total pages).

---

## 3. Changes to `page.tsx`

### Read URL params

```ts
const tab      = (searchParams.tab as string) || "all";
const page     = Math.max(1, parseInt((searchParams.page as string) || "1", 10));
const PAGE_SIZE = 50;
const offset   = (page - 1) * PAGE_SIZE;
```

### Build the query dynamically

```ts
let query = supabase
  .from("bookings")
  .select("id,student_user_id,...", { count: "exact" })
  .eq("trader_id", traderId)
  .order("starts_at", { ascending: false })
  .range(offset, offset + PAGE_SIZE - 1);

const now = new Date().toISOString();

if (tab === "pending")   query = query.eq("status", "pending");
if (tab === "upcoming")  query = query.eq("status", "confirmed").gt("starts_at", now);
if (tab === "past")      query = query.in("status", ["completed", "no_show"]).lt("starts_at", now);
if (tab === "cancelled") query = query.eq("status", "cancelled");

const { data: bookings, count: totalCount, error: bookingsError } = await query;
```

### Pass pagination props to `BookingsPanel`

```tsx
<BookingsPanel
  initialBookings={bookings ?? []}
  currentTab={tab}
  currentPage={page}
  totalCount={totalCount ?? 0}
  pageSize={PAGE_SIZE}
  /* existing props */
/>
```

---

## 4. Changes to `BookingsPanel`

### Remove client-side tab filtering

The component currently filters `initialBookings` in memory based on the active tab. Remove this client-side filter — the server now returns only the records for the active tab.

### Tab switching → URL navigation

Tab clicks must update the URL (resetting to page 1) rather than toggling local state:

```ts
// Instead of: setActiveTab(tab)
router.push(`/dashboard/bookings?tab=${tab}&page=1`);
```

### Pagination controls

Add pagination controls below the bookings list. The pattern from the students page:

```tsx
{totalPages > 1 && (
  <div className="flex items-center justify-between mt-4">
    <p className="text-sm text-muted-foreground">
      Showing {offset + 1}–{Math.min(offset + pageSize, totalCount)} of {totalCount}
    </p>
    <div className="flex gap-2">
      <Button
        variant="outline" size="sm"
        disabled={currentPage <= 1}
        onClick={() => router.push(`/dashboard/bookings?tab=${currentTab}&page=${currentPage - 1}`)}
      >
        Previous
      </Button>
      <Button
        variant="outline" size="sm"
        disabled={currentPage >= totalPages}
        onClick={() => router.push(`/dashboard/bookings?tab=${currentTab}&page=${currentPage + 1}`)}
      >
        Next
      </Button>
    </div>
  </div>
)}
```

Where `totalPages = Math.ceil(totalCount / pageSize)` and `offset = (currentPage - 1) * pageSize`.

### Props interface update

Add to `BookingsPanel`'s props (or whatever the component's props type is):

```ts
currentTab: string;
currentPage: number;
totalCount: number;
pageSize: number;
```

---

## 5. No RPC Required

This is a straightforward query change — no new Postgres function needed. The existing `bookings` table RLS policies already restrict results to the correct trader; the server-side status + time filters are just additional `.eq()` / `.gt()` / `.lt()` clauses on the same query.

---

## 6. Preserving Existing Behaviour

- **Booking detail drawer / modals:** These operate on the currently-loaded page of records. They are unaffected — the records passed are the same shape, just fewer at a time.
- **Create / update booking actions:** These hit API routes directly and don't depend on the paginated list. Unaffected.
- **Availability overrides query** (`.limit(60)`): Out of scope for this brief — that cap is a reasonable bound on future-dated overrides (60 weeks ahead is over a year). Leave it.
- **`availability_overrides` and other data** fetched in the same `Promise.all`: All unaffected — only the `bookings` query changes.

---

## 7. Testing Checklist

- [ ] Default load (no URL params): 50 most-recent bookings shown, correctly ordered newest-first.
- [ ] Pending tab: only bookings with `status = pending` shown; pagination works within that filter.
- [ ] Upcoming tab: only confirmed future bookings shown.
- [ ] Past tab: only completed/no_show past bookings shown.
- [ ] Cancelled tab: only cancelled bookings shown.
- [ ] Switching tabs resets to page 1.
- [ ] With >50 total bookings: Previous / Next controls appear; navigation works.
- [ ] With ≤50 total bookings: No pagination controls rendered.
- [ ] "Showing X–Y of Z" count is accurate per tab.
- [ ] Booking detail drawer opens correctly on any page.
- [ ] `tsc --noEmit` exits clean.

---

## 8. Implementation Order

1. Confirm exact `status` enum values from `bookings` table (check existing client-side filter in `BookingsPanel` for the values in use).
2. Update `page.tsx` to read `tab` and `page` URL params, build the dynamic query, and pass pagination props.
3. Update `BookingsPanel` props interface.
4. Replace client-side tab filter with URL-push navigation.
5. Add pagination controls below the bookings list.
6. Run `tsc --noEmit`.
