# EP-085 — Parallelize Workspace Route Queries to Eliminate Timeout

## Root Cause

Auth logs confirm every Supabase network call from Vercel averages **2–3 seconds**,
with frequent spikes to 8–12 s. This is the round-trip latency between Vercel's
serverless functions and Supabase's infrastructure — it is not a bug, it is the
baseline cost of each network call.

The problem is that the invite and remove routes make **4–5 sequential** calls:

**Invite (POST /api/workspace/mentors):**
1. `getOwnerContext` → trader_members query (~2-3 s)
2. `get_user_id_by_email` RPC (~2-3 s)
3. trader_members membership check (~2-3 s)
4. workspace_invitations duplicate check (~2-3 s)
5. workspace_invitations insert (~2-3 s)

Total: **10–15 s** → always exceeds the 12 s client timeout.

**Remove (DELETE /api/workspace/mentors/[userId]):**
1. `getOwnerContext` → trader_members query (~2-3 s)
2. bookings upcoming check (~2-3 s)
3. trader_members delete (~2-3 s)

Total: **6–9 s** → frequently exceeds the 12 s client timeout.

The fix: **run independent queries in parallel using `Promise.all`**. The
ownership check (from `getOwnerContext`) is the only required gate — everything
that doesn't depend on its result can run concurrently.

---

## File changes

### `app/api/workspace/mentors/route.ts` — POST handler

Restructure into two phases:
- **Phase 1 (parallel):** ownership check + email lookup — independent of each other
- **Phase 2 (parallel):** existing membership check + pending invitation check — both depend on Phase 1 results but not on each other
- **Phase 3:** insert invitation row (depends on Phase 2 passing)

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
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const sig = AbortSignal.timeout(10000);

  // Phase 1 — parallel: ownership check + email lookup
  const [ctx, { data: existingUserId }] = await Promise.all([
    getOwnerContext(supabase, traderId),
    supabase!.rpc("get_user_id_by_email", { input_email: email }).abortSignal(sig),
  ]);

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

  // Phase 2 — parallel: existing membership check + pending invitation check
  const [existingMemberResult, existingInvitationResult] = await Promise.all([
    existingUserId
      ? admin
          .from("trader_members")
          .select("id")
          .eq("trader_id", ctx.tid)
          .eq("user_id", existingUserId)
          .abortSignal(sig)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase!
      .from("workspace_invitations")
      .select("id")
      .eq("trader_id", ctx.tid)
      .eq("email", email)
      .is("accepted_at", null)
      .abortSignal(sig)
      .maybeSingle(),
  ]);

  if (existingMemberResult.data) {
    return NextResponse.json(
      { error: "This person is already in your workspace." },
      { status: 409 },
    );
  }
  if (existingInvitationResult.data) {
    return NextResponse.json(
      { error: "An invitation has already been sent to this email." },
      { status: 409 },
    );
  }

  // Phase 3 — insert invitation
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

**Key change:** Phase 1 runs `getOwnerContext` and `get_user_id_by_email` in
parallel. Phase 2 runs the membership check and invitation duplicate check in
parallel. This cuts **5 sequential calls → 3 phases**, saving approximately
4–6 seconds.

The `sig = AbortSignal.timeout(10000)` is created before Phase 1 so it covers
the full request budget. The `getOwnerContext` function's internal
`trader_members` query does not yet have this signal — add it by passing the
signal in, or accept that Phase 1 handles it (the parallel call timeout limits
the overall wait).

---

### `app/api/workspace/mentors/[userId]/route.ts` — DELETE handler

Run the ownership check and bookings check in parallel. Currently sequential.

**Replace (lines 24–53):**
```typescript
  const { data: callerMembership } = await supabase
    .from("trader_members")
    .select("trader_id, role")
    .eq("user_id", user.id)
    .eq("trader_id", traderId)
    .maybeSingle();

  if (!callerMembership || callerMembership.role !== "owner") {
    return NextResponse.json(
      { error: "Only the workspace owner can remove mentors." },
      { status: 403 },
    );
  }

  const targetUserId = params.data.userId;

  if (targetUserId === user.id) {
    return NextResponse.json({ error: "You cannot remove yourself." }, { status: 400 });
  }

  // Block removal if mentor has upcoming confirmed bookings
  const { data: upcoming } = await supabase
    .from("bookings")
    .select("id")
    .eq("trader_id", callerMembership.trader_id)
    .eq("mentor_user_id", targetUserId)
    .eq("status", "confirmed")
    .gt("starts_at", new Date().toISOString())
    .limit(1);
```

**With:**
```typescript
  const targetUserId = params.data.userId;

  if (targetUserId === user.id) {
    return NextResponse.json({ error: "You cannot remove yourself." }, { status: 400 });
  }

  const sig = AbortSignal.timeout(10000);

  // Run ownership check and bookings check in parallel
  const [{ data: callerMembership }, { data: upcoming }] = await Promise.all([
    supabase
      .from("trader_members")
      .select("trader_id, role")
      .eq("user_id", user.id)
      .eq("trader_id", traderId)
      .abortSignal(sig)
      .maybeSingle(),
    supabase
      .from("bookings")
      .select("id")
      .eq("trader_id", traderId)
      .eq("mentor_user_id", targetUserId)
      .eq("status", "confirmed")
      .gt("starts_at", new Date().toISOString())
      .abortSignal(sig)
      .limit(1),
  ]);

  if (!callerMembership || callerMembership.role !== "owner") {
    return NextResponse.json(
      { error: "Only the workspace owner can remove mentors." },
      { status: 403 },
    );
  }
```

Note: the bookings check uses `traderId` directly from the query param (already
validated as UUID by zod) since we now run it before confirming ownership. The
ownership check still gates the actual delete — if the caller is not owner, they
get a 403 regardless of the bookings result. No security regression: the delete
still only runs if `callerMembership.role === "owner"`.

**Result:** 3 sequential calls → 2 phases. Saves ~2-3 s per remove request.

---

## Expected timing after deploy

| Operation | Before | After |
|---|---|---|
| Invite | 10–15 s (timeout) | 4–7 s (completes) |
| Remove | 6–9 s (timeout) | 3–5 s (completes) |

---

## What does NOT change

- All business logic and authorization — unchanged.
- The resend route — unchanged.
- `getOwnerContext` — unchanged (except Phase 1 now runs it in parallel with the RPC).
- `lib/email.ts` — unchanged.

---

## Verification after deploy

1. Settings → Team. Click **Remove** on `nyaristo01@gmail.com`.
   - Expected: button returns in < 8 s. Member row disappears.
2. Invite a new email. Click **Send invite**.
   - Expected: button returns in < 8 s. "Invitation sent to [email]."
3. Invite the same email again.
   - Expected: returns in < 8 s. Error: "An invitation has already been sent."
