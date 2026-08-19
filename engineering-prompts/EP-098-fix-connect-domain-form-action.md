# EP-098 — Fix "Connect Domain" Button: Replace `action` Prop with `onSubmit`

## Root Cause (Evidence-Based)

Diagnosed via Supabase MCP tools on 2026-07-03:

- `SELECT * FROM website_domains` returned **0 rows** — the INSERT has never executed
- Supabase API logs show **no POST traffic** from the domains route — the route's
  auth check (`profiles.select("role")`) has never run
- Conclusion: the `fetch("/api/website-builder/domains", ...)` inside `domainAction`
  is **never reaching the server**

The form in `components/website-domain-manager.tsx` uses React 19's `action` prop
with a client-side function:

```tsx
<form
  action={(formData) =>
    domainAction(
      { action: "add", hostname: String(formData.get("hostname")) },
      "add",
    )
  }
  ...
>
```

React 19's `action`-as-function interception is designed for **Server Actions**
(`"use server"`). `domainAction` is a plain client-side async function in a
`"use client"` component — Next.js does not intercept the submit. The browser
receives no valid URL in the `action` attribute, falls back to native form
submission, and reloads the page. All React state (`busy`, `error`, `message`)
resets on reload — so nothing appears to happen.

## Change — `components/website-domain-manager.tsx`

**Replace:**

```tsx
            <form
              action={(formData) =>
                domainAction(
                  { action: "add", hostname: String(formData.get("hostname")) },
                  "add",
                )
              }
              className={styles.addForm}
            >
```

**With:**

```tsx
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                domainAction(
                  { action: "add", hostname: String(formData.get("hostname")) },
                  "add",
                );
              }}
              className={styles.addForm}
            >
```

No other changes. One prop swap, one file, no migration required.

## What Changes

- `onSubmit` + `e.preventDefault()` intercepts the submit before the browser
  handles it, builds FormData from the current DOM, and calls `domainAction`
- The spinner (`busy === "add"`), error messages, and success flow will all work
  as designed — they were already correctly implemented; the fetch just never fired
- The `required` attribute on the hostname input continues to enforce browser-native
  validation before `onSubmit` is called

## Deployment

Single file. Commit and push. Vercel redeploys automatically. No migration.

## Verification

1. Log in as `kaisynctech@gmail.com` at `kaimentors.vercel.app/admin/domains`
2. Click the **PASII** tab
3. Enter `www.passii714.com` and click **Connect domain**
4. The button should immediately show a spinner (confirming the fetch fired)
5. Within 2–3 seconds: a green success message — "Domain reserved. Complete any
   DNS instructions below." — and the domain appears in the Connected domains
   table with status `verification_required`
6. Confirm via Supabase: `SELECT * FROM website_domains` should return one row
