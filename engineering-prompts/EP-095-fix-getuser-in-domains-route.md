# EP-095 — Fix getUser() in Website Domains API Route

## Problem

`app/api/website-builder/domains/route.ts` line 131 calls
`supabase.auth.getUser()` — a network round-trip to the Supabase auth API.
Under infrastructure load this call can take 89–183 s, causing the Admin →
Domains "Connect domain" button to appear to do nothing (the request hangs
before the auth check even completes).

## Change — `app/api/website-builder/domains/route.ts`

**Replace lines 131–132:**

```typescript
const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
const { data: profile } = user && supabase ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle() : { data: null };
```

**With:**

```typescript
const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
const user = session?.user ?? null;
const { data: profile } = user && supabase ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle() : { data: null };
```

`getSession()` decodes the JWT from cookies locally — no network call.
The session was issued moments ago by the admin login so the token is
guaranteed fresh; no refresh will be triggered.

## Deployment

Single file. No migration required.

## Verification

Log in as `kaisynctech@gmail.com` at `kaimentors.vercel.app/admin/domains`.
Click the PASII tab, enter `www.passii714.com`, and click Connect domain.
The button should respond within 2–3 s instead of hanging.
