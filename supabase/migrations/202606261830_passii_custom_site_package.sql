-- Register PASSII custom site package (gold mission · XM copy trading · 714 method)
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
values (
  'passii',
  1,
  'PASSII',
  'Gold-only mission site for PASSII — 714 method, free community, XM copy trading.',
  'Forex academy',
  '/custom-sites/passii/v1',
  'index',
  '{
    "pages": [
      {"slug": "home", "file": "index.html", "label": "Home", "path": "/"},
      {"slug": "about", "file": "about.html", "label": "About", "path": "/about"},
      {"slug": "method", "file": "method.html", "label": "714 Method", "path": "/method"},
      {"slug": "gold", "file": "gold.html", "label": "Gold", "path": "/gold"},
      {"slug": "mission", "file": "mission.html", "label": "Mission", "path": "/mission"},
      {"slug": "xm", "file": "xm.html", "label": "XM & Copy", "path": "/xm"}
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
    {"key": "brokerLink", "label": "Broker signup link", "type": "url", "default": ""},
    {"key": "partnerCodeLocal", "label": "XM partner code (local)", "type": "text", "default": "PASSII"},
    {"key": "partnerCodeIntl", "label": "XM copy code (international)", "type": "text", "default": "CP714"}
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
where package.package_key = 'passii'
on conflict (package_id, source_path)
do update set
  target_type = excluded.target_type,
  target_value = excluded.target_value,
  sort_order = excluded.sort_order,
  is_active = true;
