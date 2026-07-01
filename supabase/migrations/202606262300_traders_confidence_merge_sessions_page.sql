-- Traders Confidence: primary page is sessions.html (not mentorship).
-- mentorship.html stays as a redirect stub for legacy /mentorship URLs.
update public.custom_site_packages
set manifest = jsonb_set(
  manifest,
  '{pages}',
  (
    select coalesce(
      jsonb_agg(
        case
          when elem->>'slug' = 'mentorship'
            then '{"slug": "sessions", "file": "sessions.html", "label": "Sessions", "path": "/sessions"}'::jsonb
          else elem
        end
      ),
      '[]'::jsonb
    )
    from jsonb_array_elements(manifest->'pages') as elem
  )
  || '[{"slug": "mentorship", "file": "mentorship.html", "label": "Sessions", "path": "/mentorship"}]'::jsonb
)
where package_key = 'traders-confidence'
  and version = 1;
