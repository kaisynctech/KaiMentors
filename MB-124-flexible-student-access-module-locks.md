# Mission Brief MB-124
## Flexible Student Access — Module Locks & Broker Verified Tag

**Status:** Approved — ready for engineering  
**Date:** 2026-07-07  
**Priority:** High — unblock non-broker mentors; support dual-path academies  
**Prepared by:** Enterprise Architect  
**Product Owner decision:** **Uniform student signup** (no broker picker on join). **Two access toggles** in mentor Settings control **module/content locks only**. If mentor has registered broker(s), verification **APIs run** and tag students **`broker_verified`** — independent of locks when “full access” is on. Verification benefits / pricing → **MB-123** (later).

**Depends on:** Existing deferred broker verification (`202606240029_deferred_broker_verification.sql`), `StudentRegistrationForm`, `/api/student/verify`, `VerifyAccountForm`. Does **not** change mentor platform billing (MB-122).

---

## Mission Summary

Today every academy behaves like **Traders Confidence**: students register → broker verification on dashboard → `status = verified` → courses/messages unlock. That blocks **pure educators** and forces **hybrid** academies (Bandile: XM partner + open access) into one rigid path.

PO approved **two toggles** that produce **three effective modes**:

| Toggle 1 | Toggle 2 | Effective mode | Module access | Broker verify (if broker configured) |
|---|---|---|---|---|
| ✅ Require verify to unlock | ❌ | **Strict** (today’s default) | Locked until broker verified | Required to unlock |
| ❌ | ✅ Full access | **Open** | Unlocked for all enrolled students | Optional — no lock |
| ✅ | ✅ | **Open + verify for benefits** | Unlocked for all enrolled students | Runs via API; tags `broker_verified` |

**Rule:** at least **one** toggle must be on.

**Signup/join page:** unchanged — same copy, same `StudentRegistrationForm`, **no broker selection at registration**.

---

## Business Objective

| Goal | Detail |
|---|---|
| **One signup UX** | All academies — same join page |
| **Mentor choice** | Settings control locks, not custom join flows |
| **Broker optional for locks** | Mentor can have XM registered but still give full module access |
| **Broker tag** | When APIs confirm verification → `broker_verified = true` on student (future pricing/perks) |
| **No regression** | Existing FX mentors default to **Strict** |

---

## Problems Today

### 1. Content gated on `status === 'verified'` everywhere

Student routes (`app/student/courses`, messages, resources, etc.) and RLS (`has_verified_access()`) treat **broker verified** as the only path to content.

### 2. No portal-level access policy

`portals` / `traders` have no toggles for “full access without verification”.

### 3. No separate broker tag

`student_applications.status = 'verified'` conflates “broker confirmed” with “can access modules”. Full-access academies need **`broker_verified`** separate from lock policy.

### 4. Signup is already correct (keep it)

`/api/student/register` inserts applications with **null broker fields** and `status = pending`. Broker verify happens on dashboard via `VerifyAccountForm` → `/api/student/verify`. **Do not add broker picker to join.**

---

## Expected Behaviour

### Student signup (unchanged)

1. Join academy → profile + experience + OTP (existing flow).
2. Land on student dashboard — **same for all academies**.
3. **No broker pick** on signup.

### After signup — by access mode

| Mode | Dashboard | Courses / modules | Broker verify UI |
|---|---|---|---|
| **Strict** | Status card + verify form | **Locked** (`ContentGate`) until broker verified | Shown when mentor has broker(s) |
| **Open** | Welcome / academy home | **Unlocked** immediately (if application not rejected) | Hidden if no brokers; optional if brokers exist |
| **Both** | Welcome + optional “Verify for partner benefits” | **Unlocked** immediately | Shown when mentor has broker(s); verify tags student, does not unlock (already open) |

### Broker verification (when mentor has ≥1 active `trader_broker_accounts`)

- Existing **API adapters** (`/api/student/verify`, edge functions) **unchanged in v1**.
- On successful verify → set `broker_verified = true`, `broker_verified_at = now()`, keep/update `status = 'verified'` as today.
- On manual mentor approval → same tag.
- **Strict mode:** verify still required before module access.
- **Open / Both:** modules already open; tag stored for mentor student list + future MB-123.

### Rejected / suspended students

- `status = 'rejected'` → **no module access** in any mode.

---

## Architecture Summary

```mermaid
flowchart TB
  subgraph signup [Student signup - unchanged]
    REG[StudentRegistrationForm]
    APP[student_applications pending]
  end

  subgraph policy [Portal access policy]
    T1[require_broker_verification_for_modules]
    T2[allow_full_access_without_verification]
  end

  subgraph verify [Broker APIs - if brokers configured]
    API[/api/student/verify]
    TAG[broker_verified = true]
  end

  subgraph gate [Content access]
    FN[has_student_module_access]
    UI[ContentGate / unlocked routes]
  end

  REG --> APP
  policy --> FN
  APP --> FN
  TAG --> APP
  FN --> UI
  API --> TAG
```

**Two independent axes:**

1. **Lock policy** (toggles) → `has_student_module_access()`
2. **Broker tag** (`broker_verified`) → mentor visibility + future benefits (MB-123)

---

## Current Codebase (starting point)

| Area | Status |
|---|---|
| Student join | **No broker pick** — `components/student-registration-form.tsx`, `/api/student/register` |
| Broker verify | Dashboard — `VerifyAccountForm`, `/api/student/verify` |
| Content lock | `status === 'verified'` + `ContentGate` on student routes |
| RLS | `has_verified_access(trader_id)` — `status = 'verified'` only |
| Broker fields | Nullable on `student_applications` (deferred verification migration) |
| Mentor settings | No access toggles yet — add under Settings |

---

## Implementation Scope

### IN scope — v1

#### A — Database

**New migration:** `supabase/migrations/202607081800_student_access_policy.sql`

1. **Portal access columns** on `public.portals`:

```sql
alter table public.portals
  add column require_broker_verification_for_modules boolean not null default true,
  add column allow_full_access_without_verification boolean not null default false;

alter table public.portals
  add constraint portals_student_access_policy_valid
    check (
      require_broker_verification_for_modules
      or allow_full_access_without_verification
    );
```

2. **Broker verified tag** on `public.student_applications`:

```sql
alter table public.student_applications
  add column if not exists broker_verified boolean not null default false,
  add column if not exists broker_verified_at timestamptz;
```

Backfill: `broker_verified = true` where `status = 'verified'`.

3. **Replace / extend access helper** — new canonical function:

```sql
create or replace function public.has_student_module_access(target_trader_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.student_applications application
    join public.portals portal on portal.id = application.portal_id
    where application.trader_id = target_trader_id
      and application.student_user_id = auth.uid()
      and application.status <> 'rejected'
      and (
        portal.allow_full_access_without_verification
        or (
          portal.require_broker_verification_for_modules
          and (
            application.broker_verified
            or application.status = 'verified'
          )
        )
      )
  );
$$;
```

4. **Keep `has_verified_access` for backward compat** — implement as alias or update to:

```sql
-- Strict semantic: broker verified tag OR legacy verified status
select broker_verified or status = 'verified' ...
```

**Prefer:** update RLS policies on courses, lessons, resources, etc. to use `has_student_module_access(trader_id)` instead of `has_verified_access(trader_id)` where the intent is module/content access.

5. **Grandfather backfill** — all existing portals:

```sql
update public.portals
set
  require_broker_verification_for_modules = true,
  allow_full_access_without_verification = false;
```

6. Trigger or app hook: when verify succeeds, set `broker_verified = true` (in `/api/student/verify` + mentor review RPC).

#### B — Server helper

**New file:** `lib/student-access.ts`

```typescript
getPortalAccessPolicy(portalId | traderId)
hasStudentModuleAccess(traderId, application, portalPolicy): boolean
isBrokerVerificationRequiredForModules(portalPolicy): boolean
shouldShowBrokerVerificationUI(portalPolicy, hasActiveBrokers): boolean
```

#### C — Mentor Settings UI

**Location:** `app/dashboard/settings/page.tsx` — new tab **Student access** (or section under Branding).

Two checkboxes:

- ☐ **Require broker verification to unlock modules**
- ☐ **Give all students full access (no locked modules)**

Validation: at least one checked (client + server).

Helper copy:

| State | Copy |
|---|---|
| Strict only | “Students must verify with a partner broker before courses and academy content unlock.” |
| Open only | “All enrolled students get full content access. Broker verification is not required.” |
| Both | “All students get full access. If you have broker partners configured, students can still verify — verified students are tagged for partner benefits (coming soon).” |

Persist via `PATCH /api/portal/access-policy` or extend existing portal settings route.

#### D — Student UI (module locks only)

| File / area | Change |
|---|---|
| `app/student/page.tsx` | Use `hasStudentModuleAccess` for verified sections; show verify form when `shouldShowBrokerVerificationUI` |
| `app/student/courses/**` | Replace `status === 'verified'` gate with module access helper |
| `app/student/messages`, `resources`, `groups`, `community`, `live-classes`, `bookings/**` | Same — one helper, consistent behavior |
| `components/content-gate.tsx` | Optional prop: `mode: 'broker_verify' \| 'generic'` — copy reflects lock reason |
| `components/student-shell-client.tsx` | Nav `locked` flags follow module access, not raw `isVerified` |
| `components/academy-join-page.tsx` | **No structural change** — optional: hide hardcoded XM badge when portal has no brokers (white-label hygiene — sub-task if quick) |

#### E — Verify API

`app/api/student/verify/route.ts`:

- On success → set `broker_verified = true`, `broker_verified_at = now()`.
- Still set `status = 'verified'` when appropriate (strict + both modes).
- **Open-only mode:** still tag on verify; do not treat as required for access.

#### F — Mentor student list

Show badge **Broker verified** when `broker_verified = true` (dashboard students table — minimal column or tag).

#### G — Engineering prompt **EP-124**.

### OUT of scope (v1)

- Changing signup form fields or broker picker (must not add one).
- Partner vs standard **pricing** (MB-123).
- Per-course or per-module lock overrides.
- Manual approval queue changes beyond broker tag.
- Removing `VerifyAccountForm` broker dropdown **on dashboard** when multiple brokers (keep — student picks broker **at verify time**, not signup).
- Student monetization / Paystack.

---

## Access Policy Truth Table

| require_verify | allow_full_access | has_brokers | Student registers | Modules | Verify UI | broker_verified after API |
|---|---|---|---|---|---|---|
| T | F | Y | pending | Locked | Yes | T → unlocks |
| T | F | N | pending | Locked* | No | N/A — mentor should add broker or enable full access |
| F | T | N | pending | Open | No | N/A |
| F | T | Y | pending | Open | Optional | T when completed |
| T | T | Y | pending | Open | Yes (benefits) | T when completed |
| T | T | N | pending | Open | No | N/A |

\*Strict + no brokers: edge case — treat as open for modules OR show mentor settings warning “Add a broker or enable full access”. **Recommend:** mentor dashboard warning only; students see generic “contact mentor” if locked with no broker path (rare misconfiguration).

---

## RLS & API Checklist

Replace or supplement `has_verified_access` with `has_student_module_access` on:

- `courses`, `lessons`, `course_modules`, `lesson_content_blocks` (published read)
- `resources` (student read)
- `messages` / conversations (student read where applicable)
- Storage policies for `course-content` bucket (student read)

Mentor mutations: unchanged (`is_trader_member`).

Audit each `app/student/**` page that checks `.eq("status", "verified")` — switch to module access helper.

---

## UI Copy (student)

**Strict — locked modules (`ContentGate`):**

> Complete broker verification to unlock your courses and academy content.

**Both — modules open, verify available:**

> **Optional:** Verify with a partner broker to unlock partner benefits.

**Open — no brokers:**

> Welcome to {Academy}. Your courses are ready.

---

## Testing Requirements

**Environments:** KaiTrades acceptance + one strict portal (TC) + one test portal with toggles.

### Test 1 — Grandfather (TC / PASII)

1. Deploy migration with backfill.
2. **Pass:** TC portal `require=true`, `allow=false`.
3. **Pass:** Unverified student still sees locked modules on TC.

### Test 2 — Strict mode (default)

1. New student registers on strict portal.
2. **Pass:** Signup unchanged, no broker on form.
3. **Pass:** Courses locked until verify API succeeds.
4. **Pass:** `broker_verified = true` after verify.

### Test 3 — Full access mode

1. Mentor enables **full access only** on test portal.
2. New student registers.
3. **Pass:** Courses **open** while `status = pending`.
4. **Pass:** No verify form required if no brokers.

### Test 4 — Both toggles + brokers

1. Mentor enables **both**; has XM broker configured.
2. New student registers → modules **open** immediately.
3. Student completes verify → `broker_verified = true`; modules stay open.
4. **Pass:** Mentor student list shows broker verified badge.

### Test 5 — Rejected student

1. Reject application.
2. **Pass:** No module access in any mode.

### Test 6 — Settings validation

1. Try to save both toggles off.
2. **Pass:** Validation error.

### Test 7 — RLS

1. Full-access student (pending, not broker verified) queries published course.
2. **Pass:** RLS allows read via `has_student_module_access`.

### Test 8 — Build

`npm run build` passes.

---

## Acceptance Criteria

- [ ] Student signup/join **unchanged** — no broker picker on registration
- [ ] Mentor Settings has **two access toggles**; at least one required
- [ ] **Strict** mode matches current TC behavior (locked until verified)
- [ ] **Full access** mode unlocks modules for enrolled non-rejected students
- [ ] **Both** mode: full access + broker verify tags `broker_verified`
- [ ] `broker_verified` column set on successful API/manual verification
- [ ] All existing live portals default **Strict** (no surprise open access)
- [ ] RLS + student routes use `has_student_module_access` consistently
- [ ] EP-124 completed
- [ ] Product Owner confirms on TC (strict) and one open test academy

---

## Definition of Done

- [ ] Migration applied to production Supabase
- [ ] Tests 1–8 pass
- [ ] Deployed to Vercel production
- [ ] Product Owner sign-off

---

## Future (MB-123+)

- Product/plan rules: `requires_broker_verified` for partner pricing
- Auto-offer verify CTA when both toggles on + student not yet tagged
- Per-module “free preview” vs locked

---

## Commit message suggestion

```
feat: MB-124 flexible student access policy and broker_verified tag
```
