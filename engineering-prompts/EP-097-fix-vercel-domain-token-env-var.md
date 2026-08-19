# EP-097 — Fix Vercel Domain Token Environment Variable Name

## Problem

`lib/domains/provider.ts` line 72 reads `process.env.VERCEL_TOKEN`. Vercel
reserves the `VERCEL_` prefix for system environment variables and does not
allow custom variables with that prefix. The actual environment variable added
to the Vercel project is named `VERCEL_DOMAIN_TOKEN`. Because the names do not
match, `this.token` is always an empty string, `createDomainProvider()` throws
immediately, and the Admin → Domains "Connect domain" button silently fails.

## Change — `lib/domains/provider.ts`

**Replace line 72:**

```typescript
this.token = process.env.VERCEL_TOKEN ?? "";
```

**With:**

```typescript
this.token = process.env.VERCEL_DOMAIN_TOKEN ?? "";
```

No other changes. One line, one file.

## Deployment

Commit and push. Vercel will redeploy automatically — the `VERCEL_DOMAIN_TOKEN`
environment variable added to the project will be picked up in this deployment.
No migration required.

## Verification

After deploy, go to `kaimentors.vercel.app/admin/domains`, click the **PASII**
tab, enter `www.passii714.com`, and click Connect domain. The domain should be
reserved within 2–3 seconds and appear in the Connected domains table with a
lifecycle status of "verification required" or "active".
