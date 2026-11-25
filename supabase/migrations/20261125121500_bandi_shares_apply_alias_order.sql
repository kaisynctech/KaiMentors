-- Sharesworldwide: move the 'apply' alias page to the end of the manifest.
-- pageForPath() also matches on file name, so with 'apply' listed before
-- 'verify' the /verify page picked up the "Apply" tab title.
-- Only the bandi-shares package is touched.

update public.custom_site_packages pk
set manifest = jsonb_set(
  pk.manifest,
  '{pages}',
  (
    select jsonb_agg(page order by (page->>'slug' = 'apply'), ord)
    from jsonb_array_elements(pk.manifest->'pages') with ordinality as p(page, ord)
  )
)
where pk.package_key = 'bandi-shares';
