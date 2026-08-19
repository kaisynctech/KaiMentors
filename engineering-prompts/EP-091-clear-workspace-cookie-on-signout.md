# EP-091 — Clear `km_workspace` Cookie on Sign-Out

## Root cause

`app/auth/signout/route.ts` calls `supabase.auth.signOut()` and redirects, but
never deletes the `km_workspace` cookie. That cookie has a **30-day maxAge**.

When a mentor manages one workspace and then signs out, the stale cookie
persists. On next login, `getMentorWorkspace()` reads the cookie and loads
the wrong workspace instead of falling back to the user's primary membership.

Confirmed instance: kaisynctech@gmail.com always landed on Traders Confidence
after signing out because the cookie was last set to TC's trader_id.

---

## Fix — `app/auth/signout/route.ts`

**Full replacement:**

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function isSafeRelativeUrl(value: string): boolean {
  return typeof value === "string" && value.startsWith("/") && !value.includes("://");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();

  let returnTo = "/login";
  try {
    const formData = await request.formData();
    const candidate = formData.get("returnTo");
    if (typeof candidate === "string" && isSafeRelativeUrl(candidate)) {
      returnTo = candidate;
    }
  } catch {
    // formData() throws if body is not form-encoded — fall through to default
  }

  const response = NextResponse.redirect(new URL(returnTo, request.url));

  // Clear the workspace cookie so the next login always resolves the workspace
  // fresh from the database (memberships[0] by created_at).
  // Without this, a 30-day stale cookie persists across sign-outs and causes
  // the user to land on the wrong workspace after re-login.
  response.cookies.delete("km_workspace");

  return response;
}
```

The only change from the current file is:
1. `response` is now a `const` before the cookie delete
2. `response.cookies.delete("km_workspace")` is added before `return`

---

## Verification

1. Sign in → manage any workspace (sets km_workspace cookie).
2. Sign out.
3. Sign back in.
4. Confirm you land on the correct primary workspace (KaiTrades for
   kaisynctech@gmail.com), not the last-visited one.
5. Check browser DevTools → Application → Cookies → confirm `km_workspace`
   is absent immediately after sign-out.
