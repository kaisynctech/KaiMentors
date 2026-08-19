# EP-089 — Fix getUser() hang in /api/join/complete

## Root cause

`app/api/join/complete/route.ts` line 20 calls `supabase.auth.getUser()` — a
network round-trip to Supabase auth API that can take 89–183 seconds during
infrastructure load. This is why the join form hangs at "Setting up your
account…" indefinitely: the client `fetch` has no timeout, so it waits forever.

---

## Fix 1 — `app/api/join/complete/route.ts`

Replace `getUser()` with `getSession()` and add `AbortSignal.timeout` to every
PostgREST query.

**Full replacement:**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  invitationId: z.string().uuid(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // getSession() decodes the JWT from cookies locally — no network call.
  // The user just completed verifyOtp on the client, so their session cookie
  // is fresh and valid.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const user = session.user;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { invitationId, firstName, lastName } = parsed.data;
  const fullName = `${firstName} ${lastName}`;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server error." }, { status: 503 });
  }

  const sig = AbortSignal.timeout(10000);

  const { data: invitation } = await admin
    .from("workspace_invitations")
    .select("id, trader_id, email, accepted_at")
    .eq("id", invitationId)
    .abortSignal(sig)
    .maybeSingle();

  if (!invitation) {
    return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
  }
  if (invitation.accepted_at) {
    return NextResponse.json({ error: "Invitation already accepted." }, { status: 409 });
  }
  if (invitation.email.toLowerCase() !== (user.email ?? "").toLowerCase()) {
    return NextResponse.json({ error: "Email mismatch." }, { status: 403 });
  }

  await Promise.all([
    admin.from("profiles").upsert(
      { id: user.id, full_name: fullName },
      { onConflict: "id" },
    ).abortSignal(sig),
    admin.from("trader_members").upsert(
      { trader_id: invitation.trader_id, user_id: user.id, role: "mentor" },
      { onConflict: "trader_id,user_id", ignoreDuplicates: true },
    ).abortSignal(sig),
    admin
      .from("workspace_invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invitationId)
      .abortSignal(sig),
  ]);

  return NextResponse.json({ ok: true });
}
```

---

## Fix 2 — `components/join-form.tsx`

Add `AbortSignal.timeout(20000)` to the `fetch("/api/join/complete", ...)` call
so the form shows an actionable error instead of hanging forever.

**Replace** (in `handleOtpSubmit`, after the `updateUser` call):
```typescript
    const res = await fetch("/api/join/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        invitationId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      }),
    });
```

**With:**
```typescript
    let res: Response;
    try {
      res = await fetch("/api/join/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          invitationId,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        }),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      setBusy(false);
      setStep("otp");
      setError("Connection timed out. Please try again.");
      return;
    }
```

20 seconds is generous enough for slow Supabase conditions, but gives the user
feedback instead of an infinite spinner.

---

## Apply EP-088 and EP-089 together

EP-088 (password field) and EP-089 (join complete fix) both touch
`join-form.tsx`. Apply them in a single edit pass:

1. Rewrite `join-form.tsx` with the password fields (EP-088)
2. In the same file, apply the `AbortSignal.timeout(20000)` + try/catch to the
   `/api/join/complete` fetch (EP-089 Fix 2)
3. Rewrite `app/api/join/complete/route.ts` (EP-089 Fix 1)

---

## Verification

1. Open a fresh join link. Fill name + password. Click Continue → OTP arrives.
2. Enter OTP → "Setting up your account…" appears.
3. Should resolve to "Account set up! Taking you to the dashboard…" within 15 s.
4. Dashboard loads as mentor for the correct workspace.
5. Test error path: if the route is slow, after 20 s the form shows
   "Connection timed out. Please try again." instead of hanging forever.
