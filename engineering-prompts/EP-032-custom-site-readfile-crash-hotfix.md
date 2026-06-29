# EP-032 — Hotfix: Custom Site readFile Crash → Graceful null + Error Log

**Status:** Ready for Engineering — apply immediately  
**Architect:** KaiMentors Enterprise Architect  
**Date:** 2026-06-26  
**Scope:** `lib/custom-sites.ts` — one try/catch around `readFile`  
**Migration required:** No  
**API changes:** No  
**Package install required:** No

---

## Problem

`/portal/milkers-fx` is crashing with "Application error: a server-side exception has occurred." The crash happens after all Supabase queries return 200 — the only remaining throw point is the `readFile` call in `loadCustomSite` (`lib/custom-sites.ts`, lines 356–359). There is no try/catch — any file system error propagates unhandled and kills the page.

Traders Confidence and KaiTrades are unaffected. The exact file system error for Milkers FX is not known; it is only visible in Vercel function logs.

---

## Fix

In `lib/custom-sites.ts`, wrap the `readFile` and `safePackageFilePath` block in a try/catch that logs the error and returns null instead of throwing.

**File:** `lib/custom-sites.ts`  
**Function:** `loadCustomSite` (around line 356)

**Before:**
```typescript
  const html = await readFile(
    safePackageFilePath(sitePackage.asset_base_path, page.file),
    "utf8",
  );
```

**After:**
```typescript
  let html: string;
  try {
    html = await readFile(
      safePackageFilePath(sitePackage.asset_base_path, page.file),
      "utf8",
    );
  } catch (err) {
    console.error(
      `[custom-site] Failed to read file for portal "${portal.slug}", page "${page.file}":`,
      err,
    );
    return null;
  }
```

That is the entire change — nothing else should be touched.

---

## What this does

- **Stops the crash:** The page falls through to `loadWebsiteBySlug` → `loadAcademyEntryBySlug` → `notFound()`, serving a clean 404 instead of a server error.
- **Logs the real error:** The `console.error` line will appear in Vercel function logs (dashboard → Functions → portal/[slug]) with the exact file path and OS error code (e.g. ENOENT, EACCES).

---

## After deploying

1. Visit `https://kaimentors.vercel.app/portal/milkers-fx` — confirm the 500 is gone (it will show 404 or a fallback page).
2. Open the Vercel dashboard → **Functions** tab → find a recent invocation of `portal/[slug]` → share the log line that starts with `[custom-site] Failed to read file...`.
3. The logged path and error code will tell us exactly what is wrong (wrong resolved path, missing file, permissions error, etc.) and the permanent fix will follow as EP-033.

---

## Commit message

```
fix: catch readFile errors in loadCustomSite — log and return null instead of crashing
```
