# Architect Handoff — Student Onboarding 4-Step Flow
**Status:** Ready for Architect Review  
**Date:** 2026-06-24  
**Design Spec:** `docs/STUDENT_ONBOARDING_DESIGN_SPEC.md`

---

## Objective

Replace the current single-page `StudentRegistrationForm` with a 4-step multi-step form. Add three new student data fields (`trading_level`, `years_trading`, `trading_challenge`). Surface `trading_level` as a read-only tag on the mentor Students dashboard.

---

## Scope

**In scope:**
- New columns on `student_applications`
- `/api/student/register` accepts and stores the new fields
- `StudentRegistrationForm` — full rewrite to 4-step multi-step React component
- `student-registration-form.module.css` — new styles for step indicator, level cards, broker guide, disclaimer card
- `get_student_applications_page` RPC — return `trading_level` in the student row response
- Students dashboard component — render level tag

**Out of scope:**
- `AcademyJoinPage` layout — no changes
- `/account-setup` flow — no changes
- Group creation from level — separate future feature
- Any other dashboard pages
- Mentor ability to edit/override the student's self-reported level

---

## Database Changes

### Migration: `student_applications` — new columns

```sql
ALTER TABLE public.student_applications
  ADD COLUMN trading_level text
    CHECK (trading_level IN ('beginner', 'intermediate', 'advanced', 'funded'))
    DEFAULT NULL,
  ADD COLUMN years_trading text
    CHECK (years_trading IN ('less_than_1', '1_to_3', '3_to_5', '5_plus'))
    DEFAULT NULL,
  ADD COLUMN trading_challenge text
    CHECK (char_length(trading_challenge) <= 500)
    DEFAULT NULL;
```

- `trading_level` is nullable (existing students have no value — that is acceptable).
- No backfill required.
- RLS: existing policies cover the new columns automatically (same table, same row ownership).

---

## API Changes

### `/api/student/register`

Accept three new optional-but-expected fields from the form body:

| Field name | Maps to | Validation |
|---|---|---|
| `tradingLevel` | `trading_level` | Must be one of `beginner`, `intermediate`, `advanced`, `funded` if present. Null if absent or empty. |
| `yearsTrading` | `years_trading` | Must be one of `less_than_1`, `1_to_3`, `3_to_5`, `5_plus` if present. Null if absent or empty. |
| `tradingChallenge` | `trading_challenge` | String, max 500 chars. Strip at server. Null if absent or empty. |

The `tradingLevel` field is required on the form (Step 2) but the API should treat it as nullable — the API's job is to store what it receives safely, not to enforce UX flow rules. If `tradingLevel` is present and not one of the four valid values, reject with 422.

The `INSERT` into `student_applications` adds these three columns.

---

## RPC Changes

### `get_student_applications_page`

Add `trading_level` to the returned columns so the mentor Students dashboard can read it.

No other changes to this RPC's signature, pagination, or filtering logic.

---

## Frontend Changes

### `StudentRegistrationForm` — full rewrite

Replace the current single-page form with a 4-step component. All step logic lives in React state (`useState` for current step, all field values). The `<form action={submit}>` wrapper stays — the submit action fires on the final step.

Step structure:
1. **Profile** — fullName, email, phoneNumber
2. **Experience** — tradingLevel (required radio cards), yearsTrading (optional select), tradingChallenge (optional textarea)
3. **Broker** — brokerConnectionId (select), hasAccount toggle, tradingAccountNumber + platformAccountNumber + screenshotProof (shown when hasAccount = yes), affiliate link + step guide (shown when hasAccount = no), Next disabled when hasAccount = no
4. **Review** — what-happens-next box, risk disclaimer card, consent checkbox

Hidden inputs carry all collected values through to the final form submit so `FormData` includes everything when `action={submit}` fires.

Step indicator: row of 4 numbered dots at top of card. Active = filled with `primaryColor`. Completed = checkmark. Upcoming = outlined.

Level cards: 2×2 grid, each card is a `<label>` wrapping a visually hidden `<input type="radio">`. Selected card border uses `primaryColor`.

Broker guide: collapsed `<div>` that expands when `hasAccount === 'no'`. Contains 4 numbered steps and the affiliate link.

Disclaimer: bordered `<div>` with warning heading and risk disclosure paragraph.

On success (API returns 200): show brief success state (checkmark icon, "Application submitted!", one-line note), then after 1.5s redirect to `/account-setup` as current.

### `student-registration-form.module.css`

Add styles for:
- `.steps` — step indicator row
- `.stepDot`, `.stepDot.active`, `.stepDot.done` — individual dots
- `.levelGrid` — 2×2 radio card grid
- `.levelCard`, `.levelCard.selected` — individual level card
- `.brokerGuide` — hidden/shown guide panel
- `.disclaimerCard` — bordered risk disclosure
- `.reviewBox` — what-happens-next panel

All existing styles stay (`.form`, `.field`, `.upload`, `.affiliate`, `.consent`, `.submit`, `.error`, `.success`, `.spin`).

### Students dashboard component

In the student row, add a `<span>` badge after the student name that reads the `trading_level` value and renders the appropriate tag:

| Value | Label | Colour |
|---|---|---|
| `beginner` | Beginner | `#1d4ed8` (blue) |
| `intermediate` | Intermediate | `#b45309` (amber) |
| `advanced` | Advanced | `#15803d` (green) |
| `funded` | Funded Trader | `#7e22ce` (purple) |

If `trading_level` is null, render nothing — no tag.

---

## Business Rules

1. `trading_level` is set once at registration and never updated by students or mentors via the platform UI. It is a historical record of what the student reported when they applied.
2. The tag is purely informational. It does not affect access, verification, group membership, or any access control decision.
3. No migration changes KaiTrades fixture data — acceptance test students created by the runner will simply have `trading_level = null`, which is valid.
4. The acceptance runner must still pass 31/31 without modification.

---

## Edge Cases

- Student submits Step 2 without selecting a level — the Next button is disabled so this should not happen, but the API also accepts null safely.
- Student navigates back from Step 3 to Step 2 — level selection must be preserved in React state.
- Academy has no brokers configured — the "This academy has not enabled registration yet" message appears in Step 3, all broker fields are hidden, Next is disabled.
- Student selects a broker, enters "No, not yet" — Next is disabled; the guide and affiliate link are shown.
- Student selects a broker, enters "Yes" but leaves account fields blank — Next is disabled (required fields not filled).

---

## Acceptance Criteria

See `docs/STUDENT_ONBOARDING_DESIGN_SPEC.md` Section 7.

---

## Documentation Closeout

On completion, update:
- `docs/STUDENTS.md` — document the new `trading_level`, `years_trading`, `trading_challenge` fields and their purpose
- `docs/PRODUCT_STATUS.md` — mark Student Onboarding 4-Step Flow as complete
- `docs/CHANGELOG.md` — add entry
