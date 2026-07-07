-- Bandi Shares: consolidate nav (Programs + XM pages), keep legacy URL redirects.

update public.custom_site_packages
set manifest = jsonb_set(
  jsonb_set(
    manifest,
    '{pages}',
    '[
      {"slug": "home", "file": "index.html", "label": "Home", "path": "/"},
      {"slug": "about", "file": "about.html", "label": "About", "path": "/about"},
      {"slug": "services", "file": "services.html", "label": "Programs", "path": "/services"},
      {"slug": "xm", "file": "xm.html", "label": "XM", "path": "/xm"},
      {"slug": "pricing", "file": "pricing.html", "label": "Programs", "path": "/pricing"},
      {"slug": "verify", "file": "verify.html", "label": "XM Verify", "path": "/verify"},
      {"slug": "terms", "file": "terms.html", "label": "Terms", "path": "/terms"},
      {"slug": "refund-policy", "file": "refund-policy.html", "label": "Refund Policy", "path": "/refund-policy"}
    ]'::jsonb
  ),
  '{renderMode}',
  '"static_export"'::jsonb
)
where package_key = 'bandi-shares';

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
    ('/pricing', 'package_page', '/services', 60),
    ('/verify', 'package_page', '/xm', 70)
) as route(source_path, target_type, target_value, sort_order)
where package.package_key = 'bandi-shares'
on conflict (package_id, source_path) do update set
  target_type = excluded.target_type,
  target_value = excluded.target_value,
  sort_order = excluded.sort_order,
  is_active = true;
