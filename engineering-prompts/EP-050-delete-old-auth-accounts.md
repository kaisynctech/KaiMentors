# EP-050 — Delete old auth accounts

## Context

Two legacy auth accounts are no longer linked to any workspace. Ownership of Traders Confidence
and Milkers FX has been transferred to `kaisynctech@gmail.com`. These accounts should be
permanently removed from Supabase auth.

**Supabase project:** `jsbpfhfmumjbrnymhtvq`

---

## Accounts to delete

| Email | User ID |
|---|---|
| `nyaristo01@gmail.com` | `e8041ba1-fba8-4232-8b2c-4fbefb26ed76` |
| `nyaradzondoro1@gmail.com` | `4cbee2a5-7444-4408-8b0a-1415fd4cda91` |

---

## Task

Write and run a one-off Node script that deletes both accounts via the Supabase admin API.

### `scripts/delete-old-auth-accounts.ts`

```ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const USER_IDS = [
  "e8041ba1-fba8-4232-8b2c-4fbefb26ed76", // nyaristo01@gmail.com
  "4cbee2a5-7444-4408-8b0a-1415fd4cda91", // nyaradzondoro1@gmail.com
];

for (const id of USER_IDS) {
  const { error } = await supabase.auth.admin.deleteUser(id);
  if (error) {
    console.error(`Failed to delete ${id}:`, error.message);
  } else {
    console.log(`Deleted ${id}`);
  }
}
```

### Run

```bash
npx tsx scripts/delete-old-auth-accounts.ts
```

### Verify

```bash
# Should return 0 rows
npx supabase db execute --project-ref jsbpfhfmumjbrnymhtvq \
  "SELECT email FROM auth.users WHERE email IN ('nyaristo01@gmail.com','nyaradzondoro1@gmail.com');"
```

### After confirming

Delete `scripts/delete-old-auth-accounts.ts` — it is a one-off and should not be committed long-term.

---

## Acceptance criteria

- [ ] `nyaristo01@gmail.com` no longer exists in `auth.users`
- [ ] `nyaradzondoro1@gmail.com` no longer exists in `auth.users`
- [ ] KaiTrades, Traders Confidence, Milkers FX, and PASII all show `kaisynctech@gmail.com` as owner when queried
- [ ] Script file deleted after successful run
