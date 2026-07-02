# EP-076 — Decouple Email Send from Mentor Invite POST

## Root Cause

`next/server`'s `after()` does not reliably run after the response on Vercel's
standard serverless runtime. On plans without Fluid compute / `waitUntil` support,
Next.js falls back to `setTimeout`, but the runtime may wait for the registered
callback to resolve before flushing the HTTP response to the client. This causes
the same "Sending…" hang that existed before EP-075 — the email send still blocks
the response, just via a different mechanism.

Evidence from Supabase logs: no `auth/v1/user` or PostgREST calls appear from the
route handler for any invite attempt. This means the function never reaches
`supabase.auth.getUser()` — it hangs inside `after()` before returning.

## Fix

Remove all email sends from `POST /api/workspace/mentors`. The route becomes DB-only:
- Existing user → INSERT into `trader_members` → `{ added: true, invited: false }`
- New user → INSERT into `workspace_invitations` → `{ added: false, invited: true }`

No `after()`. No email. Return the response immediately.

The owner sees the result in the UI (member in team list, or invitation in pending
list). Email is delivered by clicking the **Resend** button (EP-073), which uses a
separate route that is already correctly isolated from the UI response.

Also add `AbortSignal.timeout(8000)` to all PostgREST calls in this route so a slow
Supabase response can never hang the function indefinitely.

---

## File changes

### `app/api/workspace/mentors/route.ts`

**Full replacement of the POST handler** (GET handler is unchanged):

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ... getOwnerContext and GET handler unchanged ...

const inviteSchema = z.object({
  traderId: z.string().uuid(),
  email: z.string().email().toLowerCase().trim(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A valid email address and traderId are required." },
      { status: 400 },
    );
  }

  const { traderId, email } = parsed.data;

  const supabase = await createClient();
  const ctx = await getOwnerContext(supabase, traderId);
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (ctx.role !== "owner") {
    return NextResponse.json(
      { error: "Only the workspace owner can invite mentors." },
      { status: 403 },
    );
  }

  if (email === ctx.user.email?.toLowerCase()) {
    return NextResponse.json({ error: "You cannot invite yourself." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const sig = AbortSignal.timeout(8000);

  // Check if the email belongs to an existing user
  const { data: existingUserId } = await supabase!.rpc("get_user_id_by_email", {
    input_email: email,
  });

  if (existingUserId) {
    const { error: memberError } = await admin
      .from("trader_members")
      .insert({ trader_id: ctx.tid, user_id: existingUserId, role: "mentor" })
      .abortSignal(sig);

    if (memberError) {
      if (memberError.code === "23505") {
        return NextResponse.json(
          { error: "This person is already in your workspace." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: "Could not add mentor." }, { status: 500 });
    }

    // ── Email notification removed from critical path ──────────────────────
    // The workspace owner can notify the new mentor directly or trigger a
    // notification via a future background mechanism.
    // ──────────────────────────────────────────────────────────────────────

    return NextResponse.json({ added: true, invited: false });
  }

  // New user — check for an existing pending invitation
  const { data: existing } = await supabase!
    .from("workspace_invitations")
    .select("id")
    .eq("trader_id", ctx.tid)
    .eq("email", email)
    .is("accepted_at", null)
    .abortSignal(sig)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "An invitation has already been sent to this email." },
      { status: 409 },
    );
  }

  const { data: invitation, error: invErr } = await admin
    .from("workspace_invitations")
    .insert({ trader_id: ctx.tid, email, invited_by: ctx.user.id })
    .select("id")
    .abortSignal(sig)
    .single();

  if (invErr || !invitation) {
    return NextResponse.json({ error: "Could not create invitation." }, { status: 500 });
  }

  // ── Email send removed from this path ────────────────────────────────────
  // The invitation row is now visible in the pending list. The owner can
  // click "Resend" to send the invitation email via
  // POST /api/workspace/invitations/[id]/resend (EP-073).
  // ─────────────────────────────────────────────────────────────────────────

  return NextResponse.json({ added: false, invited: true }, { status: 201 });
}
```

**Changes summary:**
- `import { NextResponse, after }` → `import { NextResponse }` (remove `after`)
- Remove `import { sendWorkspaceInvitation, sendWorkspaceAdded } from "@/lib/email"`
- Add `const sig = AbortSignal.timeout(8000)` to cap all DB calls
- Add `.abortSignal(sig)` to every PostgREST query in the POST handler
- Remove both email send blocks (existing-user `after()` and new-user `after()`)

---

### `components/team-manager.tsx` — update success message for new-user case

The existing message already handles both cases:
```typescript
const msg = body.invited
  ? `Invitation sent to ${email.trim()}.`   // ← update wording
  : `${email.trim()} has been added to your workspace.`;
```

Change the `invited` message to be accurate (email is not sent immediately):

```typescript
const msg = body.invited
  ? `Invitation created for ${email.trim()}. Use "Resend" to email them the link.`
  : `${email.trim()} has been added to your workspace.`;
```

---

## What does NOT change

- `app/api/workspace/invitations/[id]/resend/route.ts` — unchanged. This is the
  correct place for email sends and already uses `after()` which is fine there
  (the resend UI explicitly waits for it and shows feedback).
- `lib/email.ts` — unchanged. `withTimeout` wrappers remain for other callers.
- All other routes — unchanged.

---

## Verification after deploy

1. Open Traders Confidence Settings → Team.
2. Invite `nyaradzondoro1@gmail.com`. The button must clear within **3 seconds**.
3. The pending invitations section must show `nyaradzondoro1@gmail.com`.
4. Click **Resend** on that row. Confirm the email arrives at `nyaradzondoro1@gmail.com`.
5. Check Supabase `workspace_invitations` — one row must exist for this email,
   `accepted_at IS NULL`.

## No schema changes. No migration required.
