-- MB-119: Register Sharesworldwide (bandi-shares) custom site package.

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
  'bandi-shares',
  1,
  'Sharesworldwide',
  'Bandi Shares FX — macroeconomics forex education, XM partner setup, Whop programs.',
  'Forex academy',
  '/custom-sites/bandi-shares/v1',
  'index',
  '{
    "pages": [
      {"slug": "home", "file": "index.html", "label": "Home", "path": "/"},
      {"slug": "about", "file": "about.html", "label": "About", "path": "/about"},
      {"slug": "services", "file": "services.html", "label": "Services", "path": "/services"},
      {"slug": "pricing", "file": "pricing.html", "label": "Pricing", "path": "/pricing"},
      {"slug": "xm", "file": "xm.html", "label": "XM Setup", "path": "/xm"},
      {"slug": "verify", "file": "verify.html", "label": "Verify Account", "path": "/verify"},
      {"slug": "terms", "file": "terms.html", "label": "Terms", "path": "/terms"},
      {"slug": "refund-policy", "file": "refund-policy.html", "label": "Refund Policy", "path": "/refund-policy"}
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
    {"key": "instagram", "label": "Instagram URL", "type": "url", "default": "https://www.instagram.com/bandishares/"},
    {"key": "tiktok", "label": "TikTok URL", "type": "url", "default": "https://www.tiktok.com/@bandishares"},
    {"key": "brokerLink", "label": "XM register link", "type": "url", "default": "https://www.xm.com"},
    {"key": "partnerCode", "label": "XM partner code", "type": "text", "default": "BANDISHARES05"}
  ]'::jsonb
)
on conflict (package_key, version) do update set
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
    ('/join-academy', 'kaimentors_route', '/join-academy', 40),
    ('/apply', 'package_page', '/verify', 50)
) as route(source_path, target_type, target_value, sort_order)
where package.package_key = 'bandi-shares'
on conflict (package_id, source_path) do update set
  target_type = excluded.target_type,
  target_value = excluded.target_value,
  sort_order = excluded.sort_order,
  is_active = true;
