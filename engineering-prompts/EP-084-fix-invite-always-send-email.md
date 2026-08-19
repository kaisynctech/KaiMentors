# EP-084 — Always Send Invite Email; Remove Direct-Add Shortcut

> **Supersedes EP-083.** Do not apply EP-083.

## Root Cause

The POST route in `app/api/workspace/mentors/route.ts` checks whether the
invited email already has a global Supabase account. If it does, it skips the
invitation table entirely and inserts directly into `trader_members` — with
**no email sent**. The invited person never knows they have access.

This is wrong. Whether or not someone has a Supabase account is irrelevant.
What matters is whether they are new to **this workspace**. Every invite must:
1. Create a `workspace_invitations` row
2. Send an email immediately with a join link
3. Route the invitee through the join flow (OTP verification → profile → done)

The join flow already handles both new and existing Supabase users correctly:
`signInWithOtp({ shouldCreateUser: true })` sends an OTP to any email — it
creates the account if needed, or authenticates the existing user. The
`/api/join/complete` route then upserts into `profiles` and `trader_members`.

---

## File changes

### `app/api/workspace/mentors/route.ts`

**Add imports at top — replace:**
```typescript
import { NextResponse } from "next/server";
```
**With:**
```typescript
import { NextResponse, after } from "next/server";
```

**Also add:**
```typescript
import { sendWorkspaceInvitation } from "@/lib/email";
```

**Full replacement of the POST handler:**

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

  // Block if already a member of this workspace
  const { data: existingUserId } = await supabase!.rpc("get_user_id_by_email", {
    input_email: email,
  });
  if (existingUserId) {
    const { data: existingMember } = await admin
      .from("trader_members")
      .select("id")
      .eq("trader_id", ctx.tid)
      .eq("user_id", existingUserId)
      .abortSignal(sig)
      .maybeSingle();
    if (existingMember) {
      return NextResponse.json(
        { error: "This person is already in your workspace." },
        { status: 409 },
      );
    }
  }

  // Block if a pending invitation already exists
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

  // Always create an invitation — new and existing Supabase users both go
  // through the join flow (OTP verification → profile → workspace membership).
  const { data: invitation, error: invErr } = await admin
    .from("workspace_invitations")
    .insert({ trader_id: ctx.tid, email, invited_by: ctx.user.id })
    .select("id")
    .abortSignal(sig)
    .single();

  if (invErr || !invitation) {
    return NextResponse.json({ error: "Could not create invitation." }, { status: 500 });
  }

  // Send invite email immediately — non-blocking
  after(async () => {
    try {
      const [{ data: portalRow }, { data: inviterProfile }] = await Promise.all([
        admin.from("portals").select("portal_name").eq("trader_id", ctx.tid).maybeSingle(),
        admin.from("profiles").select("full_name").eq("id", ctx.user.id).maybeSingle(),
      ]);
      const workspaceName = portalRow?.portal_name ?? "the workspace";
      const inviterName   = inviterProfile?.full_name ?? "Your colleague";
      const siteUrl       = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kaimentors.vercel.app";
      const joinUrl       = `${siteUrl}/join/${invitation.id}`;
      await sendWorkspaceInvitation({ to: email, workspaceName, inviterName, joinUrl });
    } catch {
      // Email failure must never affect the HTTP response
    }
  });

  return NextResponse.json({ invited: true }, { status: 201 });
}
```

---

### `components/team-manager.tsx`

The success message assumed the owner needed to click Resend to send the first
email. Since email now fires on invite creation, update the message.

**Replace (inside `sendInvite`, the `msg` line):**
```typescript
      const msg = body.invited
        ? `Invitation created for ${email.trim()}. Use "Resend" to email them the link.`
        : `${email.trim()} has been added to your workspace.`;
```

**With:**
```typescript
      const msg = `Invitation sent to ${email.trim()}.`;
```

---

## What does NOT change

- The join page (`app/join/[token]/page.tsx`) — unchanged.
- The join complete route (`app/api/join/complete/route.ts`) — unchanged. It
  already upserts `profiles` and `trader_members` and marks the invitation
  accepted.
- The resend route — unchanged. The Resend button on pending rows still works
  for follow-up emails if the first didn't arrive.
- `lib/email.ts` — unchanged.

---

## Verification after deploy (use KaiTrades as test tenant)

1. From TC settings → Team, invite a **new email** (no Supabase account).
   - Button returns within 2 seconds.
   - Success: "Invitation sent to [email]."
   - Invite email arrives in that inbox with a join link.
   - Clicking the link shows the join form: enter name → OTP → verified → dashboard.

2. From TC settings → Team, invite an **existing Supabase email** that is NOT
   yet a TC member.
   - Same result: email arrives, join flow runs, OTP sent to that email.
   - After completing join, person appears in TC team list.

3. Invite the same email a second time.
   - Expected: "An invitation has already been sent to this email." (409)

4. Invite an email that is already a member.
   - Expected: "This person is already in your workspace." (409)
