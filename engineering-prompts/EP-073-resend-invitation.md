# EP-073 — Resend Workspace Invitation

## Context
`TeamManager` (`components/team-manager.tsx`) already lists pending invitations with a Cancel button.
The owner needs a **Resend** button per invitation that re-fires the Resend email without deleting and
recreating the invitation row. The join URL stays the same (`/join/{invitation.id}`).

---

## Files to modify

### 1. New file — `app/api/workspace/invitations/[id]/resend/route.ts`

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWorkspaceInvitation } from "@/lib/email";

async function getOwnerContext(supabase: Awaited<ReturnType<typeof createClient>>) {
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
  if (!membership || membership.role !== "owner") return null;
  return { user, tid: membership.trader_id };
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const ctx = await getOwnerContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  // Fetch invitation — must belong to caller's workspace and be unaccepted
  const { data: invitation } = await admin
    .from("workspace_invitations")
    .select("id, email, trader_id, accepted_at")
    .eq("id", id)
    .eq("trader_id", ctx.tid)
    .maybeSingle();

  if (!invitation) {
    return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
  }
  if (invitation.accepted_at) {
    return NextResponse.json({ error: "Invitation already accepted." }, { status: 409 });
  }

  // Fetch workspace name and inviter name for email
  const [{ data: portalRow }, { data: inviterProfile }] = await Promise.all([
    supabase!
      .from("portals")
      .select("portal_name")
      .eq("trader_id", ctx.tid)
      .maybeSingle(),
    supabase!
      .from("profiles")
      .select("full_name")
      .eq("id", ctx.user.id)
      .maybeSingle(),
  ]);

  const workspaceName = portalRow?.portal_name ?? "the workspace";
  const inviterName   = inviterProfile?.full_name ?? "Your colleague";
  const siteUrl       = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const joinUrl       = `${siteUrl}/join/${invitation.id}`;

  try {
    await sendWorkspaceInvitation({
      to: invitation.email,
      workspaceName,
      inviterName,
      joinUrl,
    });
  } catch {
    return NextResponse.json({ error: "Could not send invitation email." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

---

### 2. Modify — `components/team-manager.tsx`

#### a. Add resend state alongside the existing cancel state

```typescript
// After the cancelError state line:
const [resendingId, setResendingId] = useState<string | null>(null);
const [resendSuccess, setResendSuccess] = useState<Record<string, boolean>>({});
const [resendError, setResendError] = useState<Record<string, string>>({});
```

#### b. Add resend function after `cancelInvitation`

```typescript
async function resendInvitation(id: string) {
  setResendingId(id);
  setResendError((prev) => ({ ...prev, [id]: "" }));
  setResendSuccess((prev) => ({ ...prev, [id]: false }));
  try {
    const res = await fetch(`/api/workspace/invitations/${id}/resend`, { method: "POST" });
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setResendError((prev) => ({ ...prev, [id]: body.error ?? "Could not resend." }));
      return;
    }
    setResendSuccess((prev) => ({ ...prev, [id]: true }));
    setTimeout(() => setResendSuccess((prev) => ({ ...prev, [id]: false })), 4000);
  } finally {
    setResendingId(null);
  }
}
```

#### c. Update the pending invitations row JSX

Replace the `memberActions` div inside the invitations `.map()` with:

```tsx
<div className={styles.memberActions}>
  {resendSuccess[inv.id] ? (
    <span className={styles.successMsg}>Resent!</span>
  ) : null}
  {resendError[inv.id] ? (
    <span className={styles.inlineError}>{resendError[inv.id]}</span>
  ) : null}
  {cancelError[inv.id] ? (
    <span className={styles.inlineError}>{cancelError[inv.id]}</span>
  ) : null}
  <button
    className={styles.resendBtn}
    disabled={resendingId === inv.id || cancellingId === inv.id}
    onClick={() => void resendInvitation(inv.id)}
    type="button"
  >
    {resendingId === inv.id ? "Sending…" : "Resend"}
  </button>
  <button
    className={styles.removeBtn}
    disabled={cancellingId === inv.id || resendingId === inv.id}
    onClick={() => void cancelInvitation(inv.id)}
    type="button"
  >
    {cancellingId === inv.id ? "Cancelling…" : "Cancel"}
  </button>
</div>
```

---

### 3. Modify — `components/team-manager.module.css`

Add `.resendBtn` — same base as `.removeBtn` but with a secondary treatment:

```css
.resendBtn {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--foreground);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.resendBtn:hover:not(:disabled) {
  background: var(--muted);
}
.resendBtn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
```

---

## Behaviour summary

| Scenario | Result |
|---|---|
| Owner clicks Resend | Re-fires `sendWorkspaceInvitation` with same `invitation.id` (same join URL) |
| Email succeeds | "Resent!" flash for 4 s, no page reload needed |
| Email fails | Inline error message under the row |
| Invitation already accepted | 409 — button shows error |
| Non-owner tries POST | 401 — not rendered in UI anyway |

## No migration required
No schema changes. The invitation row is reused as-is.
