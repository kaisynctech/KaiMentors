-- MB-116: Register KaiSync Institution custom site package

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
  'kaisync-institution',
  1,
  'KaiSync Institution',
  'AI education platform public website — courses, tools, pricing, about.',
  'AI academy',
  '/custom-sites/kaisync-institution/v1',
  'index',
  '{
    "pages": [
      {"slug": "home",     "file": "index.html",    "label": "Home",     "path": "/"},
      {"slug": "about",    "file": "about.html",    "label": "About",    "path": "/about"},
      {"slug": "courses",  "file": "courses.html",  "label": "Courses",  "path": "/courses"},
      {"slug": "tools",    "file": "tools.html",    "label": "AI Tools", "path": "/tools"},
      {"slug": "pricing",  "file": "pricing.html",  "label": "Pricing",  "path": "/pricing"}
    ],
    "reservedLinks": {
      "login.html":  "/login",
      "signup.html": "/join-academy"
    }
  }'::jsonb,
  '[
    {"key": "announcement", "label": "Site announcement bar text",  "type": "text", "default": ""},
    {"key": "whatsapp",     "label": "WhatsApp number (digits only)","type": "text", "default": ""},
    {"key": "instagram",    "label": "Instagram URL",                "type": "url",  "default": ""},
    {"key": "tiktok",       "label": "TikTok URL",                   "type": "url",  "default": ""},
    {"key": "youtube",      "label": "YouTube channel URL",          "type": "url",  "default": ""},
    {"key": "facebook",     "label": "Facebook page URL",            "type": "url",  "default": ""},
    {"key": "discord",      "label": "Discord invite URL",           "type": "url",  "default": ""},
    {"key": "email",        "label": "Contact email",                "type": "text", "default": "kaisynctech@gmail.com"}
  ]'::jsonb,
  '["/login","/academy","/student","/join-academy","/dashboard","/admin","/api"]'::jsonb,
  true
)
on conflict (package_key, version)
do update set
  name            = excluded.name,
  description     = excluded.description,
  category        = excluded.category,
  asset_base_path = excluded.asset_base_path,
  entry_page      = excluded.entry_page,
  manifest        = excluded.manifest,
  editable_schema = excluded.editable_schema,
  reserved_paths  = excluded.reserved_paths,
  is_active       = true;

-- Route rules
insert into public.custom_site_route_rules (
  package_id, source_path, target_type, target_value, sort_order
)
select p.id, r.source_path, r.target_type, r.target_value, r.sort_order
from public.custom_site_packages p
cross join (values
  ('/login',       'kaimentors_route', '/login',       10),
  ('/academy',     'kaimentors_route', '/student',     20),
  ('/student',     'kaimentors_route', '/student',     30),
  ('/join-academy','kaimentors_route', '/join-academy', 40)
) as r(source_path, target_type, target_value, sort_order)
where p.package_key = 'kaisync-institution' and p.version = 1
on conflict (package_id, source_path)
do update set
  target_type  = excluded.target_type,
  target_value = excluded.target_value,
  sort_order   = excluded.sort_order,
  is_active    = true;
