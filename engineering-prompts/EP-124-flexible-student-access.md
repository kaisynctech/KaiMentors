# EP-124 — Flexible student access policy (MB-124)

Implementer checklist for module locks and `broker_verified` tag.

## Rules (do not change)

| Rule | Detail |
|---|---|
| Signup | **Unchanged** — no broker picker on join |
| Default mode | **Strict** for all existing portals |
| Toggles | At least **one** must be on |
| Broker tag | `broker_verified` separate from module locks |

## Migration

Apply `supabase/migrations/202607081800_student_access_policy.sql`

Verify grandfather:

```sql
select portal_name, require_broker_verification_for_modules, allow_full_access_without_verification
from portals;
```

## App changes

- `lib/student-access.ts` + `lib/student-access-server.ts`
- Mentor Settings → **Student access** tab
- `PATCH /api/portal/access-policy`
- Student routes use `hasModuleAccess` not `status === 'verified'`
- `StudentShell` nav locks follow module access
- `ContentGate` broker vs generic copy
- `/api/student/verify` sets `broker_verified`
- Mentor student list shows **Broker verified** badge

## Tests

1. Grandfather — existing portals strict
2. Strict mode — locked until verify
3. Full access — modules open while pending
4. Both toggles — open + optional verify tags `broker_verified`
5. Rejected — no access any mode
6. Settings validation — both off rejected
7. RLS — full-access pending student reads courses
8. `npm run build`

## Commit

```
feat: MB-124 flexible student access policy and broker_verified tag
```
