# EP-075 — Make Workspace Email Sends Truly Non-Blocking

## Root Cause

Two separate hangs in the mentor invite flow — both caused by Resend API calls blocking the
Vercel serverless response:

1. **Existing-user path** (`sendWorkspaceAdded`) — called fire-and-forget
   (`sendWorkspaceAdded(...).catch(() => {})`), but Vercel's Node.js runtime keeps the
   function alive until the event loop drains. If Resend's HTTP connection takes > 10 s
   (unverified domain, cold SSL handshake, etc.), Vercel kills the function without ever
   flushing the response to the browser. The client fetch never resolves → "Sending…" hangs.

2. **New-user path** (`sendWorkspaceInvitation`) — fully `await`ed inside a try/catch.
   Same Resend delay kills the response before it is sent.

3. **Resend invitation route** (`/api/workspace/invitations/[id]/resend/route.ts`) —
   same fully `await`ed blocking pattern.

**The fix:** Next.js 15 ships `after()` from `next/server`. It is the correct primitive for
background work — the HTTP response is sent immediately, and any callbacks passed to
`after()` run after the response is committed, outside the request lifetime. No extra
package is needed; the project is already on `next ^15.2.4`.

Additionally, add a `withTimeout` wrapper in `lib/email.ts` so that even background Resend
calls don't hang indefinitely (belt-and-suspenders for reliability + future-proofing the
blocking booking email functions).

---

## File changes

### 1. `lib/email.ts` — add `withTimeout`, wrap all `resend.emails.send` calls

Add this utility immediately after the `const FROM = ...` line:

```typescript
/** Rejects after `ms` milliseconds so a hung Resend call never blocks forever. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Resend timed out after ${ms}ms`)), ms),
    ),
  ]);
}
```

Then wrap every `resend.emails.send(...)` call in the file (both booking functions and
workspace functions) with `withTimeout(..., 8000)`:

**Four booking functions (lines ~32–127)** — change each `resend!.emails.send({...})` to:
```typescript
withTimeout(resend!.emails.send({...}), 8000)
```
Return value is still returned/awaited the same way; just wrap the inner call.

**`sendWorkspaceInvitation` (line ~141):**
```typescript
await withTimeout(
  resend.emails.send({ from: FROM, to, subject: ..., html: ... }),
  8000,
);
```

**`sendWorkspaceAdded` (line ~185):**
```typescript
await withTimeout(
  resend.emails.send({ from: FROM, to, subject: ..., html: ... }),
  8000,
);
```

---

### 2. `app/api/workspace/mentors/route.ts` — use `after()` for both email branches

Add `after` to the `next/server` import at the top:

```typescript
import { NextResponse, after } from "next/server";
```

**Existing-user branch** — replace the fire-and-forget call and `return`:

```typescript
// BEFORE
sendWorkspaceAdded({
  to: email,
  workspaceName,
  inviterName,
  dashboardUrl: `${siteUrl}/dashboard`,
}).catch(() => {});
return NextResponse.json({ added: true, invited: false });

// AFTER
const addedResponse = NextResponse.json({ added: true, invited: false });
after(() =>
  sendWorkspaceAdded({
    to: email,
    workspaceName,
    inviterName,
    dashboardUrl: `${siteUrl}/dashboard`,
  }).catch(() => {}),
);
return addedResponse;
```

**New-user branch** — replace the blocking `try { await sendWorkspaceInvitation } catch`:

```typescript
// BEFORE
try {
  await sendWorkspaceInvitation({ to: email, workspaceName, inviterName, joinUrl });
} catch {
  await admin.from("workspace_invitations").delete().eq("id", invitation.id);
  return NextResponse.json({ error: "Could not send invitation email." }, { status: 500 });
}
return NextResponse.json({ added: false, invited: true }, { status: 201 });

// AFTER
const invitedResponse = NextResponse.json({ added: false, invited: true }, { status: 201 });
after(async () => {
  try {
    await sendWorkspaceInvitation({ to: email, workspaceName, inviterName, joinUrl });
  } catch {
    // Email failed — delete the invitation row so the owner can retry
    await admin.from("workspace_invitations").delete().eq("id", invitation.id);
  }
});
return invitedResponse;
```

---

### 3. `app/api/workspace/invitations/[id]/resend/route.ts` — same pattern

Add `after` to the `next/server` import:

```typescript
import { NextResponse, after } from "next/server";
```

Replace the blocking email send at the bottom:

```typescript
// BEFORE
try {
  await sendWorkspaceInvitation({ to: invitation.email, workspaceName, inviterName, joinUrl });
} catch {
  return NextResponse.json({ error: "Could not send invitation email." }, { status: 500 });
}
return NextResponse.json({ ok: true });

// AFTER
const resendResponse = NextResponse.json({ ok: true });
after(() =>
  sendWorkspaceInvitation({
    to: invitation.email,
    workspaceName,
    inviterName,
    joinUrl,
  }).catch(() => {}),
);
return resendResponse;
```

---

## Why `after()` and not `.catch(() => {})`?

| Pattern | Response sent immediately? | Vercel keeps function alive? |
|---|---|---|
| `promise.catch(() => {}); return res;` | No — event loop still draining | Yes — until Resend resolves or timeout kills it |
| `after(() => promise); return res;` | Yes — response flushed first | Controlled — Vercel runs callback after response is committed |

`after()` is the Next.js 15-native primitive for exactly this use case. It is already
available — no `npm install` required.

---

## Also required — migration file for the mentor role constraint

The DB constraint was hotfixed live but the migration was never committed. Create:

**`supabase/migrations/20260702170000_trader_members_add_mentor_role.sql`**

```sql
-- Adds 'mentor' to the allowed roles in trader_members.
-- Applied live 2026-07-02 as a hotfix; migration backfilled here.
ALTER TABLE public.trader_members DROP CONSTRAINT trader_members_role_check;
ALTER TABLE public.trader_members ADD CONSTRAINT trader_members_role_check
  CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text, 'support'::text, 'mentor'::text]));
```

---

## Manual verification step (after deploy)

1. Open Traders Confidence Settings → Team.
2. Invite a fresh test email address (use a KaiTrades test address — NOT Milkers FX or
   Traders Confidence). The button must stop "Sending…" within 3 seconds regardless of
   whether Resend delivers the email.
3. Confirm the invitation row appears in the pending list (new user path), OR confirm the
   member appears in the team list (existing user path).
4. Check Vercel function logs — there must be no timeouts on this route.

## No schema changes beyond the migration above.
