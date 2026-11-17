-- KaiSync Institution only: add the "For Business" page (business.html -> /business)
-- to KSI's custom site package manifest. No other academy is touched.
-- Apply AFTER the code deploy that ships public/custom-sites/kaisync-institution/v1/business.html,
-- otherwise /business would route to a file that is not deployed yet.

update public.custom_site_packages
set manifest = jsonb_set(
  manifest,
  '{pages}',
  (manifest->'pages') || jsonb_build_array(
    jsonb_build_object(
      'slug', 'business',
      'file', 'business.html',
      'label', 'For Business',
      'path', '/business'
    )
  )
)
where package_key = 'kaisync-institution'
  and not exists (
    select 1
    from jsonb_array_elements(manifest->'pages') page
    where page->>'path' = '/business'
  );
