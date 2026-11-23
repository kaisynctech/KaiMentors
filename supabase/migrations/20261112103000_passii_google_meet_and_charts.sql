-- PASSII only: allow this academy to connect a Google account for Meet links,
-- and turn on the student gold chart. Other academies are unchanged.
-- Refresh tokens stay in Vault. Authenticated users can see connection status,
-- not the secret id or the token.

create table if not exists public.academy_integrations (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  provider text not null check (provider in ('google_calendar')),
  external_email text,
  vault_secret_id uuid,
  scopes text[] not null default '{}',
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trader_id, provider)
);

create index if not exists academy_integrations_trader_idx
  on public.academy_integrations (trader_id);

alter table public.academy_integrations enable row level security;

drop policy if exists members_read_academy_integrations on public.academy_integrations;
create policy members_read_academy_integrations
  on public.academy_integrations
  for select
  using (public.is_super_admin() or public.is_trader_member(trader_id));

revoke all on public.academy_integrations from anon, authenticated;
grant select (
  id,
  trader_id,
  provider,
  external_email,
  scopes,
  connected_at,
  updated_at
) on public.academy_integrations to authenticated;

drop trigger if exists set_academy_integrations_updated_at on public.academy_integrations;
create trigger set_academy_integrations_updated_at
  before update on public.academy_integrations
  for each row execute function public.set_updated_at();

create or replace function public.upsert_google_calendar_connection(
  p_trader_id uuid,
  p_refresh_token text,
  p_email text,
  p_connected_by uuid,
  p_scopes text[]
)
returns void
language plpgsql
security definer
set search_path = vault, public
as $$
declare
  existing_secret uuid;
  secret_id uuid;
  secret_name text := 'google-calendar-' || p_trader_id::text;
begin
  if p_trader_id is null or p_refresh_token is null or length(p_refresh_token) < 10 then
    raise exception 'invalid google connection';
  end if;

  select vault_secret_id
    into existing_secret
  from public.academy_integrations
  where trader_id = p_trader_id
    and provider = 'google_calendar';

  if existing_secret is not null then
    perform vault.update_secret(
      existing_secret,
      p_refresh_token,
      secret_name,
      'Google Calendar refresh token for academy Meet links',
      null
    );
    secret_id := existing_secret;
  else
    secret_id := vault.create_secret(
      p_refresh_token,
      secret_name,
      'Google Calendar refresh token for academy Meet links',
      null
    );
  end if;

  insert into public.academy_integrations (
    trader_id,
    provider,
    external_email,
    vault_secret_id,
    scopes,
    connected_by
  )
  values (
    p_trader_id,
    'google_calendar',
    nullif(trim(p_email), ''),
    secret_id,
    coalesce(p_scopes, '{}'),
    p_connected_by
  )
  on conflict (trader_id, provider) do update set
    external_email = excluded.external_email,
    vault_secret_id = excluded.vault_secret_id,
    scopes = excluded.scopes,
    connected_by = excluded.connected_by,
    updated_at = now();
end;
$$;

create or replace function public.read_google_calendar_refresh_token(p_trader_id uuid)
returns text
language plpgsql
security definer
set search_path = vault, public
as $$
declare
  secret_id uuid;
  payload text;
begin
  select vault_secret_id
    into secret_id
  from public.academy_integrations
  where trader_id = p_trader_id
    and provider = 'google_calendar';

  if secret_id is null then
    return null;
  end if;

  select decrypted_secret
    into payload
  from vault.decrypted_secrets
  where id = secret_id;

  return payload;
end;
$$;

create or replace function public.disconnect_google_calendar(p_trader_id uuid)
returns void
language plpgsql
security definer
set search_path = vault, public
as $$
declare
  secret_id uuid;
begin
  select vault_secret_id
    into secret_id
  from public.academy_integrations
  where trader_id = p_trader_id
    and provider = 'google_calendar';

  delete from public.academy_integrations
  where trader_id = p_trader_id
    and provider = 'google_calendar';

  if secret_id is not null then
    delete from vault.secrets where id = secret_id;
  end if;
end;
$$;

revoke all on function public.upsert_google_calendar_connection(uuid, text, text, uuid, text[]) from public, anon, authenticated;
revoke all on function public.read_google_calendar_refresh_token(uuid) from public, anon, authenticated;
revoke all on function public.disconnect_google_calendar(uuid) from public, anon, authenticated;
grant execute on function public.upsert_google_calendar_connection(uuid, text, text, uuid, text[]) to service_role;
grant execute on function public.read_google_calendar_refresh_token(uuid) to service_role;
grant execute on function public.disconnect_google_calendar(uuid) to service_role;

update public.portals
set student_portal_features = coalesce(student_portal_features, '{}'::jsonb)
  || jsonb_build_object(
    'charts', true,
    'google_meet_connect', true
  )
where slug = 'pasii';

notify pgrst, 'reload schema';
