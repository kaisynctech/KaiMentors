# Mission Brief MB-105
## Fix Dynamic Route Slug Conflict — `[id]` vs `[invitationId]`

**Status:** Approved for Engineering  
**Date:** 2026-07-05  
**Priority:** CRITICAL — Production Blocker (root cause of all API 504s)  
**Prepared by:** Enterprise Architect

---

## Root Cause (Tool-Verified, No Guesswork)

From Vercel function logs (Unhandled Rejection, confirmed by screenshot):

```
Error: You cannot use different slug names for the same dynamic path ('id' !== 'invitationId').
```

Two route files exist at the same dynamic path depth with different segment names:

| File | Segment name |
|------|-------------|
| `app/api/workspace/invitations/[invitationId]/route.ts` | `invitationId` |
| `app/api/workspace/invitations/[id]/resend/route.ts` | `id` |

Next.js requires all dynamic segments at the same directory level to use the **same name**. These two violate that rule. On Lambda cold start, Next.js calls `rj.reload()` to build the route tree, hits this conflict, and throws an **Unhandled Rejection**. The Lambda runtime is then in a corrupted state for all subsequent requests.

**Effect on the domains route:** `await createClient()` calls `await cookies()` from `next/headers`. When the runtime is corrupted, this call never resolves. Every POST to `/api/website-builder/domains` hangs until Vercel's 5-minute function timeout (504 FUNCTION_INVOCATION_TIMEOUT). No console.log lines appear, no Supabase calls are made, no bytes are returned to the browser.

This one conflict breaks every API route on the deployment.

---

## Files Confirmed (tool-read)

### File A — keep as-is (correct segment name, no changes)
`app/api/workspace/invitations/[invitationId]/route.ts`
- Handles: `DELETE /api/workspace/invitations/:invitationId`
- Param used: `context.params.invitationId` ✓

### File B — must be moved + updated
`app/api/workspace/invitations/[id]/resend/route.ts`
- Handles: `POST /api/workspace/invitations/:id/resend`
- Param used: `params.id` ← must change to `invitationId`
- Directory: `[id]` ← must rename to `[invitationId]`

---

## Implementation

### Step 1 — Create the new file at the correct path

Create `app/api/workspace/invitations/[invitationId]/resend/route.ts` with this exact content:

```typescript
import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWorkspaceInvitation } from "@/lib/email";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ invitationId: string }> },
) {
  const { invitationId: id } = await params;

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const user = session.user;

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  // Fetch invitation — its trader_id is the ground truth
  const { data: invitation } = await admin
    .from("workspace_invitations")
    .select("id, email, trader_id, accepted_at")
    .eq("id", id)
    .maybeSingle();

  if (!invitation) return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
  if (invitation.accepted_at) {
    return NextResponse.json({ error: "Invitation already accepted." }, { status: 409 });
  }

  // Validate caller is owner of that invitation's workspace
  const { data: membership } = await supabase
    .from("trader_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("trader_id", invitation.trader_id)
    .maybeSingle();

  if (!membership || membership.role !== "owner") {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const [{ data: portalRow }, { data: inviterProfile }] = await Promise.all([
    supabase.from("portals").select("portal_name").eq("trader_id", invitation.trader_id).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);

  const workspaceName = portalRow?.portal_name ?? "the workspace";
  const inviterName   = inviterProfile?.full_name ?? "Your colleague";
  const siteUrl       = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const joinUrl       = `${siteUrl}/join/${invitation.id}`;

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
}
```

**The only change from the original:** `{ params: Promise<{ id: string }> }` → `{ params: Promise<{ invitationId: string }> }` and `const { id } = await params` → `const { invitationId: id } = await params`. All logic is identical.

---

### Step 2 — Delete the old conflicting directory

```bash
rm -rf app/api/workspace/invitations/\[id\]
```

This removes the entire `[id]` directory (which only contains `resend/route.ts`). After Step 1 creates the replacement, this directory is no longer needed.

---

### Step 3 — Verify the directory structure

After the rename, the directory should look exactly like this:

```
app/api/workspace/invitations/
├── [invitationId]/
│   ├── route.ts          ← DELETE handler (unchanged)
│   └── resend/
│       └── route.ts      ← POST handler (updated param name)
```

There must be **no** `[id]` directory remaining.

---

### Step 4 — Build and commit

```bash
npm run build
```

Must complete with **zero errors**. Then:

```bash
git add app/api/workspace/invitations/
git commit -m "fix: rename [id] to [invitationId] in workspace invitations route to resolve Next.js dynamic slug conflict"
git push origin HEAD:main
```

---

## Testing

After Vercel deployment is green:

1. **Primary test — domain connect**
   - Go to Admin → Domains → PASII tab on the new deployment URL
   - Click **Connect domain**
   - Response must arrive in **under 5 seconds** (no timeout)
   - Confirm: `SELECT * FROM website_domains` — a row must exist

2. **Smoke test — workspace invitation resend**
   - From any workspace, trigger a resend invitation action
   - Must return 200 (or 404/409 as appropriate) — not 504

3. **Build must be green on Vercel** — no Unhandled Rejection in function logs

---

## What Does NOT Change

- `[invitationId]/route.ts` (DELETE handler) — untouched
- All other API routes — untouched
- All domain route logic (MB-101 through MB-104) — untouched
- Database schema — no changes
- Environment variables — no changes

---

## Definition of Done

- Vercel deployment green, zero Unhandled Rejections in logs
- Domain connect completes in under 5 seconds
- DB row confirmed in `website_domains` via `execute_sql`
