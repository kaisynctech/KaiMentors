create type public.academy_invitation_status as enum (
  'pending',
  'accepted',
  'expired',
  'revoked'
);

create type public.ownership_transfer_status as enum (
  'pending',
  'completed',
  'cancelled'
);

create table public.risk_disclosure_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique check (template_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null,
  message text not null,
  is_active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index risk_disclosure_templates_default_idx
  on public.risk_disclosure_templates (is_default) where is_default;

insert into public.risk_disclosure_templates (
  template_key,
  title,
  message,
  is_default
)
values (
  'standard-trading-risk',
  'Trading Risk Notice',
  'Trading financial markets involves risk and may not be suitable for everyone. Educational content does not constitute financial advice. Never trade with money you cannot afford to lose.',
  true
)
on conflict (template_key) do update set
  title = excluded.title,
  message = excluded.message,
  is_active = true,
  is_default = true;

alter table public.portals
  add column if not exists academy_description text,
  add column if not exists contact_email text,
  add column if not exists risk_disclosure_template_id uuid
    references public.risk_disclosure_templates(id) on delete restrict,
  add column if not exists risk_disclosure_enabled boolean not null default true;

update public.portals
set risk_disclosure_template_id = (
  select id from public.risk_disclosure_templates where is_default limit 1
)
where risk_disclosure_template_id is null;

alter table public.portals
  alter column website_delivery_mode set default 'core_page',
  alter column risk_disclosure_template_id set not null;

create table public.academy_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  legal_name text not null,
  display_name text not null,
  portal_slug text not null check (portal_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  package_id uuid references public.custom_site_packages(id) on delete restrict,
  invited_user_id uuid references public.profiles(id) on delete set null,
  trader_id uuid references public.traders(id) on delete set null,
  status public.academy_invitation_status not null default 'pending',
  invited_by uuid not null references public.profiles(id) on delete restrict,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email = lower(email)),
  unique (email, status)
);

create index academy_invitations_status_expires_idx
  on public.academy_invitations (status, expires_at);

create table public.trader_ownership_transfers (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  from_user_id uuid not null references public.profiles(id) on delete restrict,
  to_user_id uuid not null references public.profiles(id) on delete restrict,
  status public.ownership_transfer_status not null default 'pending',
  requested_by uuid not null references public.profiles(id) on delete restrict,
  completed_by uuid references public.profiles(id) on delete restrict,
  reason text not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_user_id <> to_user_id)
);

create index trader_ownership_transfers_trader_status_idx
  on public.trader_ownership_transfers (trader_id, status, created_at desc);

create trigger set_risk_disclosure_templates_updated_at
  before update on public.risk_disclosure_templates
  for each row execute function public.set_updated_at();
create trigger set_academy_invitations_updated_at
  before update on public.academy_invitations
  for each row execute function public.set_updated_at();
create trigger set_trader_ownership_transfers_updated_at
  before update on public.trader_ownership_transfers
  for each row execute function public.set_updated_at();

create trigger audit_risk_disclosure_templates
  after insert or update or delete on public.risk_disclosure_templates
  for each row execute function public.write_audit_log();
create trigger audit_academy_invitations
  after insert or update or delete on public.academy_invitations
  for each row execute function public.write_audit_log();
create trigger audit_trader_ownership_transfers
  after insert or update or delete on public.trader_ownership_transfers
  for each row execute function public.write_audit_log();

alter table public.risk_disclosure_templates enable row level security;
alter table public.academy_invitations enable row level security;
alter table public.trader_ownership_transfers enable row level security;

create policy "active risk disclosures are readable"
on public.risk_disclosure_templates for select
using (is_active or public.is_super_admin());
create policy "platform admins manage risk disclosures"
on public.risk_disclosure_templates for all
using (public.is_super_admin()) with check (public.is_super_admin());

create policy "platform admins manage academy invitations"
on public.academy_invitations for all
using (public.is_super_admin()) with check (public.is_super_admin());
create policy "invitees read their academy invitation"
on public.academy_invitations for select
using (invited_user_id = auth.uid());

create policy "platform admins manage ownership transfers"
on public.trader_ownership_transfers for all
using (public.is_super_admin()) with check (public.is_super_admin());
create policy "affected owners read ownership transfers"
on public.trader_ownership_transfers for select
using (from_user_id = auth.uid() or to_user_id = auth.uid());

grant select on public.risk_disclosure_templates to anon, authenticated;
grant select on public.academy_invitations to authenticated;
grant select on public.trader_ownership_transfers to authenticated;

create or replace function public.complete_trader_ownership_transfer(
  target_transfer_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  transfer public.trader_ownership_transfers%rowtype;
begin
  if not public.is_super_admin() then raise exception 'not authorized'; end if;

  select * into transfer
  from public.trader_ownership_transfers
  where id = target_transfer_id and status = 'pending'
  for update;
  if transfer.id is null then raise exception 'pending transfer not found'; end if;
  if exists (select 1 from public.traders where owner_user_id = transfer.to_user_id) then
    raise exception 'target user already owns a workspace';
  end if;

  update public.trader_members set role = 'admin'
  where trader_id = transfer.trader_id and user_id = transfer.from_user_id;
  insert into public.trader_members (trader_id, user_id, role)
  values (transfer.trader_id, transfer.to_user_id, 'owner')
  on conflict (trader_id, user_id) do update set role = 'owner';
  update public.traders set owner_user_id = transfer.to_user_id
  where id = transfer.trader_id and owner_user_id = transfer.from_user_id;
  if not found then raise exception 'workspace ownership changed'; end if;

  update public.trader_ownership_transfers
  set status = 'completed', completed_by = auth.uid(), completed_at = now()
  where id = target_transfer_id;
end;
$$;

revoke all on function public.complete_trader_ownership_transfer(uuid)
  from public, anon;
grant execute on function public.complete_trader_ownership_transfer(uuid)
  to authenticated, service_role;

create or replace function public.set_primary_website_domain(target_domain_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_portal_id uuid;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role'
    and not public.is_super_admin() then
    raise exception 'not authorized';
  end if;
  select portal_id into resolved_portal_id
  from public.website_domains
  where id = target_domain_id and status = 'active' for update;
  if resolved_portal_id is null then raise exception 'active domain not found'; end if;
  update public.website_domains
  set is_primary = (id = target_domain_id)
  where portal_id = resolved_portal_id and status <> 'disabled';
  update public.portals
  set custom_domain = (select hostname from public.website_domains where id = target_domain_id)
  where id = resolved_portal_id;
end;
$$;

create or replace function public.assign_custom_site_package(
  target_portal_id uuid,
  target_package_id uuid,
  target_status public.custom_site_assignment_status default 'active',
  target_show_powered_by boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_trader_id uuid;
  assignment_id uuid;
begin
  if not public.is_super_admin() and current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'not authorized';
  end if;
  select trader_id into resolved_trader_id from public.portals where id = target_portal_id;
  if resolved_trader_id is null then raise exception 'portal not found'; end if;
  if not exists (select 1 from public.custom_site_packages where id = target_package_id and is_active) then
    raise exception 'custom site package not available';
  end if;
  insert into public.custom_site_assignments (
    trader_id, portal_id, package_id, status, show_powered_by, assigned_by, activated_at
  ) values (
    resolved_trader_id, target_portal_id, target_package_id, target_status,
    target_show_powered_by, auth.uid(), case when target_status = 'active' then now() end
  ) on conflict (portal_id) do update set
    trader_id = excluded.trader_id,
    package_id = excluded.package_id,
    status = excluded.status,
    show_powered_by = excluded.show_powered_by,
    assigned_by = excluded.assigned_by,
    activated_at = excluded.activated_at
  returning id into assignment_id;
  update public.portals
  set website_delivery_mode = case when target_status = 'active'
    then 'custom_package'::public.website_delivery_mode
    else 'core_page'::public.website_delivery_mode end
  where id = target_portal_id;
  return assignment_id;
end;
$$;

do $$
declare
  v_owner_id uuid;
  v_tenant_id uuid;
  v_portal_id uuid;
  v_package_id uuid;
begin
  select id into v_owner_id from public.profiles
  where lower(email) = 'nyaristo01@gmail.com';
  if v_owner_id is null then raise exception 'Traders Confidence owner profile not found'; end if;
  select id into v_tenant_id from public.traders where owner_user_id = v_owner_id;
  if v_tenant_id is null then raise exception 'Traders Confidence workspace not found'; end if;
  select id into v_portal_id from public.portals where trader_id = v_tenant_id;
  select id into v_package_id from public.custom_site_packages
  where package_key = 'traders-confidence' and is_active order by version desc limit 1;
  if v_package_id is null then raise exception 'Traders Confidence package not found'; end if;

  update public.traders set
    legal_name = 'Traders Confidence',
    display_name = 'Traders Confidence',
    environment = 'production',
    status = 'active',
    support_email = coalesce(support_email, 'nyaristo01@gmail.com')
  where id = v_tenant_id;
  update public.portals set
    slug = 'traders-confidence',
    portal_name = 'Traders Confidence',
    academy_description = coalesce(academy_description, 'Professional trading education, community, and verified academy access.'),
    contact_email = coalesce(contact_email, 'nyaristo01@gmail.com'),
    is_published = true
  where id = v_portal_id;

  insert into public.custom_site_assignments (
    trader_id, portal_id, package_id, status, show_powered_by, activated_at
  ) values (
    v_tenant_id, v_portal_id, v_package_id, 'active', true, now()
  ) on conflict (portal_id) do update set
    trader_id = excluded.trader_id,
    package_id = excluded.package_id,
    status = excluded.status,
    show_powered_by = excluded.show_powered_by,
    activated_at = excluded.activated_at;
  update public.portals set website_delivery_mode = 'custom_package'
  where id = v_portal_id;
end $$;

-- Existing builder and external records remain renderable, but core_page is the
-- default for every future academy and for any package that is later paused.
