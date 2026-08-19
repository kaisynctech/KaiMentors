# EP-081 — Fix getUser() Hang in Workspace Team Routes

## Root Cause

Three workspace management routes each call `supabase.auth.getUser()` as the
first step in every request. `getUser()` makes an **unbounded network
round-trip** to Supabase's auth API to verify the JWT. If that call is slow
(cold start, transient latency, or rate limit), the route hangs indefinitely
and the browser UI freezes:

- **Invite**: button stays on "Sending…" forever
- **Remove member**: button stays on "Removing…" forever
- **Resend invite email**: button stays on "Sending…" forever

This is identical to the root cause fixed in EP-078 for the activate route.

The fix is the same: replace `getUser()` with `getSession()`. `getSession()`
decodes the JWT **locally from the cookie** — no network call. The subsequent
PostgREST queries still carry the user's JWT via the Supabase client, so RLS
continues to enforce authorization at the database level.

**Important secondary observation from the screenshot:** the invite attempt was
for `nyaristo01@gmail.com`, who is already a Mentor in the workspace. Once the
route is unblocked, it will correctly return `409 — This person is already in
your workspace.` The UI already handles this: it reads `body.error` and
displays it as `inviteError`. No UI changes are needed for that path.

---

## Files changed

### `app/api/workspace/mentors/route.ts`

The `getOwnerContext()` helper is shared by `GET` and `POST`. Replace
`getUser()` with `getSession()` there — both handlers are fixed in one change.

**Replace (lines 6–23):**
```typescript
async function getOwnerContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  traderId: string,
) {
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id, role")
    .eq("user_id", user.id)
    .eq("trader_id", traderId)
    .maybeSingle();
  if (!membership) return null;
  return { user, tid: membership.trader_id, role: membership.role as "owner" | "mentor" };
}
```

**With:**
```typescript
async function getOwnerContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  traderId: string,
) {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return null;
  const user = session.user;
  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id, role")
    .eq("user_id", user.id)
    .eq("trader_id", traderId)
    .maybeSingle();
  if (!membership) return null;
  return { user, tid: membership.trader_id, role: membership.role as "owner" | "mentor" };
}
```

No other changes to this file.

---

### `app/api/workspace/mentors/[userId]/route.ts`

**Replace (lines 19–22):**
```typescript
const {
  data: { user },
} = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
```

**With:**
```typescript
const {
  data: { session },
} = await supabase.auth.getSession();
if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
const user = session.user;
```

No other changes to this file.

---

### `app/api/workspace/invitations/[id]/resend/route.ts`

**Replace (lines 14–17):**
```typescript
const {
  data: { user },
} = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
```

**With:**
```typescript
const {
  data: { session },
} = await supabase.auth.getSession();
if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
const user = session.user;
```

No other changes to this file.

---

## What does NOT change

- All business logic in all three routes — unchanged.
- The `after()` email dispatch in the resend route — unchanged.
- `team-manager.tsx` UI — unchanged. Error display already works correctly.
- Any other routes — unchanged.

---

## Verification after deploy

**Invite (new email):**
1. Go to Settings → Team in TC workspace as `kaisynctech@gmail.com`.
2. Enter a new email address (not already a member). Click **Send invite**.
3. Expected: button returns from "Sending…" within 2 seconds. Success message
   appears: "Invitation created for [email]. Use 'Resend' to email them the link."
4. Pending invitation row appears in the team list.

**Invite (existing member):**
1. Enter `nyaristo01@gmail.com` (already a Mentor). Click **Send invite**.
2. Expected: button returns within 2 seconds. Error displays:
   "This person is already in your workspace."

**Remove member:**
1. Click **Remove** on the Mentor row.
2. Expected: returns within 2 seconds, member row disappears.

**Resend:**
1. Click **Resend** on a pending invitation row.
2. Expected: returns within 2 seconds. "Sent!" confirmation appears.
