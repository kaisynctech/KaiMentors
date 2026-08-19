# EP-086 — Collapse Invite and Remove Into Single RPC Calls

> **Supersedes EP-085.** EP-085 parallelised queries but did not help because
> even parallel round-trips sum to >12 s under Supabase load spikes.
> The only reliable fix is one network round-trip per operation.

## Root Cause (final diagnosis)

Parallelisation reduces the number of sequential waits, but every PostgREST
call still opens its own connection. Under adverse Vercel→Supabase latency
(auth logs recorded individual calls at 89 s and 183 s) **even one slow
connection exceeds the 12 s browser timeout.** With 3+ round-trips,
exceeding 12 s is almost guaranteed.

The fix: move all DB logic for invite and remove into SECURITY DEFINER
PostgreSQL functions. Each route handler becomes:

```
getSession() → local, ~0 ms (no network)
supabase.rpc(...)  → ONE network call → 2–7 s
after() email send → non-blocking
```

---

## Part 1 — Migration

Create file:
`supabase/migrations/20260703120000_workspace_team_rpc_functions.sql`

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- invite_mentor_to_workspace
-- Called by POST /api/workspace/mentors
-- Runs as caller's authenticated JWT; auth.uid() provides identity.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.invite_mentor_to_workspace(
  p_trader_id uuid,
  p_email     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id        uuid;
  v_caller_role      text;
  v_existing_user_id uuid;
  v_invitation_id    uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized', 'http_status', 401);
  END IF;

  p_email := lower(trim(p_email));

  -- Self-invite guard
  IF EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = v_caller_id AND email = p_email
  ) THEN
    RETURN jsonb_build_object('error', 'self_invite', 'http_status', 400);
  END IF;

  -- Caller must be owner of this workspace
  SELECT role INTO v_caller_role
  FROM public.trader_members
  WHERE trader_id = p_trader_id AND user_id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role <> 'owner' THEN
    RETURN jsonb_build_object('error', 'unauthorized', 'http_status', 403);
  END IF;

  -- Check if email is already a member of this workspace
  SELECT id INTO v_existing_user_id
  FROM auth.users
  WHERE email = p_email;

  IF v_existing_user_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.trader_members
      WHERE trader_id = p_trader_id AND user_id = v_existing_user_id
    ) THEN
      RETURN jsonb_build_object('error', 'already_member', 'http_status', 409);
    END IF;
  END IF;

  -- Check for a pending invitation
  IF EXISTS (
    SELECT 1 FROM public.workspace_invitations
    WHERE trader_id = p_trader_id
      AND email      = p_email
      AND accepted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('error', 'already_invited', 'http_status', 409);
  END IF;

  -- Create the invitation row
  INSERT INTO public.workspace_invitations (trader_id, email, invited_by)
  VALUES (p_trader_id, p_email, v_caller_id)
  RETURNING id INTO v_invitation_id;

  RETURN jsonb_build_object('ok', true, 'invitation_id', v_invitation_id::text);
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_mentor_to_workspace(uuid, text)
  TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- remove_mentor_from_workspace
-- Called by DELETE /api/workspace/mentors/[userId]
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.remove_mentor_from_workspace(
  p_trader_id      uuid,
  p_target_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id   uuid;
  v_caller_role text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized', 'http_status', 401);
  END IF;

  -- Self-remove guard
  IF v_caller_id = p_target_user_id THEN
    RETURN jsonb_build_object('error', 'self_remove', 'http_status', 400);
  END IF;

  -- Caller must be owner
  SELECT role INTO v_caller_role
  FROM public.trader_members
  WHERE trader_id = p_trader_id AND user_id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role <> 'owner' THEN
    RETURN jsonb_build_object('error', 'unauthorized', 'http_status', 403);
  END IF;

  -- Block if mentor has upcoming confirmed bookings
  IF EXISTS (
    SELECT 1 FROM public.bookings
    WHERE trader_id      = p_trader_id
      AND mentor_user_id = p_target_user_id
      AND status         = 'confirmed'
      AND starts_at      > NOW()
  ) THEN
    RETURN jsonb_build_object('error', 'has_bookings', 'http_status', 409);
  END IF;

  -- Delete the membership
  DELETE FROM public.trader_members
  WHERE trader_id = p_trader_id AND user_id = p_target_user_id;

  RETURN jsonb_build_object('ok', true, 'removed', p_target_user_id::text);
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_mentor_from_workspace(uuid, uuid)
  TO authenticated;
```

Apply with:
```
supabase db push
```
or via Supabase Dashboard → SQL Editor.

---

## Part 2 — `app/api/workspace/mentors/route.ts`

**Full replacement of the POST handler** (GET handler is unchanged):

```typescript
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
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  // getSession() is local — reads the JWT from cookies, zero network cost.
  // We need the caller ID for the after() email block.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const callerId = session.user.id;

  // Single round-trip: all auth checks + invitation insert happen inside the
  // SECURITY DEFINER function on the Postgres server.
  const { data: result, error: rpcErr } = await supabase
    .rpc("invite_mentor_to_workspace", {
      p_trader_id: traderId,
      p_email:     email,
    })
    .abortSignal(AbortSignal.timeout(10000));

  if (rpcErr) {
    return NextResponse.json(
      { error: "Could not process invitation." },
      { status: 500 },
    );
  }

  const res = result as {
    ok?: boolean;
    invitation_id?: string;
    error?: string;
    http_status?: number;
  };

  if (!res?.ok) {
    const httpStatus = res?.http_status ?? 400;
    const message =
      res?.error === "already_member"
        ? "This person is already in your workspace."
        : res?.error === "already_invited"
          ? "An invitation has already been sent to this email."
          : res?.error === "self_invite"
            ? "You cannot invite yourself."
            : res?.error === "unauthorized"
              ? "Unauthorized."
              : "Could not create invitation.";
    return NextResponse.json({ error: message }, { status: httpStatus });
  }

  const invitationId = res.invitation_id;
  const admin = createAdminClient();

  // Email fires after the HTTP response is committed — never blocks.
  after(async () => {
    if (!admin || !invitationId) return;
    try {
      const [{ data: portalRow }, { data: inviterProfile }] = await Promise.all([
        admin.from("portals").select("portal_name").eq("trader_id", traderId).maybeSingle(),
        admin.from("profiles").select("full_name").eq("id", callerId).maybeSingle(),
      ]);
      const workspaceName = portalRow?.portal_name ?? "the workspace";
      const inviterName   = inviterProfile?.full_name ?? "Your colleague";
      const siteUrl       = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kaimentors.vercel.app";
      const joinUrl       = `${siteUrl}/join/${invitationId}`;
      await sendWorkspaceInvitation({ to: email, workspaceName, inviterName, joinUrl });
    } catch {
      // Email failure must never affect the HTTP response.
    }
  });

  return NextResponse.json({ invited: true }, { status: 201 });
}
```

**Imports** — ensure these are all present at the top of the file:
```typescript
import { NextResponse, after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWorkspaceInvitation } from "@/lib/email";
```

---

## Part 3 — `app/api/workspace/mentors/[userId]/route.ts`

**Full replacement of the file:**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const params = z.object({ userId: z.string().uuid() }).safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid ID." }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const traderId = searchParams.get("traderId") ?? "";
  if (!z.string().uuid().safeParse(traderId).success) {
    return NextResponse.json({ error: "traderId required." }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  // Single round-trip: all auth checks + delete happen inside the function.
  const { data: result, error: rpcErr } = await supabase
    .rpc("remove_mentor_from_workspace", {
      p_trader_id:      traderId,
      p_target_user_id: params.data.userId,
    })
    .abortSignal(AbortSignal.timeout(10000));

  if (rpcErr) {
    return NextResponse.json({ error: "Could not remove mentor." }, { status: 500 });
  }

  const res = result as {
    ok?: boolean;
    removed?: string;
    error?: string;
    http_status?: number;
  };

  if (!res?.ok) {
    const httpStatus = res?.http_status ?? 400;
    const message =
      res?.error === "unauthorized"
        ? "Only the workspace owner can remove mentors."
        : res?.error === "self_remove"
          ? "You cannot remove yourself."
          : res?.error === "has_bookings"
            ? "This mentor has upcoming confirmed bookings. Cancel or reassign them first."
            : "Could not remove mentor.";
    return NextResponse.json({ error: message }, { status: httpStatus });
  }

  return NextResponse.json({ removed: params.data.userId });
}
```

The `createAdminClient` import is no longer needed — this file uses only the
regular client. The DELETE can now identify the caller via `auth.uid()` inside
the SECURITY DEFINER function, so explicit session handling in the route is
eliminated.

---

## Security model

The functions use `auth.uid()` to identify the caller directly from the
authenticated JWT — the route never passes a user ID as a parameter. A
caller cannot impersonate another user. All authorization checks (ownership,
self-remove, bookings) occur inside the function before any mutation.
`SECURITY DEFINER` is required to read `auth.users` (needed for the
already-a-member check).

---

## Expected timing after deploy

| Operation | Before EP-086 | After EP-086 |
|---|---|---|
| Invite | 10–15+ s (timeout) | 2–7 s |
| Remove | 6–12+ s (timeout) | 2–5 s |

---

## Verification after deploy

1. Settings → Team → click **Remove** on `nyaristo01@gmail.com`.
   - Expected: returns in < 8 s. Row disappears.
2. Enter `nyaradzondoro1@gmail.com` in Invite field → **Send invite**.
   - Expected: returns in < 8 s. "Invitation sent to nyaradzondoro1@gmail.com."
3. Send to the same email again.
   - Expected: fast 409. "An invitation has already been sent to this email."
4. Attempt to invite yourself.
   - Expected: fast 400. "You cannot invite yourself."
