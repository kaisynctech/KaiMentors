-- PASSII: merge Gold page into 714 Method (single method page in manifest)
update public.custom_site_packages
set manifest = '{
  "pages": [
    {"slug": "home", "file": "index.html", "label": "Home", "path": "/"},
    {"slug": "about", "file": "about.html", "label": "About", "path": "/about"},
    {"slug": "method", "file": "method.html", "label": "714 Method", "path": "/method"},
    {"slug": "mission", "file": "mission.html", "label": "Mission", "path": "/mission"},
    {"slug": "xm", "file": "xm.html", "label": "XM & Copy", "path": "/xm"}
  ],
  "reservedLinks": {
    "login.html": "/login",
    "signup.html": "/join-academy"
  },
  "poweredByLabel": "Powered by KaiMentors"
}'::jsonb
where package_key = 'passii';
