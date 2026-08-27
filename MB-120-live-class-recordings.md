# MB-120 — Live Class Recordings

**Status:** Ready for implementation  
**Author:** Enterprise Architect  
**Date:** 2026-08-27  
**Scope:** All portals (mentor live class management + student live classes page)

---

## 1. Context & Problem

The `live_classes` table has no `recording_url` column. Mentors cannot store a replay link after a class ends, and students see past classes with no way to watch them back. The past-class card in the student portal renders only the date badge, title, time range, optional description, and a hard-coded "Past" badge — nothing more.

This brief adds recording URL support end to end: mentor saves the URL after the class, student sees a "Watch replay" button on past class cards.

---

## 2. Database Migration

Add a single nullable column to `live_classes`:

```sql
alter table public.live_classes
add column if not exists recording_url text;
```

No constraints beyond nullable text. The URL is entered manually by the mentor — no format validation required at the DB level (the application will do basic URL validation in the form).

No RLS changes needed — existing policies on `live_classes` already cover reads and writes correctly.

---

## 3. Mentor Side — Adding/Editing a Recording URL

### Where to change

The live class create/edit form lives in the mentor dashboard. Find the component responsible for creating and editing `live_classes` rows (search for `live_classes` insert/upsert across `/app/dashboard/` and `/components/`).

### What to add

Add a new optional field to the form, rendered only when the class's `starts_at` is in the past (i.e. the class has already happened):

**Field label:** "Recording URL"  
**Input type:** `url`  
**Placeholder:** `https://...` (Zoom recording link, YouTube, Loom, etc.)  
**Validation:** Must be a valid URL if provided; empty string is treated as null.  
**Position in form:** After the existing `join_url` field, or at the bottom of the form if the class is past.

On save, upsert `recording_url` to the database alongside the other fields. If the field is empty or cleared, save `null`.

### Displaying recording status in the mentor's class list

In the mentor's live classes table/list, for past classes that have a `recording_url` set, show a small "Recording added" indicator (a green dot or a label). This helps the mentor see at a glance which past classes have replays and which still need one. This is a display-only change — no new data fetch needed since the recording_url can be included in the existing class list query.

---

## 4. Student Side — Watching a Replay

### Where to change

`/app/student/live-classes/page.tsx` and its academy mirror `/app/academy/live-classes/page.tsx`.

### Query update

The past classes query currently selects:
```ts
.select("id, title, description, provider, starts_at, ends_at")
```

Add `recording_url` to the select:
```ts
.select("id, title, description, provider, starts_at, ends_at, recording_url")
```

### Card update

The past class card currently renders: date badge, title, time range, optional description, "Past" badge.

When `recording_url` is present, add a "Watch replay →" button/link below the description. When `recording_url` is null, render nothing additional — the card looks exactly as it does today.

**"Watch replay →" button behaviour:**
- Opens in a new tab (`target="_blank" rel="noopener noreferrer"`).
- Styled consistently with the existing "Join" button on upcoming classes — use the same CSS class but with a different label and `ghost`/secondary style rather than the primary style (it is an optional action, not the primary CTA).
- No modal or embedded player — just a direct link. This keeps the implementation simple and works with any recording platform (Zoom, YouTube, Loom, Google Drive, etc.).

**Empty state for past classes with no recording:**
The "Past" badge remains. No "recording pending" message needed — absence of the button is sufficient.

---

## 5. Type Updates

Wherever `LiveClass` or an equivalent interface is defined for the student live-classes page, add:
```ts
recording_url: string | null;
```

---

## 6. Testing Checklist

- [ ] Mentor can add a `recording_url` to a past live class via the edit form.
- [ ] Mentor can clear a `recording_url` (set it back to null).
- [ ] Mentor's class list shows "Recording added" indicator for classes with a URL.
- [ ] New/future classes do not show the recording URL field (field only appears for past classes).
- [ ] Student past-class card shows "Watch replay →" link when `recording_url` is set.
- [ ] Clicking "Watch replay →" opens the URL in a new tab.
- [ ] Student past-class card shows no replay link when `recording_url` is null — card appearance unchanged.
- [ ] Fix applies on both `/app/student/live-classes/` and `/app/academy/live-classes/`.
- [ ] `tsc --noEmit` exits clean.

---

## 7. Implementation Order

1. Apply the DB migration (`alter table live_classes add column recording_url text`).
2. Update the mentor live class form to include the recording URL field.
3. Update the mentor class list to show the "Recording added" indicator.
4. Update the student past-class query to select `recording_url`.
5. Update the student past-class card component to conditionally render the replay link.
6. Update the `LiveClass` type interface.
7. Apply identical changes to the `/app/academy/` mirror.
8. Run `tsc --noEmit`.
