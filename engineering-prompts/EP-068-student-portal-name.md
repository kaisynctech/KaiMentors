# EP-068 — Student Dashboard: Always Show Portal Name

**Date:** 2026-07-02
**Status:** Ready for implementation

---

## Objective

Nine student pages contain a pattern that hardcodes "KaiMentors" as the academy name when students access via the `/student` route:

```typescript
const academyName = base === "/academy" ? (portal?.portal_name ?? "Academy") : "KaiMentors";
```

The portal name is always available in the query result — this ternary is incorrect. The fix removes the branch and uses `portal?.portal_name ?? "Academy"` unconditionally across all 9 files.

No migration. No new components. No API changes.

---

## Scope

| File | Current pattern | Change |
|---|---|---|
| `app/student/bookings/page.tsx` | Multiline ternary (line 42–43) | Replace with single-line constant |
| `app/student/bookings/sessions/page.tsx` | Multiline ternary (line 42–43) | Replace with single-line constant |
| `app/student/courses/page.tsx` | Multiline ternary (line 47–48) | Replace with single-line constant |
| `app/student/courses/[courseId]/page.tsx` | Inline JSX prop (line 146) | Replace inline ternary |
| `app/student/courses/[courseId]/lessons/[lessonId]/page.tsx` | Inline JSX prop (lines 240–242) | Replace inline ternary |
| `app/student/groups/page.tsx` | Multiline ternary (line 43–44) | Replace with single-line constant |
| `app/student/live-classes/page.tsx` | Multiline ternary (line 43–44) | Replace with single-line constant |
| `app/student/messages/page.tsx` | Multiline ternary with `basePath` (lines 57–59) | Replace with single-line constant |
| `app/student/page.tsx` | Multiline ternary with `basePath` (lines 66–68) | Replace with single-line constant |

---

## Group A — `academyName` variable using `base`

Apply to these 5 files:
- `app/student/bookings/page.tsx`
- `app/student/bookings/sessions/page.tsx`
- `app/student/courses/page.tsx`
- `app/student/groups/page.tsx`
- `app/student/live-classes/page.tsx`

Find and replace:

```typescript
// BEFORE:
  const academyName =
    base === "/academy" ? (portal?.portal_name ?? "Academy") : "KaiMentors";

// AFTER:
  const academyName = portal?.portal_name ?? "Academy";
```

---

## Group B — `academyName` variable using `basePath`

Apply to these 2 files:
- `app/student/messages/page.tsx`
- `app/student/page.tsx`

In `messages/page.tsx` (lines 55–59 area) find:

```typescript
// BEFORE:
  const academyName =
    basePath === "/academy"
      ? (portal?.portal_name ?? "Academy")
      : "KaiMentors";

// AFTER:
  const academyName = portal?.portal_name ?? "Academy";
```

In `page.tsx` (lines 65–68 area) find:

```typescript
// BEFORE:
  const academyName =
    basePath === "/academy"
      ? (portal?.portal_name ?? "Academy")
      : "KaiMentors";

// AFTER:
  const academyName = portal?.portal_name ?? "Academy";
```

---

## Group C — Inline JSX (no variable)

### `app/student/courses/[courseId]/page.tsx`

The `BrandMark` component on line 146 passes the ternary inline as a `label` prop:

```tsx
// BEFORE:
<BrandMark
  href={`${base}/courses${suffix}`}
  label={base === "/academy" ? (portal?.portal_name ?? "Academy") : "KaiMentors"}
/>

// AFTER:
<BrandMark
  href={`${base}/courses${suffix}`}
  label={portal?.portal_name ?? "Academy"}
/>
```

### `app/student/courses/[courseId]/lessons/[lessonId]/page.tsx`

The ternary appears inside a component prop (lines 240–242). Replace the three-line inline expression:

```tsx
// BEFORE (prop value spans 3 lines):
            base === "/academy"
              ? (portal?.portal_name ?? "Academy")
              : "KaiMentors"

// AFTER (single expression):
            portal?.portal_name ?? "Academy"
```

---

## Commit and deploy

No migration needed.

```bash
git add -A
git commit -m "fix: EP-068 always show portal name on student pages, remove KaiMentors hardcode"
git push origin main && vercel --prod
```

---

## Acceptance Criteria

Test with KaiTrades tenant: `/student?portal=kaitrades`

- [ ] Student home page (`/student?portal=kaitrades`) shows "KaiTrades" in the nav logo and page header, not "KaiMentors"
- [ ] Student bookings page shows "KaiTrades" academy name
- [ ] Student bookings sessions page shows "KaiTrades" academy name
- [ ] Student courses list page shows "KaiTrades" academy name
- [ ] Student course detail page (`/student/courses/[id]`) shows "KaiTrades" in `BrandMark`
- [ ] Student lesson page shows "KaiTrades" in `BrandMark`
- [ ] Student groups page shows "KaiTrades" academy name
- [ ] Student live classes page shows "KaiTrades" academy name
- [ ] Student messages page shows "KaiTrades" academy name
- [ ] TypeScript compiles clean — no unused `base` or `basePath` variables (verify these variables are still used elsewhere in each file before removing; most pages still need them for nav href construction)
