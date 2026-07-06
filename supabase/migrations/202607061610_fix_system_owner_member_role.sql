-- Fix: system owner must not take the sole trader_members.owner slot.
-- provision_invited_academy inserts the invited user as owner; this trigger
-- previously used role 'owner' and caused trader_members_one_owner_idx violations.

create or replace function public.auto_add_system_owner_to_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.trader_members (trader_id, user_id, role)
  values (
    new.id,
    '44213ee5-da12-4d06-a7d9-1601d42e79c3',
    'admin'
  )
  on conflict (trader_id, user_id) do nothing;

  return new;
end;
$$;

-- Downgrade existing system-owner rows that incorrectly hold owner role.
update public.trader_members
set role = 'admin'
where user_id = '44213ee5-da12-4d06-a7d9-1601d42e79c3'
  and role = 'owner'
  and trader_id in (
    select id from public.traders
    where owner_user_id <> '44213ee5-da12-4d06-a7d9-1601d42e79c3'
  );
