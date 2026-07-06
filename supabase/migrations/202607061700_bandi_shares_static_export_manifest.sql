-- MB-119 Phase B: bandi-shares uses pre-built static export (iframe render mode).

update public.custom_site_packages
set manifest = manifest || '{"renderMode": "static_export"}'::jsonb
where package_key = 'bandi-shares';
