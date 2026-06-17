do $$
begin
  if not exists (select 1 from pg_type where typname = 'website_delivery_mode') then
    create type public.website_delivery_mode as enum (
      'builder_template',
      'custom_package',
      'external_website'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'custom_site_assignment_status') then
    create type public.custom_site_assignment_status as enum (
      'draft',
      'active',
      'paused'
    );
  end if;
end $$;

create table public.custom_site_packages (
  id uuid primary key default gen_random_uuid(),
  package_key text not null
    check (package_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  version integer not null default 1 check (version > 0),
  name text not null,
  description text not null default '',
  category text not null default 'Custom website',
  thumbnail_path text,
  asset_base_path text not null
    check (asset_base_path ~ '^/custom-sites/[a-z0-9-]+/v[0-9]+$'),
  entry_page text not null default 'index',
  manifest jsonb not null default '{}'::jsonb,
  editable_schema jsonb not null default '[]'::jsonb,
  reserved_paths jsonb not null default '["/login","/academy","/student","/join-academy","/dashboard","/admin","/api"]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (package_key, version)
);

create table public.custom_site_assignments (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  portal_id uuid not null references public.portals(id) on delete cascade,
  package_id uuid not null references public.custom_site_packages(id) on delete restrict,
  status public.custom_site_assignment_status not null default 'draft',
  content_overrides jsonb not null default '{}'::jsonb,
  show_powered_by boolean not null default true,
  assigned_by uuid references public.profiles(id) on delete set null,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (portal_id),
  unique (id, trader_id),
  unique (portal_id, trader_id)
);

create table public.custom_site_route_rules (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.custom_site_packages(id) on delete cascade,
  source_path text not null check (source_path ~ '^/'),
  target_type text not null check (target_type in ('package_page', 'kaimentors_route', 'external_url')),
  target_value text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (package_id, source_path)
);

create index custom_site_assignments_trader_idx
  on public.custom_site_assignments (trader_id, status, created_at desc);
create index custom_site_assignments_portal_idx
  on public.custom_site_assignments (portal_id, status);
create index custom_site_route_rules_package_idx
  on public.custom_site_route_rules (package_id, sort_order);

alter table public.portals
  add column if not exists website_delivery_mode public.website_delivery_mode
    not null default 'builder_template',
  add column if not exists external_website_url text;

create trigger set_custom_site_packages_updated_at
  before update on public.custom_site_packages
  for each row execute function public.set_updated_at();
create trigger set_custom_site_assignments_updated_at
  before update on public.custom_site_assignments
  for each row execute function public.set_updated_at();
create trigger set_custom_site_route_rules_updated_at
  before update on public.custom_site_route_rules
  for each row execute function public.set_updated_at();

create trigger audit_custom_site_packages
  after insert or update or delete on public.custom_site_packages
  for each row execute function public.write_audit_log();
create trigger audit_custom_site_assignments
  after insert or update or delete on public.custom_site_assignments
  for each row execute function public.write_audit_log();
create trigger audit_custom_site_route_rules
  after insert or update or delete on public.custom_site_route_rules
  for each row execute function public.write_audit_log();

alter table public.custom_site_packages enable row level security;
alter table public.custom_site_assignments enable row level security;
alter table public.custom_site_route_rules enable row level security;

create policy "active custom site packages are readable"
on public.custom_site_packages for select
using (
  is_active
  or public.is_super_admin()
);

create policy "platform admins manage custom site packages"
on public.custom_site_packages for all
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "active custom route rules are readable"
on public.custom_site_route_rules for select
using (
  is_active
  and exists (
    select 1
    from public.custom_site_packages package
    where package.id = custom_site_route_rules.package_id
      and package.is_active
  )
);

create policy "platform admins manage custom route rules"
on public.custom_site_route_rules for all
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "tenant members view custom site assignments"
on public.custom_site_assignments for select
using (
  public.is_super_admin()
  or public.is_trader_member(trader_id)
  or (
    status = 'active'
    and exists (
      select 1
      from public.portals portal
      where portal.id = custom_site_assignments.portal_id
        and portal.trader_id = custom_site_assignments.trader_id
        and portal.is_published
        and portal.website_delivery_mode = 'custom_package'
    )
  )
);

create policy "tenant members manage custom site assignments"
on public.custom_site_assignments for all
using (
  public.is_super_admin()
  or public.is_trader_member(trader_id)
)
with check (
  public.is_super_admin()
  or (
    public.is_trader_member(trader_id)
    and exists (
      select 1
      from public.portals portal
      where portal.id = custom_site_assignments.portal_id
        and portal.trader_id = custom_site_assignments.trader_id
    )
    and exists (
      select 1
      from public.custom_site_packages package
      where package.id = custom_site_assignments.package_id
        and package.is_active
    )
  )
);

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
  select portal.trader_id
  into resolved_trader_id
  from public.portals portal
  where portal.id = target_portal_id;

  if resolved_trader_id is null then
    raise exception 'portal not found';
  end if;

  if not (public.is_super_admin() or public.is_trader_member(resolved_trader_id)) then
    raise exception 'not authorized';
  end if;

  if not exists (
    select 1
    from public.custom_site_packages package
    where package.id = target_package_id
      and package.is_active
  ) then
    raise exception 'custom site package not available';
  end if;

  insert into public.custom_site_assignments (
    trader_id,
    portal_id,
    package_id,
    status,
    show_powered_by,
    assigned_by,
    activated_at
  )
  values (
    resolved_trader_id,
    target_portal_id,
    target_package_id,
    target_status,
    target_show_powered_by,
    auth.uid(),
    case when target_status = 'active' then now() else null end
  )
  on conflict (portal_id)
  do update set
    package_id = excluded.package_id,
    status = excluded.status,
    show_powered_by = excluded.show_powered_by,
    assigned_by = excluded.assigned_by,
    activated_at = case
      when excluded.status = 'active' then coalesce(public.custom_site_assignments.activated_at, now())
      else null
    end
  returning id into assignment_id;

  update public.portals
  set website_delivery_mode = case
      when target_status = 'active' then 'custom_package'::public.website_delivery_mode
      else website_delivery_mode
    end
  where id = target_portal_id;

  return assignment_id;
end;
$$;

revoke all on function public.assign_custom_site_package(
  uuid,
  uuid,
  public.custom_site_assignment_status,
  boolean
) from public, anon, authenticated;
grant execute on function public.assign_custom_site_package(
  uuid,
  uuid,
  public.custom_site_assignment_status,
  boolean
) to authenticated, service_role;

create or replace function public.set_website_delivery_mode(
  target_portal_id uuid,
  target_mode public.website_delivery_mode
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_trader_id uuid;
begin
  select portal.trader_id
  into resolved_trader_id
  from public.portals portal
  where portal.id = target_portal_id;

  if resolved_trader_id is null then
    raise exception 'portal not found';
  end if;

  if not (public.is_super_admin() or public.is_trader_member(resolved_trader_id)) then
    raise exception 'not authorized';
  end if;

  update public.portals
  set website_delivery_mode = target_mode
  where id = target_portal_id;

  if target_mode <> 'custom_package' then
    update public.custom_site_assignments
    set status = 'paused',
        activated_at = null
    where portal_id = target_portal_id;
  end if;
end;
$$;

revoke all on function public.set_website_delivery_mode(
  uuid,
  public.website_delivery_mode
) from public, anon, authenticated;
grant execute on function public.set_website_delivery_mode(
  uuid,
  public.website_delivery_mode
) to authenticated, service_role;

insert into public.custom_site_packages (
  package_key,
  version,
  name,
  description,
  category,
  asset_base_path,
  entry_page,
  manifest,
  editable_schema
)
values
  (
    'traders-confidence',
    1,
    'Traders Confidence',
    'A premium forex education and mentorship website for Bongani MD415.',
    'Forex academy',
    '/custom-sites/traders-confidence/v1',
    'index',
    '{
      "pages": [
        {"slug": "home", "file": "index.html", "label": "Home", "path": "/"},
        {"slug": "about", "file": "about.html", "label": "About", "path": "/about"},
        {"slug": "signals", "file": "signals.html", "label": "Signals", "path": "/signals"},
        {"slug": "mentorship", "file": "mentorship.html", "label": "Mentorship", "path": "/mentorship"},
        {"slug": "events", "file": "events.html", "label": "Events", "path": "/events"},
        {"slug": "xm", "file": "xm.html", "label": "Open XM", "path": "/xm"}
      ],
      "reservedLinks": {
        "login.html": "/login",
        "signup.html": "/join-academy"
      },
      "poweredByLabel": "Powered by KaiMentors"
    }'::jsonb,
    '[
      {"key": "announcement", "label": "Website announcement", "type": "text", "default": ""},
      {"key": "whatsapp", "label": "WhatsApp number", "type": "text", "default": ""},
      {"key": "instagram", "label": "Instagram URL", "type": "url", "default": ""},
      {"key": "brokerLink", "label": "Broker signup link", "type": "url", "default": ""}
    ]'::jsonb
  ),
  (
    'milkers-fx',
    1,
    'Milkers Fx',
    'A sharp forex signals and mentorship website for a precision trading desk.',
    'Forex academy',
    '/custom-sites/milkers-fx/v1',
    'index',
    '{
      "pages": [
        {"slug": "home", "file": "index.html", "label": "Home", "path": "/"},
        {"slug": "about", "file": "about.html", "label": "About", "path": "/about"},
        {"slug": "signals", "file": "signals.html", "label": "Signals", "path": "/signals"},
        {"slug": "mentorship", "file": "mentorship.html", "label": "Mentorship", "path": "/mentorship"},
        {"slug": "events", "file": "events.html", "label": "Events", "path": "/events"},
        {"slug": "xm", "file": "xm.html", "label": "Open XM", "path": "/xm"}
      ],
      "reservedLinks": {
        "login.html": "/login",
        "signup.html": "/join-academy"
      },
      "poweredByLabel": "Powered by KaiMentors"
    }'::jsonb,
    '[
      {"key": "announcement", "label": "Website announcement", "type": "text", "default": ""},
      {"key": "whatsapp", "label": "WhatsApp number", "type": "text", "default": ""},
      {"key": "instagram", "label": "Instagram URL", "type": "url", "default": ""},
      {"key": "brokerLink", "label": "Broker signup link", "type": "url", "default": ""}
    ]'::jsonb
  )
on conflict (package_key, version)
do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  asset_base_path = excluded.asset_base_path,
  manifest = excluded.manifest,
  editable_schema = excluded.editable_schema,
  is_active = true;

insert into public.custom_site_route_rules (
  package_id,
  source_path,
  target_type,
  target_value,
  sort_order
)
select package.id, route.source_path, route.target_type, route.target_value, route.sort_order
from public.custom_site_packages package
cross join (
  values
    ('/login', 'kaimentors_route', '/login', 10),
    ('/academy', 'kaimentors_route', '/student', 20),
    ('/student', 'kaimentors_route', '/student', 30),
    ('/join-academy', 'kaimentors_route', '/join-academy', 40)
) as route(source_path, target_type, target_value, sort_order)
where package.package_key in ('traders-confidence', 'milkers-fx')
on conflict (package_id, source_path)
do update set
  target_type = excluded.target_type,
  target_value = excluded.target_value,
  sort_order = excluded.sort_order,
  is_active = true;
