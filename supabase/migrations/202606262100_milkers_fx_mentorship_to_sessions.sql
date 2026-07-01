-- Rename Mentorship page to Sessions in the Milkers FX custom site package manifest.
update public.custom_site_packages
set manifest = jsonb_set(
  manifest,
  '{pages}',
  (
    select coalesce(
      jsonb_agg(
        case
          when elem ->> 'slug' = 'mentorship' then
            jsonb_build_object(
              'slug', 'sessions',
              'file', 'sessions.html',
              'label', 'Sessions',
              'path', '/sessions'
            )
          else elem
        end
      ),
      '[]'::jsonb
    )
    from jsonb_array_elements(manifest -> 'pages') elem
  )
)
where package_key = 'milkers-fx'
  and version = 1;
