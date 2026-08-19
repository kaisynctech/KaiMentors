# EP-087 — Copyable Invitation Link in Settings → Team

## What changes

The invite flow currently relies on email delivery to get the join link to the
recipient. This adds a dependency on Resend, RESEND_API_KEY, and email
deliverability. The join link already exists — it just isn't shown to the owner.

This EP surfaces the join link in the UI so the owner can copy it and share it
any way they want: WhatsApp, Telegram, in person, etc. Email continues to fire
in the background via `after()` as a bonus, not a requirement.

---

## Changes — `components/team-manager.tsx` only

No backend changes. The GET route already returns `invitations` with `id`,
`email`, and `created_at`. The join URL is `${NEXT_PUBLIC_SITE_URL}/join/${inv.id}`.

### 1. Add site URL constant at the top of the component

```typescript
const SITE_URL =
  typeof window !== "undefined"
    ? window.location.origin
    : "https://kaimentors.vercel.app";
```

### 2. Add copy-link state

```typescript
const [copiedId, setCopiedId] = useState<string | null>(null);

async function copyJoinLink(invitationId: string) {
  const link = `${SITE_URL}/join/${invitationId}`;
  await navigator.clipboard.writeText(link);
  setCopiedId(invitationId);
  setTimeout(() => setCopiedId(null), 2000);
}
```

### 3. Add "Copy link" button to each pending invitation row

In the pending invitations section, add the Copy link button alongside Resend
and Cancel:

```tsx
<button
  className={styles.copyBtn}
  onClick={() => void copyJoinLink(inv.id)}
  type="button"
>
  {copiedId === inv.id ? "Copied!" : "Copy link"}
</button>
```

Place it before the Resend button in the actions div.

### 4. Show the join link after a successful invite

In `sendInvite()`, after `setInviteSuccess(msg)`, also store the new invitation
ID so the owner can copy the link immediately — before navigating away.

The POST route (`/api/workspace/mentors`) currently returns `{ invited: true }`.
Update it to also return the invitation ID.

**In `app/api/workspace/mentors/route.ts`**, change the final return:
```typescript
// Replace:
return NextResponse.json({ invited: true }, { status: 201 });

// With:
return NextResponse.json({ invited: true, invitationId: invitationId }, { status: 201 });
```

**In `team-manager.tsx`**, update `sendInvite()`:
```typescript
const body = (await res.json()) as {
  error?: string;
  invited?: boolean;
  invitationId?: string;
};
if (!res.ok) {
  setInviteError(body.error ?? "Could not send invitation.");
  return;
}
const msg = `Invitation created for ${email.trim()}.`;
setInviteSuccess(msg);
// Store link for immediate copy
if (body.invitationId) {
  setNewInviteLink(`${SITE_URL}/join/${body.invitationId}`);
}
setEmail("");
router.refresh();
setTimeout(() => {
  setInviteSuccess(null);
  setNewInviteLink(null);
}, 10000); // keep link visible for 10 s
```

Add state:
```typescript
const [newInviteLink, setNewInviteLink] = useState<string | null>(null);
const [newInviteCopied, setNewInviteCopied] = useState(false);
```

After `{inviteSuccess ? <p className={styles.successMsg}>{inviteSuccess}</p> : null}`,
add:

```tsx
{newInviteLink ? (
  <div className={styles.linkBox}>
    <span className={styles.linkText}>{newInviteLink}</span>
    <button
      className={styles.copyBtn}
      onClick={async () => {
        await navigator.clipboard.writeText(newInviteLink);
        setNewInviteCopied(true);
        setTimeout(() => setNewInviteCopied(false), 2000);
      }}
      type="button"
    >
      {newInviteCopied ? "Copied!" : "Copy link"}
    </button>
  </div>
) : null}
```

### 5. CSS — `team-manager.module.css`

Add:
```css
.copyBtn {
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  font-size: 0.75rem;
  cursor: pointer;
  white-space: nowrap;
}
.copyBtn:hover {
  background: var(--bg-muted);
}

.linkBox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--bg-muted);
  border-radius: 8px;
  margin-top: 0.5rem;
}
.linkText {
  flex: 1;
  font-size: 0.75rem;
  color: var(--text-secondary);
  word-break: break-all;
}
```

---

## Result

- Owner creates an invite → join link appears immediately with a Copy button
- Owner copies and shares via WhatsApp, Telegram, email, in person — anything
- Pending invitation rows each have a Copy link button — owner can re-copy at any time
- Email continues to fire via `after()` as before — if it arrives, great; if not, no problem

---

## Verification

1. Settings → Team → enter an email → Send invite
   - Expected: success message + join link appears with Copy button
   - Click Copy → paste somewhere → URL is `kaimentors.vercel.app/join/{uuid}`
2. Pending invitations section → each row has Copy link button
   - Click it → Copied! flash → paste confirms the correct URL

