do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'tenant_environment'
  ) then
    create type public.tenant_environment as enum (
      'production',
      'acceptance_test'
    );
  end if;
end $$;

alter table public.traders
  add column if not exists environment public.tenant_environment
    not null default 'production';

create index if not exists traders_environment_idx
  on public.traders (environment, created_at desc);

insert into public.custom_site_packages (
  package_key,
  version,
  name,
  description,
  category,
  asset_base_path,
  entry_page,
  manifest,
  editable_schema,
  reserved_paths,
  is_active
)
values (
  'kaitrades',
  1,
  'KaiTrades',
  'Isolated KaiMentors acceptance-test academy package based on the approved premium trading academy structure.',
  'Acceptance test fixture',
  '/custom-sites/kaitrades/v1',
  'home',
  '{
    "pages": [
      {"slug": "home", "file": "index.html", "label": "Home", "path": "/"},
      {"slug": "about", "file": "about.html", "label": "About", "path": "/about"},
      {"slug": "signals", "file": "signals.html", "label": "Signals", "path": "/signals"},
      {"slug": "mentorship", "file": "mentorship.html", "label": "Mentorship", "path": "/mentorship"},
      {"slug": "events", "file": "events.html", "label": "Events", "path": "/events"},
      {"slug": "broker", "file": "broker.html", "label": "Broker Setup", "path": "/broker-setup"}
    ],
    "reservedLinks": {
      "login.html": "/login",
      "signup.html": "/join-academy"
    },
    "poweredByLabel": "Powered by KaiMentors"
  }'::jsonb,
  '[
    {"key": "announcement", "label": "Website announcement", "type": "text", "default": "Acceptance-test academy"},
    {"key": "whatsapp", "label": "WhatsApp number", "type": "text", "default": ""},
    {"key": "instagram", "label": "Instagram URL", "type": "url", "default": ""},
    {"key": "brokerLink", "label": "Broker signup link", "type": "url", "default": ""}
  ]'::jsonb,
  '["/login","/academy","/student","/join-academy","/dashboard","/admin","/api"]'::jsonb,
  true
)
on conflict (package_key, version)
do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  asset_base_path = excluded.asset_base_path,
  entry_page = excluded.entry_page,
  manifest = excluded.manifest,
  editable_schema = excluded.editable_schema,
  reserved_paths = excluded.reserved_paths,
  is_active = true;

insert into public.custom_site_route_rules (
  package_id,
  source_path,
  target_type,
  target_value,
  sort_order,
  is_active
)
select package.id, route.source_path, route.target_type, route.target_value,
  route.sort_order, true
from public.custom_site_packages package
cross join (
  values
    ('/login', 'kaimentors_route', '/login', 10),
    ('/academy', 'kaimentors_route', '/student', 20),
    ('/student', 'kaimentors_route', '/student', 30),
    ('/join-academy', 'kaimentors_route', '/join-academy', 40)
) as route(source_path, target_type, target_value, sort_order)
where package.package_key = 'kaitrades'
  and package.version = 1
on conflict (package_id, source_path)
do update set
  target_type = excluded.target_type,
  target_value = excluded.target_value,
  sort_order = excluded.sort_order,
  is_active = true;

do $$
declare
  fixture_portal public.portals%rowtype;
  fixture_package_id uuid;
  fixture_owner_id uuid;
begin
  select portal.*
  into fixture_portal
  from public.portals portal
  where portal.slug = 'kaitrades';

  if not found then
    return;
  end if;

  select package.id
  into strict fixture_package_id
  from public.custom_site_packages package
  where package.package_key = 'kaitrades'
    and package.version = 1;

  select trader.owner_user_id
  into strict fixture_owner_id
  from public.traders trader
  where trader.id = fixture_portal.trader_id;

  update public.traders
  set display_name = 'KaiTrades',
      legal_name = 'KaiTrades',
      environment = 'acceptance_test'
  where id = fixture_portal.trader_id;

  update public.portals
  set portal_name = 'KaiTrades',
      website_delivery_mode = 'custom_package',
      is_published = true
  where id = fixture_portal.id
    and trader_id = fixture_portal.trader_id;

  insert into public.custom_site_assignments (
    trader_id,
    portal_id,
    package_id,
    status,
    content_overrides,
    show_powered_by,
    assigned_by,
    activated_at
  )
  values (
    fixture_portal.trader_id,
    fixture_portal.id,
    fixture_package_id,
    'active',
    '{"announcement":"KaiTrades acceptance-test environment"}'::jsonb,
    true,
    fixture_owner_id,
    now()
  )
  on conflict (portal_id)
  do update set
    package_id = excluded.package_id,
    status = excluded.status,
    content_overrides = excluded.content_overrides,
    show_powered_by = excluded.show_powered_by,
    assigned_by = coalesce(public.custom_site_assignments.assigned_by, excluded.assigned_by),
    activated_at = coalesce(public.custom_site_assignments.activated_at, excluded.activated_at);
end $$;

do $$
begin
  if exists (
    select 1
    from public.portals portal
    join public.custom_site_assignments assignment
      on assignment.portal_id = portal.id
      and assignment.trader_id = portal.trader_id
    join public.custom_site_packages package
      on package.id = assignment.package_id
    where portal.slug = 'kaitrades'
      and package.package_key <> 'kaitrades'
  ) then
    raise exception 'KaiTrades must not share a client custom-site package';
  end if;
end $$;
