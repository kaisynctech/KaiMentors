# EP-030 — Traders Confidence Website: Commit, Push & Deploy v1

**Status:** Ready for Engineering  
**Architect:** KaiMentors Enterprise Architect  
**Date:** 2026-06-26  
**Scope:** Static files only — no app code changes, no migration  
**Migration required:** No  
**API changes:** No  
**Package install required:** No

---

## Objective

The Traders Confidence custom website has been fully upgraded by the client. All files are already in place locally at `public/custom-sites/traders-confidence/v1/`. Commit, push to GitHub, and confirm Vercel deploys the updated site.

---

## What changed (client-upgraded files)

All files are under `public/custom-sites/traders-confidence/v1/`:

- `index.html` — full site redesign (dark gold, MD415 branding)
- `about.html`, `signals.html`, `mentorship.html`, `events.html`, `xm.html`, `faq.html` — updated to match new design
- `styles.css` — new premium dark + gold design system
- `app.js` — updated JS
- `assets/` — updated logo and images

**Note:** There is no `signup.html` or `login.html` in this folder — these are intentionally absent. The platform handles signup and login via `reservedLinks` in the Supabase manifest, which rewrites `href="signup.html"` → `/join-academy` and `href="login.html"` → `/login` automatically. Do not create these files.

---

## Pre-deploy checks

Before committing, confirm:

1. `public/custom-sites/traders-confidence/v1/signup.html` does **not** exist — if it does, delete it
2. `public/custom-sites/traders-confidence/v1/login.html` does **not** exist — if it does, delete it
3. All nav links in every page use relative hrefs: `href="signup.html"` and `href="login.html"` — the platform rewriter handles the rest

---

## Deploy steps

```bash
# Stage all updated files for the Traders Confidence site
git add public/custom-sites/traders-confidence/v1/

# Commit
git commit -m "feat: Traders Confidence — upgraded website v1 (dark gold redesign)"

# Push to main — Vercel auto-deploys on push
git push origin main
```

After pushing:

1. Monitor the Vercel dashboard for a successful build
2. Visit `https://kaimentors.vercel.app/portal/traders-confidence` — confirm the new dark gold design loads
3. Click **Sign Up / Join** in the nav — confirm it redirects to the platform join-academy page (not a static HTML page)
4. Click **Login** in the nav — confirm it redirects to the platform login page
5. Navigate to `/portal/traders-confidence/faq` — confirm the FAQ page loads correctly

---

## If anything is missing from the manifest

The `faq.html` manifest entry was already added directly in Supabase (no code change needed). If any other page 404s after deploy, the fix is a Supabase SQL update — not a code change:

```sql
UPDATE custom_site_packages
SET manifest = jsonb_set(
  manifest, '{pages}',
  (manifest->'pages') || '[{"file":"PAGE.html","path":"/SLUG","slug":"SLUG","label":"Label"}]'::jsonb
)
WHERE id = '60b8be96-2a98-4ac9-9880-6028b9cf1f4a';
```

Replace `PAGE`, `SLUG`, and `Label` accordingly.
