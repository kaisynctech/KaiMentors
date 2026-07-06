# Mission Brief MB-115
## Fix Mentor Workspace Join → Dashboard; Remove Per-Email Invites

**Status:** Approved for Engineering  
**Date:** 2026-07-06  
**Priority:** Critical — Broken mentor onboarding on production custom domains  
**Prepared by:** Enterprise Architect  
**Product Owner decision:** Permanent workspace link only. Per-email mentor invitations are retired.

---

## Mission Summary

When a new mentor completes onboarding via the **permanent workspace invite link** (`/join/workspace/[token]`), they are incorrectly redirected to the **student** registration page (`/join-academy`) instead of the mentor dashboard. Root cause: OTP signup creates `profiles.role = 'student'`, and the workspace completion API never promotes them to `trader`. Middleware then blocks `/dashboard` and routes them through the student academy flow.

Additionally, the Product Owner has decided to **remove the per-email invitation system entirely**. Only the copyable permanent workspace link remains.

---

## Business Objective

Workspace owners must be able to copy one link, send it to any prospective mentor, and have that mentor land on the **mentor dashboard** on the portal's custom domain after completing signup and email verification — without ever seeing the student join form.

---

## Business Value

- Unblocks mentor team growth for all client portals (TC, PASII, Milkers FX, KaiTrades).
- Eliminates confusion between student signup and mentor onboarding.
- Simplifies the Teams UI to a single, reliable invitation mechanism.

---

## Background

- **EP-090** introduced the permanent workspace invite link (`traders.invite_token` → `/join/workspace/[token]`).
- **EP-072 / EP-084** introduced per-email invitations (`workspace_invitations` → `/join/[invitationId]`).
- **MB-112** serves the mentor dashboard on custom domains; post-join redirect to `/dashboard` is correct in `join-workspace-form.tsx` but middleware rejects non-`trader` roles.
- **MB-114** fixed student no-application redirects to `/join-academy` — which now catches misclassified mentors and exposes the bug visibly.

---

## Current Behaviour

1. Owner copies permanent link from Teams → e.g. `https://www.md415.com/join/workspace/{token}`.
2. New mentor fills name, email, password → receives OTP → verifies.
3. Client calls `POST /api/join/workspace/complete` → creates `trader_members` row (`role: mentor`) and upserts `profiles.full_name` only.
4. `signInWithOtp({ shouldCreateUser: true })` triggers `handle_new_user()` → `profiles.role = 'student'` (default).
5. Form redirects to `/dashboard`.
6. Middleware (`middleware.ts` ~142–161): `profile.role !== 'trader'` and `role === 'student'` → redirect to `/academy`.
7. Student page: no `student_applications` row → redirect to `/join-academy` (student registration form).

**Evidence (production DB, 2026-07-06):**

```sql
SELECT p.email, p.role, tm.role AS member_role
FROM trader_members tm
JOIN profiles p ON p.id = tm.user_id
JOIN traders t ON t.id = tm.trader_id
JOIN portals po ON po.trader_id = t.id
WHERE po.slug = 'traders-confidence' AND tm.role = 'mentor';
```

| email | profiles.role | trader_members.role |
|---|---|---|
| nyaradzondoro1@gmail.com | **student** | mentor |

User is in the workspace but cannot reach the dashboard.

---

## Expected Behaviour

1. Mentor completes `/join/workspace/[token]` flow on custom domain.
2. `profiles.role` is set to **`trader`** at completion.
3. Redirect to `/dashboard` succeeds on custom domain.
4. Mentor sees Traders Confidence (or relevant portal) dashboard — never `/join-academy`.
5. Teams settings shows **only** the permanent workspace invite link — no email invite form, no pending invitations list.

---

## Root Cause

`app/api/join/workspace/complete/route.ts` upserts the profile without setting `role: 'trader'`:

```typescript
admin.from("profiles").upsert({ id: user.id, full_name: fullName }, { onConflict: "id" })
```

New users created via OTP always receive `profiles.role = 'student'` from `handle_new_user()`. Middleware gates `/dashboard` on `profiles.role === 'trader'`.

The same omission exists in `app/api/join/complete/route.ts` (per-email path being removed).

---

## Affected Systems

| System | Impact |
|---|---|
| `app/api/join/workspace/complete/route.ts` | **Fix** — set `role: 'trader'` |
| `middleware.ts` | No change required if role is set correctly |
| `components/team-manager.tsx` | **Remove** per-email invite UI |
| `app/dashboard/settings/page.tsx` | **Remove** invitations query + prop |
| `app/api/workspace/mentors/route.ts` | **Remove** POST handler; simplify GET |
| Per-email invite routes/pages | **Delete** |
| Production DB | **One-off repair** for misclassified mentors |

---

## Architecture Summary

### Fix (minimal)

On workspace join completion, upsert profile with `role: 'trader'`:

```typescript
admin.from("profiles").upsert(
  { id: user.id, full_name: fullName, role: "trader" },
  { onConflict: "id" },
)
```

Apply only when creating a new workspace membership (inside the `if (!existing)` block). If user is already a member (idempotent re-join), do not downgrade an existing `super_admin` role — preserve existing role if already `trader` or `super_admin`.

### Remove per-email invites (Product Owner approved)

Delete dead code paths. **Do not drop** the `workspace_invitations` table or `invite_mentor_to_workspace` RPC in this mission — no migration required; table becomes unused. (Future cleanup optional.)

---

## Implementation Scope

### IN scope

1. Fix `profiles.role` on workspace join complete.
2. One-off SQL repair for existing misclassified mentors.
3. Remove per-email invitation UI from Teams settings.
4. Delete per-email join page, form, API routes, and email send path.
5. Simplify `GET /api/workspace/mentors` (members only, no pending invitations).

### OUT of scope

- Dropping `workspace_invitations` table / RPC (future mission).
- Changes to student `/join-academy` flow.
- Middleware role-check refactor (not needed once role is set at join).
- Resend domain verification (`kaisyncworkflow.com`).

---

## Files Expected

### Modify

| File | Change |
|---|---|
| `app/api/join/workspace/complete/route.ts` | Set `role: 'trader'` on profile upsert |
| `components/team-manager.tsx` | Remove email invite form, pending invitations section, related state/handlers; keep permanent link section only |
| `app/dashboard/settings/page.tsx` | Remove `workspace_invitations` query; drop `invitations` prop from `TeamManager` |
| `app/api/workspace/mentors/route.ts` | Remove POST handler, `sendWorkspaceInvitation` import, invitations from GET response |

### Delete

| File | Reason |
|---|---|
| `app/join/[token]/page.tsx` | Per-email join page |
| `components/join-form.tsx` | Per-email join form (keep `join-form.module.css` — used by `join-workspace-form.tsx`) |
| `app/api/join/complete/route.ts` | Per-email completion API |
| `app/api/workspace/invitations/[invitationId]/route.ts` | Cancel invitation API |
| `app/api/workspace/invitations/[invitationId]/resend/route.ts` | Resend invitation API |

### Do not delete

| File | Reason |
|---|---|
| `components/join-form.module.css` | Shared styles for `join-workspace-form.tsx` |
| `app/join/workspace/[token]/page.tsx` | Permanent link — keep |
| `components/join-workspace-form.tsx` | Permanent link form — keep |
| `app/api/workspace/invite-token/route.ts` | Reset permanent link — keep |

### Optional cleanup (only if no remaining references)

- Remove `sendWorkspaceInvitation` from `lib/email.ts` if nothing else imports it.

---

## Database Impact

### No migration file required

### One-off repair (run via Supabase SQL editor or `supabase db query --linked`)

Promote any user who is a workspace mentor but still has `student` profile role:

```sql
UPDATE public.profiles p
SET role = 'trader'
FROM public.trader_members tm
WHERE tm.user_id = p.id
  AND tm.role IN ('mentor', 'owner')
  AND p.role = 'student';
```

Verify before and after:

```sql
SELECT p.email, p.role, tm.role AS member_role, po.slug
FROM trader_members tm
JOIN profiles p ON p.id = tm.user_id
JOIN traders t ON t.id = tm.trader_id
JOIN portals po ON po.trader_id = t.id
WHERE tm.role IN ('mentor', 'owner')
  AND p.role = 'student';
```

Expected after repair: **0 rows**.

---

## Shared Components

- `join-workspace-form.tsx` — redirect to `/dashboard` is already correct; no change needed unless adding error handling for role mismatch (not required).
- `middleware.ts` — read-only reference; do not modify unless fix proves insufficient.
- `handle_new_user()` trigger — no change; role correction happens at join completion (same pattern as mentor provisioning elsewhere).

---

## Related Bug Sweep (completed by Architect)

| Area | Finding |
|---|---|
| `app/api/join/complete/route.ts` | Same missing `role` — file being deleted |
| `app/academy/resources/page.tsx` | Old `joinAcademyPath` pattern — unrelated; separate brief if needed |
| Pending `workspace_invitations` rows | **0** in production — safe to remove UI/API |
| `/join/workspace/` middleware pass-through | MB-113 already excludes `/join/` from domain-sites rewrite ✓ |

---

## Regression Risks

| Risk | Mitigation |
|---|---|
| Existing student users accidentally promoted | Repair SQL scopes to `trader_members` rows only |
| Owner role downgraded on re-join | Idempotent path: skip role update if `existing` member |
| `super_admin` test account affected | Exclude `super_admin` from role overwrite in upsert |
| Broken imports after file deletion | Run `npm run build` |
| Custom domain join link 404 | Verify `/join/workspace/[token]` still passes middleware |

---

## Testing Requirements

### Test 1 — New mentor via permanent link (primary)

**Environment:** Traders Confidence custom domain (`www.md415.com`)  
**Use:** Fresh email never registered on platform

1. Owner → Settings → Team → copy **Workspace invite link**.
2. Open link in incognito → complete name, email, password, OTP.
3. **Pass:** Lands on `https://www.md415.com/dashboard` with TC branding.
4. **Fail:** Any redirect to `/join-academy`, `/academy`, or `kaimentors.vercel.app`.

### Test 2 — DB role verification

After Test 1:

```sql
SELECT email, role FROM profiles WHERE email = '<test-email>';
```

**Pass:** `role = 'trader'`

### Test 3 — Repair existing account

1. Sign in as `nyaradzondoro1@gmail.com` (after SQL repair).
2. Navigate to `https://www.md415.com/dashboard`.
3. **Pass:** Dashboard loads.

### Test 4 — Teams UI

1. Owner → Settings → Team.
2. **Pass:** Permanent workspace link + copy + reset visible.
3. **Pass:** No "Invite a mentor" email form, no "Pending invitations" section.

### Test 5 — Dead routes removed

- `GET /join/{uuid}` (old per-email path) → **404**
- `POST /api/workspace/mentors` with email body → **404 or 405**

### Test 6 — Student flow unaffected

1. Visit `www.md415.com/join-academy` unauthenticated.
2. **Pass:** Student registration form still loads.

---

## Acceptance Criteria

- [ ] New mentor completing permanent link lands on `/dashboard` on custom domain
- [ ] `profiles.role = 'trader'` after workspace join completion
- [ ] Existing misclassified mentor (`nyaradzondoro1@gmail.com`) can access dashboard after repair
- [ ] Per-email invite UI and API removed
- [ ] Permanent workspace link flow unchanged and working
- [ ] `npm run build` passes
- [ ] Student `/join-academy` flow unaffected

---

## Definition of Done

- Business behaviour passes Tests 1–6
- SQL repair executed and verified (0 mentor/owner rows with `student` role)
- No KaiMentors branding leak on mentor onboarding path
- Deployed to production
- Product Owner confirms mentor invite flow on TC custom domain

---

## Commit message suggestion

```
fix: MB-115 set trader role on workspace join; remove per-email mentor invites
```
