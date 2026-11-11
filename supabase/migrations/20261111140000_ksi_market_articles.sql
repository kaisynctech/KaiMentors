-- Turn the Articles feature on for KaiSync Institution only.
-- Other academies stay off. Sharesworldwide was enabled separately.

update public.portals
set student_portal_features = coalesce(student_portal_features, '{}'::jsonb)
  || jsonb_build_object('articles', true)
where slug = 'kaisync-institution';

update public.custom_site_packages
set manifest = jsonb_set(
  manifest,
  '{pages}',
  (manifest->'pages') || jsonb_build_array(
    jsonb_build_object(
      'slug', 'articles',
      'file', 'articles.html',
      'label', 'Articles',
      'path', '/articles'
    )
  )
)
where package_key = 'kaisync-institution'
  and not exists (
    select 1
    from jsonb_array_elements(manifest->'pages') page
    where page->>'path' = '/articles'
  );
