# Mission Brief MB-107
## Middleware — Exclude `.css` and `.js` from Rewrite on Custom Domains

**Status:** Approved for Engineering  
**Date:** 2026-07-06  
**Priority:** High — Custom domain site renders without styling  
**Prepared by:** Enterprise Architect

---

## Root Cause (Tool-Verified, No Guesswork)

From `middleware.ts` line 184 (file-read confirmed) and `components/custom-site-renderer.tsx` (file-read confirmed):

`CustomSiteRenderer` injects these tags using `site.assetBasePath` (a root-relative path like `/custom-sites/passii/v1`):

```html
<link href="/custom-sites/passii/v1/styles.css" rel="stylesheet" />
<script src="/custom-sites/passii/v1/app.js"></script>
```

On the platform domain (`kaimentors.vercel.app`) this works — Next.js serves these directly from `public/`.

On a custom domain (`www.passii714.com`) the middleware intercepts both requests because the matcher does not exclude `.css` or `.js` files:

```
/((?!api/|auth/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)/
```

The middleware rewrites `/custom-sites/passii/v1/styles.css` to `/domain-sites/www.passii714.com/custom-sites/passii/v1/styles.css`. Next.js tries to render this as a page, finds nothing, returns 404. **No CSS loads → white background, no styling.**

Images (`png`, `svg`, etc.) are already excluded from the matcher and load correctly.

---

## Fix

Add `css` and `js` to the existing file-extension exclusion list in the middleware matcher. This is a one-character-group change on one line.

---

## Affected File

`middleware.ts` — one line change (line 184).

---

## Implementation

**Find** (line 184):

```typescript
    "/((?!api/|auth/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
```

**Replace with:**

```typescript
    "/((?!api/|auth/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
```

**What changed:** `|css|js` added inside the file-extension exclusion group. `.css` and `.js` requests now bypass middleware entirely and are served directly by Next.js static file handling from `public/`.

---

## Why This Is Safe

- All `.css` and `.js` in the `public/` directory are static files that require no middleware processing.
- Next.js compiled bundles are in `_next/static` — already excluded.
- All API calls are under `/api/` — already excluded.
- No route in this codebase depends on middleware running for `.css` or `.js` public files.

---

## What Does NOT Change

- All route protection logic (auth, admin, student) — untouched
- Custom domain rewrite logic — untouched
- No DB changes, no env var changes
- All other middleware behaviour — identical

---

## Build and Commit

```bash
npm run build
# must be zero errors

git add middleware.ts
git commit -m "fix: exclude .css and .js from middleware matcher so custom-domain asset requests serve from public/"
git push origin HEAD:main
```

---

## Testing

After Vercel deployment is green:

1. Visit `www.passii714.com` in a browser
2. Page must render with **full styling** — dark background, gold text, matching `kaimentors.vercel.app/portal/pasii`
3. Open browser DevTools → Network tab → filter by `styles.css` — must show **200**, not 404

---

## Definition of Done

- Vercel deployment green
- `www.passii714.com` renders with full styling matching the platform portal view
- No 404 for `styles.css` or `app.js` in browser Network tab
