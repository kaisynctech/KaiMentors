# EP-049 — Multi-Mentor Workspace Support

**Status:** Ready for Engineering — implement after EP-048 is verified  
**Architect:** KaiMentors Enterprise Architect  
**Date:** 2026-06-30  
**Scope:** Multiple mentors per workspace — invite flow, team management, per-mentor availability, student mentor selection  
**Migration required:** Yes  
**API changes:** Yes  
**Package install required:** No

---

## Context

Currently each workspace has exactly one mentor. This EP allows a workspace owner to invite additional mentors by email. Invited mentors receive a setup email from Supabase, set their password, and land directly on the mentor dashboard with full access. Each mentor manages their own availability calendar. Students see a mentor selection step when booking into a multi-mentor workspace. The owner sees all bookings; all mentors default to their own view.

---

## Change 1 — Migration

Apply to the KaiMentors Supabase project (`jsbpfhfmumjbrnymhtvq`). Run all statements in a single migration.

```sql
-- ── 1. Role column on trader_members ─────────────────────────────────────
ALTER TABLE public.trader_members
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'mentor'
  CHECK (role IN ('owner', 'mentor'));

-- Existing members are owners (each workspace currently has one member)
UPDATE public.trader_members SET role = 'owner';

-- ── 2. mentor_user_id on mentor_availability ─────────────────────────────
ALTER TABLE public.mentor_availability
  ADD COLUMN IF NOT EXISTS mentor_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Backfill: assign existing rows to the owner of each workspace
UPDATE public.mentor_availability ma
SET mentor_user_id = (
  SELECT tm.user_id
  FROM public.trader_members tm
  WHERE tm.trader_id = ma.trader_id
  ORDER BY tm.created_at
  LIMIT 1
);

ALTER TABLE public.mentor_availability ALTER COLUMN mentor_user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS mentor_availability_mentor_idx
  ON public.mentor_availability (trader_id, mentor_user_id);

-- ── 3. mentor_user_id on availability_overrides ──────────────────────────
ALTER TABLE public.availability_overrides
  ADD COLUMN IF NOT EXISTS mentor_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

UPDATE public.availability_overrides ao
SET mentor_user_id = (
  SELECT tm.user_id
  FROM public.trader_members tm
  WHERE tm.trader_id = ao.trader_id
  ORDER BY tm.created_at
  LIMIT 1
);

ALTER TABLE public.availability_overrides ALTER COLUMN mentor_user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS availability_overrides_mentor_idx
  ON public.availability_overrides (trader_id, mentor_user_id);

-- ── 4. mentor_user_id on bookings (nullable — backfill + forward-only) ───
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS mentor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.bookings b
SET mentor_user_id = (
  SELECT tm.user_id
  FROM public.trader_members tm
  WHERE tm.trader_id = b.trader_id
  ORDER BY tm.created_at
  LIMIT 1
);

CREATE INDEX IF NOT EXISTS bookings_mentor_idx ON public.bookings (trader_id, mentor_user_id);

-- ── 5. workspace_invitations table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workspace_invitations (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id    uuid        NOT NULL REFERENCES public.traders(id) ON DELETE CASCADE,
  email        text        NOT NULL,
  invited_by   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  accepted_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trader_id, email)
);

CREATE INDEX IF NOT EXISTS workspace_invitations_trader_idx
  ON public.workspace_invitations (trader_id, accepted_at);

ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner reads own invitations"
  ON public.workspace_invitations FOR SELECT
  USING (is_trader_member(trader_id) OR is_super_admin());

CREATE POLICY "owner deletes own invitations"
  ON public.workspace_invitations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.trader_members
      WHERE trader_id = workspace_invitations.trader_id
        AND user_id = auth.uid()
        AND role = 'owner'
    )
    OR is_super_admin()
  );
-- INSERT and UPDATE are handled by the admin client (service role)

-- ── 6. SQL helper: look up auth.users by email ───────────────────────────
-- Required because supabase-js v2 admin.auth.getUserByEmail does not exist.
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(input_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE email = lower(trim(input_email)) LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO service_role;
```

---

## Change 2 — Workspace mentor management API

### GET /api/workspace/mentors

**New file:** `app/api/workspace/mentors/route.ts`

Returns all active members plus pending invitations for the caller's workspace.

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function getMemberContext(supabase: Awaited<ReturnType<typeof createClient>>) {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id, role")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!membership) return null;
  return { user, tid: membership.trader_id, role: membership.role };
}

export async function GET() {
  const supabase = await createClient();
  const ctx = await getMemberContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const [{ data: members }, { data: invitations }] = await Promise.all([
    supabase
      .from("trader_members")
      .select("user_id, role, created_at, profile:profiles!user_id(full_name, email:profiles_email)")
      .eq("trader_id", ctx.tid)
      .order("created_at"),
    supabase
      .from("workspace_invitations")
      .select("id, email, created_at")
      .eq("trader_id", ctx.tid)
      .is("accepted_at", null)
      .order("created_at"),
  ]);

  return NextResponse.json({
    members: members ?? [],
    pendingInvitations: invitations ?? [],
    callerRole: ctx.role,
  });
}
```

**Note:** If the `profiles` table does not have an `email` column, remove `email:profiles_email` from the select and display `user_id` only. Check the actual `profiles` schema in the repo before writing this query.

### POST /api/workspace/mentors

Add to the same file (`app/api/workspace/mentors/route.ts`):

```typescript
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const inviteSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const ctx = await getMemberContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const parsed = inviteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }

  const email = parsed.data.email;

  // Prevent adding self
  if (email === ctx.user.email) {
    return NextResponse.json({ error: "You cannot invite yourself." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  // Look up existing user by email via SECURITY DEFINER function
  const { data: existingUserId } = await supabase.rpc("get_user_id_by_email", {
    input_email: email,
  });

  if (existingUserId) {
    // User already has a KaiMentors account — add directly to trader_members
    const { error: memberError } = await admin
      .from("trader_members")
      .insert({ trader_id: ctx.tid, user_id: existingUserId, role: "mentor" });

    if (memberError) {
      if (memberError.code === "23505") {
        return NextResponse.json({ error: "This person is already in your workspace." }, { status: 409 });
      }
      return NextResponse.json({ error: "Could not add mentor." }, { status: 500 });
    }

    return NextResponse.json({ added: true, invited: false });
  }

  // New user — check for existing pending invitation
  const { data: existing } = await supabase
    .from("workspace_invitations")
    .select("id")
    .eq("trader_id", ctx.tid)
    .eq("email", email)
    .is("accepted_at", null)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "An invitation has already been sent to this email." }, { status: 409 });
  }

  // Insert pending invitation
  const { data: invitation, error: invErr } = await admin
    .from("workspace_invitations")
    .insert({ trader_id: ctx.tid, email, invited_by: ctx.user.id })
    .select("id")
    .single();

  if (invErr || !invitation) {
    return NextResponse.json({ error: "Could not create invitation." }, { status: 500 });
  }

  // Send Supabase invite email — creates account + sends setup link
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const redirectTo = `${siteUrl}/invite/accept?id=${invitation.id}`;

  const { error: authErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
  });

  if (authErr) {
    // Roll back the invitation row on failure
    await admin.from("workspace_invitations").delete().eq("id", invitation.id);
    return NextResponse.json({ error: "Could not send invitation email." }, { status: 500 });
  }

  return NextResponse.json({ added: false, invited: true }, { status: 201 });
}
```

**Environment variable required:** Add `NEXT_PUBLIC_SITE_URL` to Vercel (e.g. `https://kaimentors.com`). This is used to construct the redirect URL in the invite email.

### DELETE /api/workspace/mentors/[userId]

**New file:** `app/api/workspace/mentors/[userId]/route.ts`

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const params = z.object({ userId: z.string().uuid() }).safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid ID." }, { status: 400 });

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data: callerMembership } = await supabase
    .from("trader_members")
    .select("trader_id, role")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (!callerMembership) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }

  const targetUserId = params.data.userId;

  if (targetUserId === user.id) {
    return NextResponse.json({ error: "You cannot remove yourself." }, { status: 400 });
  }

  // Nobody can remove the workspace owner
  const { data: targetMembership } = await supabase
    .from("trader_members")
    .select("role")
    .eq("trader_id", callerMembership.trader_id)
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (targetMembership?.role === "owner") {
    return NextResponse.json({ error: "The workspace owner cannot be removed." }, { status: 403 });
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

  if (upcoming && upcoming.length > 0) {
    return NextResponse.json(
      { error: "This mentor has upcoming confirmed bookings. Cancel or reassign them first." },
      { status: 409 },
    );
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const { error } = await admin
    .from("trader_members")
    .delete()
    .eq("trader_id", callerMembership.trader_id)
    .eq("user_id", targetUserId);

  if (error) return NextResponse.json({ error: "Could not remove mentor." }, { status: 500 });
  return NextResponse.json({ removed: targetUserId });
}
```

### DELETE /api/workspace/invitations/[invitationId]

**New file:** `app/api/workspace/invitations/[invitationId]/route.ts`

Allows the owner to cancel a pending invitation.

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

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

  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id, role")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { error } = await supabase
    .from("workspace_invitations")
    .delete()
    .eq("id", params.data.invitationId)
    .eq("trader_id", membership.trader_id)
    .is("accepted_at", null);

  if (error) return NextResponse.json({ error: "Could not cancel invitation." }, { status: 500 });
  return NextResponse.json({ cancelled: params.data.invitationId });
}
```

---

## Change 3 — Invite acceptance page

**New file:** `app/invite/accept/page.tsx`

This page is the `redirectTo` target from the Supabase invite email. By the time the mentor lands here, Supabase has already authenticated them (handled by the auth callback). The page reads the invitation ID, looks it up, adds the mentor to `trader_members`, marks the invitation accepted, and redirects to `/dashboard`.

```typescript
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function InviteAcceptPage({
  searchParams,
}: {
  searchParams?: Promise<{ id?: string }>;
}) {
  const query = await searchParams;
  const invitationId = query?.id;

  if (!invitationId) redirect("/");

  const supabase = await createClient();
  if (!supabase) redirect("/login");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // Not logged in yet — redirect to login with return URL
    redirect(`/login?next=/invite/accept?id=${invitationId}`);
  }

  const admin = createAdminClient();
  if (!admin) redirect("/dashboard");

  // Look up the invitation
  const { data: invitation } = await admin
    .from("workspace_invitations")
    .select("id, trader_id, email, accepted_at")
    .eq("id", invitationId)
    .maybeSingle();

  if (!invitation) {
    // Invalid or already deleted — go to dashboard anyway
    redirect("/dashboard");
  }

  if (invitation.accepted_at) {
    // Already accepted
    redirect("/dashboard");
  }

  // Verify the logged-in user's email matches the invitation
  if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
    // Wrong account — show an error (render a simple message, don't crash)
    return (
      <div style={{ padding: 40, fontFamily: "sans-serif" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Wrong account</h1>
        <p style={{ color: "#6b7280" }}>
          This invitation was sent to <strong>{invitation.email}</strong>. You are logged in as{" "}
          <strong>{user.email}</strong>. Please sign in with the correct account and try again.
        </p>
      </div>
    );
  }

  // Add to trader_members (ignore conflict — may have been added directly already)
  await admin
    .from("trader_members")
    .upsert(
      { trader_id: invitation.trader_id, user_id: user.id, role: "mentor" },
      { onConflict: "trader_id,user_id", ignoreDuplicates: true },
    );

  // Mark invitation as accepted
  await admin
    .from("workspace_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invitationId);

  redirect("/dashboard");
}
```

---

## Change 4 — Team management page

**New file:** `app/dashboard/team/page.tsx`

Server component. All workspace members can view the team page; only the owner sees the invite form and remove buttons.

```typescript
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { TeamManager } from "@/components/team-manager";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id, role, trader:traders(display_name, timezone)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/dashboard");

  const trader = Array.isArray(membership.trader) ? membership.trader[0] : membership.trader;

  const [{ data: members }, { data: invitations }] = await Promise.all([
    supabase
      .from("trader_members")
      .select("user_id, role, created_at")
      .eq("trader_id", membership.trader_id)
      .order("created_at"),
    supabase
      .from("workspace_invitations")
      .select("id, email, created_at")
      .eq("trader_id", membership.trader_id)
      .is("accepted_at", null)
      .order("created_at"),
  ]);

  // Fetch profiles for all member user_ids
  const memberUserIds = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = memberUserIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", memberUserIds)
    : { data: [] };

  return (
    <DashboardShell
      activePath="/dashboard/team"
      title="Team"
      description="Manage the mentors in your workspace."
      userLabel={trader?.display_name ?? "Workspace"}
    >
      <TeamManager
        members={members ?? []}
        profiles={profiles ?? []}
        invitations={invitations ?? []}
        callerUserId={user.id}
        callerRole={membership.role}
      />
    </DashboardShell>
  );
}
```

### TeamManager component

**New file:** `components/team-manager.tsx`

`"use client"` component.

Props:
```typescript
interface Member {
  user_id: string;
  role: "owner" | "mentor";
  created_at: string;
}
interface Profile {
  id: string;
  full_name: string | null;
}
interface PendingInvitation {
  id: string;
  email: string;
  created_at: string;
}
interface Props {
  members: Member[];
  profiles: Profile[];
  invitations: PendingInvitation[];
  callerUserId: string;
  callerRole: "owner" | "mentor";
}
```

**Layout:**

Section 1 — **Current team** — a list of `Member` rows. Each row:
- Display name from `profiles` (matched by `user_id`), fallback `user_id.slice(0,8)`
- Role badge: `Owner` (grey) or `Mentor` (blue)
- If `member.role !== 'owner'` and `member.user_id !== callerUserId`: a "Remove" button that calls `DELETE /api/workspace/mentors/[userId]`. On success, calls `router.refresh()`. The owner row never shows a remove button.

Section 2 — **Pending invitations** (shown to all mentors, only if `invitations.length > 0`) — list of pending invite rows showing email and "Sent [date]". Each has a "Cancel" button calling `DELETE /api/workspace/invitations/[invitationId]`. On success, calls `router.refresh()`.

Section 3 — **Invite a mentor** (shown to all mentors) — a simple form:

```
Email address: [________________]  [Send invite]
```

On submit:
```typescript
async function sendInvite(email: string) {
  const res = await fetch("/api/workspace/mentors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const body = await res.json();
  if (!res.ok) {
    setError(body.error ?? "Could not send invitation.");
    return;
  }
  if (body.invited) {
    setSuccess(`Invitation sent to ${email}.`);
  } else {
    setSuccess(`${email} has been added to your workspace.`);
  }
  setEmail("");
  router.refresh();
}
```

Show success message for 4 seconds, then clear it.

### Add "Team" to dashboard nav

**File:** `components/dashboard-shell.tsx`

Use `Edit`. Add a "Team" nav item after "Bookings":

```typescript
{ label: "Team", href: "/dashboard/team", icon: Users }
```

Import `Users` from `lucide-react`.

---

## Change 5 — Availability API: scope per mentor

All four availability API files need `mentor_user_id` added. Use `Edit` on each — do not rewrite the files.

### `app/api/bookings/availability/route.ts`

In `GET`: add `.eq("mentor_user_id", ctx.user.id)` to the `mentor_availability` select query.

In `POST` insert: add `mentor_user_id: ctx.user.id` to the insert object.

### `app/api/bookings/availability/[windowId]/route.ts`

In `PATCH` and `DELETE`: add `.eq("mentor_user_id", user.id)` alongside the existing `.eq("trader_id", membership.trader_id)` filter. This prevents a mentor from modifying another mentor's windows.

### `app/api/bookings/availability/overrides/route.ts`

In `GET`: add `.eq("mentor_user_id", user.id)` to the query.

In `POST` insert: add `mentor_user_id: membership.user_id` — resolve `user_id` from the membership query (it's already `user.id`).

### `app/api/bookings/availability/overrides/[overrideId]/route.ts`

In `DELETE`: add `.eq("mentor_user_id", user.id)` to the delete filter.

---

## Change 6 — Slots API: accept mentorUserId param

**File:** `app/api/bookings/slots/route.ts` (created in EP-047)

Use `Edit`. Add `mentorUserId` as an optional query param. When the workspace has only one active mentor this param may be omitted (the API auto-detects). When there are multiple mentors it is required.

```typescript
// Add to the existing query-param parsing at the top of GET():
const mentorUserIdParam = url.searchParams.get("mentorUserId");

// After resolving traderId, determine the effective mentorUserId:
let mentorUserId: string;
if (mentorUserIdParam) {
  // Verify this user is actually a mentor in this workspace
  const { data: mentorCheck } = await supabase
    .from("trader_members")
    .select("user_id")
    .eq("trader_id", traderId)
    .eq("user_id", mentorUserIdParam)
    .maybeSingle();
  if (!mentorCheck) {
    return NextResponse.json({ error: "Mentor not found in this workspace." }, { status: 400 });
  }
  mentorUserId = mentorUserIdParam;
} else {
  // Fall back to the single mentor (owner) — only valid for single-mentor workspaces
  const { data: ownerMember } = await supabase
    .from("trader_members")
    .select("user_id")
    .eq("trader_id", traderId)
    .eq("role", "owner")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!ownerMember) {
    return NextResponse.json({ error: "mentorUserId is required for multi-mentor workspaces." }, { status: 400 });
  }
  mentorUserId = ownerMember.user_id;
}

// Then add .eq("mentor_user_id", mentorUserId) to:
// - the mentor_availability query
// - the availability_overrides query
// - the conflict detection query on bookings (add .eq("mentor_user_id", mentorUserId))
```

---

## Change 7 — Booking creation: set mentor_user_id

**File:** `app/api/bookings/route.ts` (created in EP-047)

Use `Edit`. The POST body already has `mentorUserId` (add it to the Zod schema) and sets it on the booking insert:

Add `mentorUserId: z.string().uuid()` to the booking creation schema.

In the insert call, add `mentor_user_id: body.mentorUserId` to the inserted object.

---

## Change 8 — Student booking flow: mentor selection step

**File:** `app/student/bookings/page.tsx` and `components/student-booking-flow.tsx`

### page.tsx update (Edit, not Write)

Fetch the workspace's active mentors before rendering the booking flow:

```typescript
// After resolving app.trader_id:
const { data: mentorMembers } = await supabase
  .from("trader_members")
  .select("user_id, role")
  .eq("trader_id", app.trader_id)
  .order("created_at");

const mentorUserIds = (mentorMembers ?? []).map((m) => m.user_id);

const { data: mentorProfiles } = mentorUserIds.length
  ? await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", mentorUserIds)
  : { data: [] };

// Build mentor list
const mentors = (mentorMembers ?? []).map((m) => ({
  userId: m.user_id,
  role: m.role,
  name:
    mentorProfiles?.find((p) => p.id === m.user_id)?.full_name ??
    "Mentor",
}));
```

Pass `mentors` as a prop to `StudentBookingFlow`.

### StudentBookingFlow update (Edit, not Write)

Add `mentors` prop:

```typescript
interface Mentor {
  userId: string;
  role: "owner" | "mentor";
  name: string;
}

interface StudentBookingFlowProps {
  // ... existing props ...
  mentors: Mentor[];
}
```

**When `mentors.length === 1`**: skip Step 0 entirely. Set `selectedMentor` to `mentors[0]` immediately. Behaviour is identical to EP-047 — no UX change for single-mentor workspaces.

**When `mentors.length > 1`**: insert Step 0 before the existing step 1 (session type selection).

The step numbering becomes:
- Step 0 — Select mentor
- Step 1 — Select session type
- Step 2 — Pick date & time
- Step 3 — Confirm

**Step 0 UI** — a grid of mentor cards. Each card:
- Mentor name (large, bold)
- Role badge (`Lead mentor` for owner, `Mentor` for others)
- "Book with [name]" button

Clicking a card sets `selectedMentor` and advances to Step 1.

The `selectedMentor.userId` is passed to all subsequent API calls:
- Slots: `GET /api/bookings/slots?sessionTypeId=...&date=...&traderId=...&mentorUserId=[selectedMentor.userId]`
- Booking creation body: `{ ..., mentorUserId: selectedMentor.userId }`

---

## Change 9 — Booking dashboard: mentor filter

**File:** `components/booking-session-type-manager.tsx`

Use `Edit`. In the Bookings tab, add a mentor filter shown to all mentors when the workspace has more than one member.

**File:** `app/dashboard/bookings/page.tsx`

Use `Edit`. Fetch the workspace mentors (same query as Change 8 above) and pass `mentors` and `callerRole` to `BookingSessionTypeManager`.

**In BookingSessionTypeManager:**

```typescript
// Above the filter bar, shown to all mentors when workspace has multiple members:
{mentors.length > 1 && (
  <div style={{ marginBottom: 12 }}>
    <label style={{ fontSize: 12, color: "#6b7280", marginRight: 8 }}>Mentor:</label>
    <select
      value={mentorFilter ?? "mine"}
      onChange={(e) => setMentorFilter(e.target.value)}
      style={{ fontSize: 13, border: "1px solid #d1d5db", borderRadius: 6, padding: "4px 8px" }}
    >
      <option value="mine">My bookings</option>
      <option value="all">All mentors</option>
      {mentors.map((m) => (
        <option key={m.userId} value={m.userId}>{m.name}</option>
      ))}
    </select>
  </div>
)}
```

Default: `mentorFilter = callerUserId` (show own bookings). Selecting "All mentors" sets `mentorFilter = "all"` and shows every booking across the workspace. Selecting a specific mentor filters to their bookings.

Apply the filter in the booking list:
```typescript
const filteredBookings = mentorFilter === "all"
  ? bookings
  : bookings?.filter((b) => b.mentor_user_id === mentorFilter);
```

Add `mentor_user_id` to the bookings select query in `page.tsx`:
```typescript
.select("id,student_user_id,session_type_id,starts_at,ends_at,status,student_notes,mentor_notes,cancellation_reason,cancelled_by,live_class_id,mentor_user_id,application:student_applications!application_id(full_name)")
```

---

## Commit and deploy

```bash
npx tsc --noEmit
git add -A
git commit -m "EP-049: multi-mentor workspace — invite flow, team management, per-mentor availability"
git push origin main
```

---

## Acceptance criteria

Test against KaiTrades only.

1. **Single-mentor workspaces are unaffected** — existing availability, booking flow, and dashboard behave identically to EP-047/EP-048
2. Owner navigates to `/dashboard/team` — sees themselves listed as Owner
3. Owner enters a new email (not a KaiMentors user) in the invite form → "Invitation sent" message appears; row appears in pending invitations list
4. Invited mentor receives an email from Supabase; clicking the link redirects to `/invite/accept?id=...`
5. Invited mentor sets their password on the Supabase-hosted setup screen, then lands on `/dashboard` — they can see the mentor dashboard and set up their availability
6. Owner refreshes `/dashboard/team` — pending invite is now gone (accepted); new mentor appears in the active members list
7. Owner invites an email that already has a KaiMentors account → they are added immediately with no invite email; success message says "has been added to your workspace"
8. Owner tries to add the same email twice → 409 error shown in the form
9. Any mentor cancels a pending invitation → row disappears from the list
10. Any mentor removes another mentor (non-owner) with no upcoming confirmed bookings → mentor disappears from the team list; they can no longer access the dashboard for that workspace
11. Attempt to remove a mentor with an upcoming confirmed booking → error message shown; member not removed
12. Attempt to remove the workspace owner → error message shown; owner not removed
13. A student booking into a multi-mentor workspace sees a **Step 0: Select mentor** screen before session types
14. Student selects a mentor → subsequent availability calendar shows only that mentor's availability slots
15. After booking, the booking record has `mentor_user_id` set to the selected mentor
16. Each mentor's `/dashboard/bookings` Bookings tab defaults to their own bookings
17. Any mentor sees a "Mentor" dropdown in the Bookings tab when the workspace has multiple mentors; selecting "All mentors" shows every booking across the workspace
18. Any workspace member can send an invite — `POST /api/workspace/mentors` succeeds for non-owner mentors
19. Unauthenticated requests to `POST /api/workspace/mentors` return 401
