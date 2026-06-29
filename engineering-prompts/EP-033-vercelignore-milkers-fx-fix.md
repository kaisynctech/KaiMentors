# EP-033 — Fix: Remove Milkers-Fx from .vercelignore

**Status:** Ready for Engineering — apply immediately  
**Architect:** KaiMentors Enterprise Architect  
**Date:** 2026-06-26  
**Scope:** `.vercelignore` — one line removed  
**Migration required:** No  
**API changes:** No  
**Package install required:** No

---

## Root cause

`Milkers-Fx` was listed in `.vercelignore`. Vercel uses case-insensitive pattern matching, so this entry matched the `public/custom-sites/milkers-fx/` folder and excluded all its files from the deployment bundle. Every request to `/portal/milkers-fx` caused a server-side crash because `readFile` received a path to a file that was never deployed.

KaiTrades and Traders Confidence were unaffected because their folder names were not in `.vercelignore`.

---

## Fix

The Architect has already removed the line from `.vercelignore`. The file now reads:

```
.git
.next
node_modules
tests
*.log
*.tsbuildinfo
.env
.env.*
supabase/.temp
```

---

## Deploy steps

```bash
git add .vercelignore
git commit -m "fix: remove Milkers-Fx from .vercelignore — was excluding milkers-fx custom site files from deployment"
git push origin main
```

Vercel will auto-deploy on push.

---

## Verification

1. Wait for the Vercel build to complete
2. Visit `https://kaimentors.vercel.app/portal/milkers-fx` — the upgraded Milkers FX website should load
3. Confirm the nav links for Sign Up and Login redirect to the platform pages (not static HTML)
4. Confirm all pages (`/about`, `/signals`, `/mentorship`, `/xm`) load correctly
