# EP-083 — Send Email When Existing User Is Added to Workspace

## Root Cause

When the workspace owner invites an email address that belongs to an **existing
Supabase user**, the POST route (`app/api/workspace/mentors/route.ts`) skips
the `workspace_invitations` table entirely and inserts directly into
`trader_members`. This is correct — the user already has an account, so no
join link is needed. But the route returns `{ added: true, invited: false }`
with no email fired. The new mentor never hears anything.

`lib/email.ts` already has `sendWorkspaceAdded` — a styled "You've been added
to [workspace]" email with a "Go to dashboard" link pointing at the portal
login. It was written but never wired up to this path.

## Fix

In the POST route's existing-user branch, after a successful `trader_members`
insert, fire `sendWorkspaceAdded` via `after()` so the HTTP response is not
blocked.

---

## File changes

### `app/api/workspace/mentors/route.ts`

**Add imports at the top of the file:**
```typescript
import { NextResponse, after } from "next/server";
```
(Replace the existing `import { NextResponse } from "next/server";` line.)

Also add:
```typescript
import { sendWorkspaceAdded } from "@/lib/email";
```

**Replace the existing-user block (currently lines 106–123):**
```typescript
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

    return NextResponse.json({ added: true, invited: false });
  }
```

**With:**
```typescript
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

    // Fire "you've been added" email after the response — non-blocking.
    after(async () => {
      try {
        const [{ data: portalRow }, { data: inviterProfile }] = await Promise.all([
          admin.from("portals").select("portal_name, slug").eq("trader_id", ctx.tid).maybeSingle(),
          admin.from("profiles").select("full_name").eq("id", ctx.user.id).maybeSingle(),
        ]);
        const workspaceName = portalRow?.portal_name ?? "the workspace";
        const inviterName   = inviterProfile?.full_name ?? "Your colleague";
        const siteUrl       = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kaimentors.vercel.app";
        const dashboardUrl  = portalRow?.slug
          ? `${siteUrl}/portal/${portalRow.slug}/login`
          : `${siteUrl}/login`;
        await sendWorkspaceAdded({ to: email, workspaceName, inviterName, dashboardUrl });
      } catch {
        // Email failure must not affect the response.
      }
    });

    return NextResponse.json({ added: true, invited: false });
  }
```

---

## What does NOT change

- The invitation flow for new users (no existing Supabase account) — unchanged.
  They still get a `workspace_invitations` row and use the Resend button for the
  join-link email.
- `lib/email.ts` — unchanged. `sendWorkspaceAdded` is already there.
- All other routes — unchanged.

---

## Immediate action for Bongani (nyaristo01@gmail.com)

He was manually inserted into `trader_members` and never received an email. He
already has a full account — he simply needs to know the portal login URL.

**Send him this directly:**
```
You have been added as a mentor to the Traders Confidence workspace.
Log in here to access it: https://kaimentors.vercel.app/portal/traders-confidence/login
```

He can log in with `nyaristo01@gmail.com` and his existing password. No invite
link or token is needed — he is already a member.

Going forward, EP-083 ensures every future direct-add fires the email
automatically.

---

## Verification after deploy

1. Remove the current Mentor (`nyaristo01@gmail.com`) from Settings → Team
   (after EP-081 is deployed so Remove doesn't hang).
2. Re-invite `nyaristo01@gmail.com` using the invite form.
3. Since he is an existing Supabase user, the route will take the direct-add
   path and fire `sendWorkspaceAdded` via `after()`.
4. Expected: button returns within 2 seconds. Success message: "[email] has been
   added to your workspace."
5. `nyaristo01@gmail.com` receives an email: "You've been added to Traders
   Confidence" with a link to the portal login.
