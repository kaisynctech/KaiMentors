-- Bandi Shares: add Articles page to custom site manifest.

update public.custom_site_packages
set manifest = jsonb_set(
  manifest,
  '{pages}',
  '[
    {"slug": "home", "file": "index.html", "label": "Home", "path": "/"},
    {"slug": "about", "file": "about.html", "label": "About", "path": "/about"},
    {"slug": "services", "file": "services.html", "label": "Programs", "path": "/services"},
    {"slug": "xm", "file": "xm.html", "label": "XM", "path": "/xm"},
    {"slug": "articles", "file": "articles.html", "label": "Articles", "path": "/articles"},
    {"slug": "pricing", "file": "pricing.html", "label": "Programs", "path": "/pricing"},
    {"slug": "verify", "file": "verify.html", "label": "XM Verify", "path": "/verify"},
    {"slug": "terms", "file": "terms.html", "label": "Terms", "path": "/terms"},
    {"slug": "refund-policy", "file": "refund-policy.html", "label": "Refund Policy", "path": "/refund-policy"}
  ]'::jsonb
)
where package_key = 'bandi-shares';
