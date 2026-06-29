# EP-031 — Milkers FX Website: Commit, Push & Deploy v1 (Upgraded Site)

**Status:** Ready for Engineering  
**Architect:** KaiMentors Enterprise Architect  
**Date:** 2026-06-26  
**Scope:** Static files + one Supabase manifest fix — no app code changes  
**Migration required:** No  
**API changes:** No  
**Package install required:** No

---

## Objective

The Milkers FX custom website has been upgraded by the client. Deploy the updated files — but first remove a stale manifest entry for a page that no longer exists.

---

## What changed (client-upgraded files)

All files are under `public/custom-sites/milkers-fx/v1/`:

- `index.html` — upgraded homepage
- `about.html`, `signals.html`, `mentorship.html`, `xm.html` — updated pages
- `styles.css` — updated design system
- `app.js` — updated JS
- `assets/` — updated logo and images

**Note:** There is no `signup.html` or `login.html` in this folder — this is correct. The platform handles signup and login via `reservedLinks` in the manifest. Do not create these files.

---

## Required: Fix manifest before deploying

The `events.html` page is registered in the Supabase manifest but the file no longer exists in the folder — the client removed it during the upgrade. If left as-is, any nav link pointing to `/events` will throw a server-side file-not-found error.

Run this SQL in the Supabase dashboard (project: **Forex** / `jsbpfhfmumjbrnymhtvq`):

```sql
UPDATE custom_site_packages
SET manifest = jsonb_set(
  manifest,
  '{pages}',
  (
    SELECT jsonb_agg(page)
    FROM jsonb_array_elements(manifest->'pages') AS page
    WHERE page->>'file' != 'events.html'
  )
)
WHERE id = '3fd3e3e2-5748-41c2-b42a-36d764d8dc1b';
```

Verify with:

```sql
SELECT manifest->'pages' FROM custom_site_packages
WHERE id = '3fd3e3e2-5748-41c2-b42a-36d764d8dc1b';
```

Expected pages after fix: `index.html`, `about.html`, `signals.html`, `mentorship.html`, `xm.html` — no `events.html`.

---

## Pre-deploy checks

Before committing, confirm:

1. `public/custom-sites/milkers-fx/v1/signup.html` does **not** exist — if it does, delete it
2. `public/custom-sites/milkers-fx/v1/login.html` does **not** exist — if it does, delete it
3. `public/custom-sites/milkers-fx/v1/events.html` does **not** exist — the manifest fix above handles the manifest side
4. The manifest SQL above has been run successfully

---

## Deploy steps

```bash
# Stage all updated files for the Milkers FX site
git add public/custom-sites/milkers-fx/v1/

# Commit
git commit -m "feat: Milkers FX — upgraded website v1"

# Push to main — Vercel auto-deploys on push
git push origin main
```

After pushing:

1. Monitor the Vercel dashboard for a successful build
2. Visit `https://kaimentors.vercel.app/portal/milkers-fx` — confirm the upgraded design loads
3. Click **Sign Up / Join** in the nav — confirm it redirects to the platform join-academy page (not a static HTML page)
4. Click **Login** in the nav — confirm it redirects to the platform login page
5. Confirm the Events nav link is gone (or if it still appears, clicking it should not 404 — it should redirect or simply not be in the nav)
