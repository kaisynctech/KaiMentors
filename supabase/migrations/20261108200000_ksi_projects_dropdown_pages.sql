-- Register Main projects, Sub projects, and Refer a friend on the
-- KaiSync Institution custom site. The renderer only routes pages listed
-- in the package manifest.
update public.custom_site_packages
set manifest = jsonb_set(
  manifest,
  '{pages}',
  (manifest -> 'pages')
    || '[{"slug": "projects", "file": "projects.html", "label": "Main projects", "path": "/projects"}]'::jsonb
    || '[{"slug": "sub-projects", "file": "sub-projects.html", "label": "Sub projects", "path": "/sub-projects"}]'::jsonb
    || '[{"slug": "refer", "file": "refer.html", "label": "Refer a friend", "path": "/refer"}]'::jsonb
)
where package_key = 'kaisync-institution'
  and version = 1
  and not (manifest -> 'pages' @> '[{"slug": "projects"}]'::jsonb);
