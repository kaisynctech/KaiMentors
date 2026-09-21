-- Edge Functions cannot read vault.decrypted_secrets through PostgREST.
-- Service role loads XM tokens through this definer function instead.
create or replace function public.read_broker_vault_secret(target_secret_id uuid)
returns text
language plpgsql
security definer
set search_path = vault, public
as $$
declare
  payload text;
begin
  if target_secret_id is null then
    return null;
  end if;

  select decrypted_secret
    into payload
  from vault.decrypted_secrets
  where id = target_secret_id;

  return payload;
end;
$$;

revoke all on function public.read_broker_vault_secret(uuid) from public;
revoke all on function public.read_broker_vault_secret(uuid) from anon, authenticated;
grant execute on function public.read_broker_vault_secret(uuid) to service_role;

notify pgrst, 'reload schema';
