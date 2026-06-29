-- Register the standalone FAQ page for the Traders Confidence custom site package.
-- The renderer (lib/custom-sites.ts) only routes and link-rewrites pages that are
-- present in the manifest, so faq.html must be declared here to be reachable.
update public.custom_site_packages
set manifest = jsonb_set(
  manifest,
  '{pages}',
  (manifest -> 'pages')
    || '[{"slug": "faq", "file": "faq.html", "label": "FAQ", "path": "/faq"}]'::jsonb
)
where package_key = 'traders-confidence'
  and version = 1
  and not (manifest -> 'pages' @> '[{"slug": "faq"}]'::jsonb);
