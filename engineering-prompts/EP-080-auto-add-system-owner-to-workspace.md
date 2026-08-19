# EP-080 — Auto-Add System Owner to Every New Workspace

## Requirement

`kaisynctech@gmail.com` (the system creator) must automatically be an `owner`
member of every workspace that is ever created — present workspaces and future
ones alike. This allows the system owner to log into any workspace's portal
without manual setup each time.

## Current state

The system owner is already a member of all four existing workspaces (KaiTrades,
Traders Confidence, Milkers FX, PASII) via manually inserted `trader_members`
rows. These rows are correct and must NOT be touched.

The display name `kaisynctech@gmail.com` uses throughout the platform is already
set correctly in the `profiles` table: `full_name = 'Senior Developer'`. No
profile change is required.

## The gap

There is no automation. When a new workspace is created (a new row is inserted
into `traders`), no membership row is added for the system owner. The engineer
who creates the workspace must remember to add it manually — which is fragile
and will eventually be missed.

## Fix: database trigger

Add a PostgreSQL trigger that fires immediately after any new row is inserted
into `traders`. The trigger inserts a `trader_members` row for
`kaisynctech@gmail.com` with `role = 'owner'`. The existing
`UNIQUE (trader_id, user_id)` constraint on `trader_members` means
`ON CONFLICT DO NOTHING` safely handles the edge case where the workspace
creator is `kaisynctech@gmail.com` (and was already added by the creation flow).

---

## Migration SQL

Apply this as a new Supabase migration.

```sql
-- Function: called by trigger on every new traders row
CREATE OR REPLACE FUNCTION auto_add_system_owner_to_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- kaisynctech@gmail.com user_id: 44213ee5-da12-4d06-a7d9-1601d42e79c3
  -- ON CONFLICT DO NOTHING: safe if system owner is also the workspace creator
  INSERT INTO trader_members (trader_id, user_id, role)
  VALUES (
    NEW.id,
    '44213ee5-da12-4d06-a7d9-1601d42e79c3',
    'owner'
  )
  ON CONFLICT (trader_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Trigger: fires after every INSERT on traders
CREATE TRIGGER traders_auto_add_system_owner
AFTER INSERT ON traders
FOR EACH ROW
EXECUTE FUNCTION auto_add_system_owner_to_workspace();
```

## Why SECURITY DEFINER

The trigger function runs as the function owner (a superuser), not as the
invoking session. This ensures the insert succeeds even if the RLS policy on
`trader_members` would not normally allow a background trigger to insert rows
for a third party (the system owner). The `SET search_path = public` prevents
search path injection.

## What does NOT change

- All four existing `trader_members` rows for `kaisynctech@gmail.com` — untouched.
- `profiles.full_name` for `kaisynctech@gmail.com` — already "Senior Developer", no change needed.
- The workspace creation UI/API — unchanged. The trigger is invisible to the application layer.
- RLS policies — unchanged.
- All other triggers on `traders` — unchanged (`audit_traders`, `traders_create_all_students_group`).

---

## Verification after migration

1. Create a new test workspace (insert a row into `traders` via the platform or
   directly via SQL with a throwaway name).
2. Run:
   ```sql
   SELECT tm.role, p.full_name, p.email
   FROM trader_members tm
   JOIN profiles p ON p.id = tm.user_id
   WHERE tm.trader_id = '<new-workspace-id>'
     AND tm.user_id = '44213ee5-da12-4d06-a7d9-1601d42e79c3';
   ```
3. Expected: one row — `role = 'owner'`, `full_name = 'Senior Developer'`,
   `email = 'kaisynctech@gmail.com'`.
4. Delete the test workspace (CASCADE will clean up the `trader_members` row).
5. Confirm the trigger also fires correctly when a real workspace is created
   through the platform UI.
