# EP-074 — Fix Workspace Context in Team APIs

## Root Cause

`getOwnerContext()` in every workspace mutation route does:
```typescript
.from("trader_members").select("trader_id, role")
.eq("user_id", user.id)
.order("created_at")   // ← oldest workspace first
.limit(1)
.maybeSingle();
```

`kaisynctech@gmail.com` owns 4 workspaces. KaiTrades was created first, so every invite,
remove, cancel, and resend targets KaiTrades regardless of which settings page the owner
is on. `nyaristo01@gmail.com` was silently added to KaiTrades instead of Traders Confidence.

## Fix Strategy

- **Invite POST, Mentor DELETE, Team GET** — client passes `traderId`; server validates
  the caller is owner of *that* specific workspace via `.eq("trader_id", traderId)`.
- **Cancel invitation DELETE, Resend POST** — server derives `traderId` from the invitation
  row itself (ground truth); validates caller is owner of that workspace.
  No client change needed for these two.
- **`TeamManager`** receives `traderId` prop; passes it in invite body and remove URL.
- **Settings page** passes `traderId={traderId}` to `TeamManager`.

---

## Files to modify

### 1. `app/api/workspace/mentors/route.ts`

#### Replace `getOwnerContext` with a workspace-aware version

```typescript
async function getOwnerContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  traderId: string,
) {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id, role")
    .eq("user_id", user.id)
    .eq("trader_id", traderId)   // ← scoped to the requested workspace
    .maybeSingle();
  if (!membership) return null;
  return { user, tid: membership.trader_id, role: membership.role as "owner" | "mentor" };
}
```

#### GET — accept `traderId` query param

```typescript
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const traderId = searchParams.get("traderId") ?? "";
  if (!traderId) return NextResponse.json({ error: "traderId required." }, { status: 400 });

  const supabase = await createClient();
  const ctx = await getOwnerContext(supabase, traderId);
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  // ... rest of GET unchanged (already uses ctx.tid)
}
```

#### POST — extract `traderId` from request body

```typescript
const inviteSchema = z.object({
  traderId: z.string().uuid(),
  email: z.string().email().toLowerCase().trim(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid email address and traderId are required." }, { status: 400 });
  }

  const { traderId, email } = parsed.data;

  const supabase = await createClient();
  const ctx = await getOwnerContext(supabase, traderId);
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (ctx.role !== "owner") {
    return NextResponse.json({ error: "Only the workspace owner can invite mentors." }, { status: 403 });
  }

  // ... rest of POST unchanged — remove the separate inviteSchema.safeParse call
  //     (email is already in parsed.data above)
  if (email === ctx.user.email?.toLowerCase()) {
    return NextResponse.json({ error: "You cannot invite yourself." }, { status: 400 });
  }
  // ... continue as before
}
```

---

### 2. `app/api/workspace/mentors/[userId]/route.ts`

Accept `traderId` as a query param:

```typescript
export async function DELETE(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const params = z.object({ userId: z.string().uuid() }).safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid ID." }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const traderId = searchParams.get("traderId") ?? "";
  if (!traderId) return NextResponse.json({ error: "traderId required." }, { status: 400 });

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data: callerMembership } = await supabase
    .from("trader_members")
    .select("trader_id, role")
    .eq("user_id", user.id)
    .eq("trader_id", traderId)   // ← scoped
    .maybeSingle();

  if (!callerMembership || callerMembership.role !== "owner") {
    return NextResponse.json({ error: "Only the workspace owner can remove mentors." }, { status: 403 });
  }

  // ... rest of DELETE unchanged (uses callerMembership.trader_id which is now correct)
}
```

---

### 3. `app/api/workspace/invitations/[invitationId]/route.ts`

Derive `traderId` from the invitation itself — no URL change required:

```typescript
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ invitationId: string }> },
) {
  const params = z.object({ invitationId: z.string().uuid() }).safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid ID." }, { status: 400 });

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  // Look up invitation first — its trader_id is the ground truth
  const { data: invitation } = await supabase
    .from("workspace_invitations")
    .select("id, trader_id, accepted_at")
    .eq("id", params.data.invitationId)
    .is("accepted_at", null)
    .maybeSingle();

  if (!invitation) return NextResponse.json({ error: "Invitation not found." }, { status: 404 });

  // Validate caller is owner of that invitation's workspace
  const { data: membership } = await supabase
    .from("trader_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("trader_id", invitation.trader_id)   // ← scoped to invitation's workspace
    .maybeSingle();

  if (!membership || membership.role !== "owner") {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }

  const { error } = await supabase
    .from("workspace_invitations")
    .delete()
    .eq("id", params.data.invitationId)
    .eq("trader_id", invitation.trader_id);

  if (error) return NextResponse.json({ error: "Could not cancel invitation." }, { status: 500 });
  return NextResponse.json({ cancelled: params.data.invitationId });
}
```

---

### 4. `app/api/workspace/invitations/[id]/resend/route.ts`

Same pattern — derive workspace from invitation, no client change:

```typescript
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  // Fetch invitation — its trader_id is the ground truth
  const { data: invitation } = await admin
    .from("workspace_invitations")
    .select("id, email, trader_id, accepted_at")
    .eq("id", id)
    .maybeSingle();

  if (!invitation) return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
  if (invitation.accepted_at) return NextResponse.json({ error: "Invitation already accepted." }, { status: 409 });

  // Validate caller is owner of that invitation's workspace
  const { data: membership } = await supabase
    .from("trader_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("trader_id", invitation.trader_id)   // ← scoped
    .maybeSingle();

  if (!membership || membership.role !== "owner") {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Fetch workspace name and inviter name
  const [{ data: portalRow }, { data: inviterProfile }] = await Promise.all([
    supabase.from("portals").select("portal_name").eq("trader_id", invitation.trader_id).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);

  const workspaceName = portalRow?.portal_name ?? "the workspace";
  const inviterName   = inviterProfile?.full_name ?? "Your colleague";
  const siteUrl       = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const joinUrl       = `${siteUrl}/join/${invitation.id}`;

  try {
    await sendWorkspaceInvitation({ to: invitation.email, workspaceName, inviterName, joinUrl });
  } catch {
    return NextResponse.json({ error: "Could not send invitation email." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

---

### 5. `components/team-manager.tsx`

#### Add `traderId` to Props

```typescript
interface Props {
  members: Member[];
  profiles: Profile[];
  invitations: PendingInvitation[];
  callerUserId: string;
  callerRole: "owner" | "mentor";
  traderId: string;   // ← new
}
```

Update destructuring:
```typescript
export function TeamManager({
  members,
  profiles,
  invitations,
  callerUserId,
  callerRole,
  traderId,   // ← new
}: Props) {
```

#### Update `sendInvite` — include `traderId` in body

```typescript
body: JSON.stringify({ traderId, email: email.trim() }),
```

#### Update `removeMember` — include `traderId` as query param

```typescript
const res = await fetch(`/api/workspace/mentors/${userId}?traderId=${traderId}`, { method: "DELETE" });
```

No changes needed to `cancelInvitation` or `resendInvitation` — those routes now derive the workspace from the invitation row.

---

### 6. `app/dashboard/settings/page.tsx`

In the team tab `<TeamManager>` render, add the `traderId` prop:

```tsx
<TeamManager
  callerRole={membership?.role ?? "mentor"}
  callerUserId={user.id}
  invitations={invitations ?? []}
  members={members ?? []}
  profiles={profiles ?? []}
  traderId={traderId}   // ← add this
/>
```

`traderId` is already available in scope from `getMentorWorkspace()` at line 24.

---

## DB cleanup required (do before deploying)

`nyaristo01@gmail.com` was incorrectly added to KaiTrades. Remove that row:

```sql
DELETE FROM public.trader_members
WHERE user_id = '1e282f80-7949-478b-a6ce-73d7cd9e17b7'
AND trader_id = 'cf6c1fc0-fe69-41cd-bb38-ad06fa098dfc';
```

After deploy, invite them again from the Traders Confidence settings page — they will land in the right workspace.

## No migration required
Schema unchanged.
