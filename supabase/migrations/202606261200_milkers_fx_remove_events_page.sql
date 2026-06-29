-- Remove the Events page from the Milkers FX custom site package manifest.
update public.custom_site_packages
set manifest = jsonb_set(
  manifest,
  '{pages}',
  (
    select coalesce(jsonb_agg(elem), '[]'::jsonb)
    from jsonb_array_elements(manifest -> 'pages') elem
    where elem ->> 'slug' != 'events'
  )
)
where package_key = 'milkers-fx'
  and version = 1;
