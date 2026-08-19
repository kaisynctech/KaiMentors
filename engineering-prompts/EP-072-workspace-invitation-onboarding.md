# EP-072 — Workspace Invitation: Context Email + Name/OTP Onboarding

**Date:** 2026-07-02
**Status:** Ready for implementation

---

## Objective

The current workspace invitation emails show a generic "KaiMentors Workspace Activation" code with no workspace context and no onboarding form. New invitees have no way to set their name or know which workspace they're joining.

**New flow:**

1. Mentor owner sends invite → **Resend email** sent with workspace name, inviter name, and a direct `/join/{token}` link
2. Invitee clicks link → `/join/[token]` page shows workspace context + form for **First Name** and **Last Name** (email pre-filled and locked)
3. Submit form → **OTP sent** to their email via Supabase
4. Enter OTP → verified → profile created with name → added to `trader_members` → redirect to `/dashboard`

**Prerequisite:** `RESEND_API_KEY` must be set in Vercel environment variables (Resend is already installed). `RESEND_FROM_EMAIL` defaults to `noreply@kaimentors.com`.

---

## Scope

| File | Change |
|---|---|
| `lib/email.ts` | Add `sendWorkspaceInvitation()` and `sendWorkspaceAdded()` |
| `app/api/workspace/mentors/route.ts` | Replace `inviteUserByEmail` with Resend; send "added" email for existing users |
| `app/join/[token]/page.tsx` | New — server validates token; renders `JoinForm` |
| `components/join-form.tsx` | New — two-step client component: name form → OTP entry |
| `components/join-form.module.css` | New |
| `app/api/join/complete/route.ts` | New — updates profile + accepts invitation + upserts trader_members |
| `app/invite/accept/page.tsx` | Replace with redirect to `/dashboard` (dead code after this EP) |

No migration. No new DB columns. Uses existing `workspace_invitations.id` (UUID) as the join token.

---

## 1 — Email functions

**File:** `lib/email.ts`

Add two new exported functions after the existing ones:

```typescript
// ── Workspace invitation (new user) ──────────────────────────────────────────

export async function sendWorkspaceInvitation({
  to,
  workspaceName,
  inviterName,
  joinUrl,
}: {
  to: string;
  workspaceName: string;
  inviterName: string;
  joinUrl: string;
}) {
  if (!resend) return;
  await resend.emails.send({
    from: FROM,
    to,
    subject: `You've been invited to join ${workspaceName}`,
    html: `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#f3f4f6;margin:0;padding:40px 0;">
  <div style="background:#fff;max-width:480px;margin:0 auto;border-radius:16px;padding:40px;border:1px solid #e5e7eb;">
    <p style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#6b7280;margin:0 0 12px;">
      Workspace invitation
    </p>
    <h1 style="font-size:22px;font-weight:800;color:#111314;margin:0 0 16px;letter-spacing:-0.03em;">
      You've been invited to join ${workspaceName}
    </h1>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 28px;">
      ${inviterName} has invited you to join the <strong>${workspaceName}</strong> mentor workspace on KaiMentors.
      Click below to set up your account.
    </p>
    <a href="${joinUrl}"
       style="display:inline-block;background:#111314;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:15px;font-weight:700;">
      Set up your account →
    </a>
    <p style="font-size:12px;color:#9ca3af;margin:28px 0 0;">
      This invitation expires in 7 days. If you did not expect this email, you can ignore it safely.
    </p>
  </div>
</body>
</html>`,
  });
}

// ── Workspace added notification (existing user already has account) ──────────

export async function sendWorkspaceAdded({
  to,
  workspaceName,
  inviterName,
  dashboardUrl,
}: {
  to: string;
  workspaceName: string;
  inviterName: string;
  dashboardUrl: string;
}) {
  if (!resend) return;
  await resend.emails.send({
    from: FROM,
    to,
    subject: `You've been added to ${workspaceName}`,
    html: `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#f3f4f6;margin:0;padding:40px 0;">
  <div style="background:#fff;max-width:480px;margin:0 auto;border-radius:16px;padding:40px;border:1px solid #e5e7eb;">
    <p style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#6b7280;margin:0 0 12px;">
      Workspace access
    </p>
    <h1 style="font-size:22px;font-weight:800;color:#111314;margin:0 0 16px;letter-spacing:-0.03em;">
      You've been added to ${workspaceName}
    </h1>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 28px;">
      ${inviterName} has added you to the <strong>${workspaceName}</strong> mentor workspace. 
      Log in to access it.
    </p>
    <a href="${dashboardUrl}"
       style="display:inline-block;background:#111314;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:15px;font-weight:700;">
      Go to dashboard →
    </a>
  </div>
</body>
</html>`,
  });
}
```

The `resend` and `FROM` constants are already declared at the top of `lib/email.ts`. Add these functions after the existing four.

---

## 2 — Mentor invite API: replace inviteUserByEmail with Resend

**File:** `app/api/workspace/mentors/route.ts`

### 2a — Add imports

```typescript
import { sendWorkspaceInvitation, sendWorkspaceAdded } from "@/lib/email";
```

### 2b — Fetch workspace name + inviter name before the branching logic

Add this block after `const email = parsed.data.email;` and before the `existingUserId` check:

```typescript
// Fetch workspace name and inviter display name for emails
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
```

### 2c — Add "added" email for existing users

In the `if (existingUserId)` branch, after the successful insert into `trader_members`, add:

```typescript
// Fire-and-forget — don't block the response on email delivery
sendWorkspaceAdded({
  to: email,
  workspaceName,
  inviterName,
  dashboardUrl: `${siteUrl}/dashboard`,
}).catch(() => {});

return NextResponse.json({ added: true, invited: false });
```

### 2d — Replace `inviteUserByEmail` with Resend

Replace the block starting at `const siteUrl = ...` through `return NextResponse.json({ added: false, invited: true }, { status: 201 });` with:

```typescript
const { data: invitation, error: invErr } = await admin
  .from("workspace_invitations")
  .insert({ trader_id: ctx.tid, email, invited_by: ctx.user.id })
  .select("id")
  .single();

if (invErr || !invitation) {
  return NextResponse.json({ error: "Could not create invitation." }, { status: 500 });
}

const joinUrl = `${siteUrl}/join/${invitation.id}`;

try {
  await sendWorkspaceInvitation({ to: email, workspaceName, inviterName, joinUrl });
} catch {
  // Roll back the invitation record if email fails
  await admin.from("workspace_invitations").delete().eq("id", invitation.id);
  return NextResponse.json({ error: "Could not send invitation email." }, { status: 500 });
}

return NextResponse.json({ added: false, invited: true }, { status: 201 });
```

Note: the `admin` and `invitation` variables above replace the old `admin` and `invitation` declarations that were already there — adjust to avoid re-declaration. Specifically, remove the old `const siteUrl = ...` and `const redirectTo = ...` lines and the old `inviteUserByEmail` call. The `admin` client is already declared earlier in the function.

---

## 3 — Join page (server component)

**File:** `app/join/[token]/page.tsx` — create new file

```typescript
import { notFound }    from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { JoinForm }    from "@/components/join-form";

export const dynamic = "force-dynamic";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createAdminClient();
  if (!admin) notFound();

  const { data: invitation } = await admin
    .from("workspace_invitations")
    .select("id, email, trader_id, accepted_at, created_at, invited_by")
    .eq("id", token)
    .maybeSingle();

  // Not found, already accepted, or expired (7 days)
  if (!invitation) notFound();
  if (invitation.accepted_at) {
    return (
      <div style={{ fontFamily: "sans-serif", maxWidth: 480, margin: "80px auto", padding: "0 24px" }}>
        <h1 style={{ fontWeight: 800, fontSize: "1.4rem" }}>Invitation already used</h1>
        <p style={{ color: "#6b7280" }}>
          This invitation has already been accepted. If you have an account, please{" "}
          <a href="/login" style={{ color: "#111314", fontWeight: 700 }}>sign in</a>.
        </p>
      </div>
    );
  }

  const createdAt = new Date(invitation.created_at);
  const expiresAt = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (new Date() > expiresAt) {
    return (
      <div style={{ fontFamily: "sans-serif", maxWidth: 480, margin: "80px auto", padding: "0 24px" }}>
        <h1 style={{ fontWeight: 800, fontSize: "1.4rem" }}>Invitation expired</h1>
        <p style={{ color: "#6b7280" }}>
          This invitation link expired after 7 days. Please ask the workspace owner to send a new one.
        </p>
      </div>
    );
  }

  // Fetch workspace name and inviter name
  const [{ data: portalRow }, { data: inviterProfile }] = await Promise.all([
    admin
      .from("portals")
      .select("portal_name")
      .eq("trader_id", invitation.trader_id)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("full_name")
      .eq("id", invitation.invited_by)
      .maybeSingle(),
  ]);

  const workspaceName = portalRow?.portal_name ?? "your workspace";
  const inviterName   = inviterProfile?.full_name ?? "Your colleague";

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f3f4f6",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
    }}>
      <JoinForm
        email={invitation.email}
        invitationId={invitation.id}
        inviterName={inviterName}
        workspaceName={workspaceName}
      />
    </div>
  );
}
```

---

## 4 — JoinForm client component

**File:** `components/join-form.tsx` — create new file

```typescript
"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { CheckCircle2, Loader2 } from "lucide-react";
import styles from "./join-form.module.css";

interface JoinFormProps {
  email: string;
  invitationId: string;
  workspaceName: string;
  inviterName: string;
}

type Step = "profile" | "otp" | "completing" | "done";

export function JoinForm({
  email,
  invitationId,
  workspaceName,
  inviterName,
}: JoinFormProps) {
  const [step, setStep] = useState<Step>("profile");
  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [otp,       setOtp]       = useState("");
  const [busy,      setBusy]      = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  // ── Step 1: Submit profile form → trigger OTP ────────────────────────────
  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setError("Please enter your first and last name.");
      return;
    }
    setBusy(true);

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Do not auto-create a session from the link — force code entry
        shouldCreateUser: true,
      },
    });

    setBusy(false);
    if (otpError) {
      setError("Could not send verification code. Please try again.");
      return;
    }
    setStep("otp");
  }

  // ── Step 2: Verify OTP → complete onboarding ─────────────────────────────
  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (otp.trim().length < 6) {
      setError("Please enter the 6-digit code.");
      return;
    }
    setBusy(true);

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: otp.trim(),
      type: "email",
    });

    if (verifyError) {
      setBusy(false);
      setError("Incorrect or expired code. Please check your email and try again.");
      return;
    }

    // Session established — complete profile + accept invitation server-side
    setStep("completing");

    const res = await fetch("/api/join/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ invitationId, firstName: firstName.trim(), lastName: lastName.trim() }),
    });

    if (!res.ok) {
      const { error: e } = await res.json().catch(() => ({}));
      setBusy(false);
      setStep("otp");
      setError(e ?? "Something went wrong. Please try again.");
      return;
    }

    setStep("done");
    // Brief pause so the user sees the success state, then navigate
    setTimeout(() => { window.location.href = "/dashboard"; }, 1200);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <p className={styles.eyebrow}>Workspace invitation</p>
        <h1 className={styles.title}>Join {workspaceName}</h1>
        <p className={styles.sub}>
          {inviterName} has invited you to join the{" "}
          <strong>{workspaceName}</strong> mentor workspace.
        </p>
      </div>

      {step === "profile" && (
        <form className={styles.form} onSubmit={handleProfileSubmit}>
          <div className={styles.row}>
            <label className={styles.label}>
              First name
              <input
                autoFocus
                className={styles.input}
                maxLength={80}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                required
                type="text"
                value={firstName}
              />
            </label>
            <label className={styles.label}>
              Last name
              <input
                className={styles.input}
                maxLength={80}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
                required
                type="text"
                value={lastName}
              />
            </label>
          </div>
          <label className={styles.label}>
            Email address
            <input
              className={`${styles.input} ${styles.inputLocked}`}
              disabled
              readOnly
              type="email"
              value={email}
            />
          </label>
          {error ? <p className={styles.error}>{error}</p> : null}
          <button className={styles.submit} disabled={busy} type="submit">
            {busy ? <Loader2 className={styles.spin} size={18} /> : null}
            {busy ? "Sending code…" : "Continue"}
          </button>
        </form>
      )}

      {step === "otp" && (
        <form className={styles.form} onSubmit={handleOtpSubmit}>
          <p className={styles.otpHint}>
            We sent a 6-digit code to <strong>{email}</strong>.
            Enter it below to verify your account.
          </p>
          <label className={styles.label}>
            Verification code
            <input
              autoFocus
              className={`${styles.input} ${styles.otpInput}`}
              inputMode="numeric"
              maxLength={6}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              pattern="\d{6}"
              placeholder="000000"
              type="text"
              value={otp}
            />
          </label>
          {error ? <p className={styles.error}>{error}</p> : null}
          <button className={styles.submit} disabled={busy} type="submit">
            {busy ? <Loader2 className={styles.spin} size={18} /> : null}
            {busy ? "Verifying…" : "Verify and continue"}
          </button>
          <button
            className={styles.back}
            onClick={() => { setStep("profile"); setOtp(""); setError(null); }}
            type="button"
          >
            ← Back
          </button>
        </form>
      )}

      {(step === "completing" || step === "done") && (
        <div className={styles.success}>
          {step === "done" ? (
            <CheckCircle2 className={styles.checkIcon} size={40} />
          ) : (
            <Loader2 className={`${styles.spin} ${styles.checkIcon}`} size={40} />
          )}
          <p>
            {step === "done"
              ? "Account set up! Taking you to the dashboard…"
              : "Setting up your account…"}
          </p>
        </div>
      )}
    </div>
  );
}
```

**File:** `components/join-form.module.css` — create new file

```css
.card {
  background: #fff;
  border-radius: 20px;
  padding: 40px;
  max-width: 480px;
  width: 100%;
  border: 1px solid #e5e7eb;
  box-shadow: 0 4px 24px rgba(0,0,0,0.06);
}

/* ── Header ─────────────────────────────────────────────── */
.header { margin-bottom: 2rem; }

.eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: #6b7280;
  margin: 0 0 10px;
}

.title {
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: -0.04em;
  color: #111314;
  margin: 0 0 8px;
}

.sub {
  font-size: 0.9rem;
  color: #6b7280;
  line-height: 1.6;
  margin: 0;
}

/* ── Form ───────────────────────────────────────────────── */
.form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

@media (max-width: 400px) {
  .row { grid-template-columns: 1fr; }
}

.label {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: #374151;
}

.input {
  padding: 0.65rem 0.9rem;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  font-size: 0.95rem;
  font-family: inherit;
  color: #111314;
  transition: border-color 0.15s;
  background: #fff;
}

.input:focus {
  outline: none;
  border-color: #111314;
}

.inputLocked {
  background: #f9fafb;
  color: #9ca3af;
  cursor: not-allowed;
}

/* ── OTP ────────────────────────────────────────────────── */
.otpHint {
  font-size: 0.9rem;
  color: #374151;
  line-height: 1.6;
  margin: 0;
}

.otpInput {
  font-size: 1.6rem;
  font-weight: 800;
  letter-spacing: 0.4em;
  text-align: center;
  font-family: monospace;
}

/* ── Submit ─────────────────────────────────────────────── */
.submit {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.7rem 1.5rem;
  background: #111314;
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s;
}

.submit:disabled { opacity: 0.65; cursor: default; }
.submit:hover:not(:disabled) { opacity: 0.85; }

.back {
  background: none;
  border: none;
  font-size: 0.85rem;
  color: #6b7280;
  cursor: pointer;
  text-align: left;
  padding: 0;
}

.back:hover { color: #111314; }

.error {
  font-size: 0.83rem;
  color: #c0392b;
  margin: 0;
}

/* ── Success ────────────────────────────────────────────── */
.success {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 2rem 0;
  text-align: center;
  font-size: 0.95rem;
  color: #374151;
}

.checkIcon { color: #111314; }

.spin { animation: spin 0.9s linear infinite; }

@keyframes spin { to { transform: rotate(360deg); } }
```

---

## 5 — Join complete API route

**File:** `app/api/join/complete/route.ts` — create new file

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  invitationId: z.string().uuid(),
  firstName:    z.string().trim().min(1).max(80),
  lastName:     z.string().trim().min(1).max(80),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { invitationId, firstName, lastName } = parsed.data;
  const fullName = `${firstName} ${lastName}`;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server error." }, { status: 503 });
  }

  // Validate invitation matches this user's email and is not yet accepted
  const { data: invitation } = await admin
    .from("workspace_invitations")
    .select("id, trader_id, email, accepted_at")
    .eq("id", invitationId)
    .maybeSingle();

  if (!invitation) {
    return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
  }
  if (invitation.accepted_at) {
    return NextResponse.json({ error: "Invitation already accepted." }, { status: 409 });
  }
  if (invitation.email.toLowerCase() !== (user.email ?? "").toLowerCase()) {
    return NextResponse.json({ error: "Email mismatch." }, { status: 403 });
  }

  // Run all three writes in parallel
  await Promise.all([
    // 1. Create or update the user's profile with their name
    admin.from("profiles").upsert(
      { id: user.id, full_name: fullName },
      { onConflict: "id" },
    ),
    // 2. Add to trader_members as mentor (idempotent)
    admin.from("trader_members").upsert(
      { trader_id: invitation.trader_id, user_id: user.id, role: "mentor" },
      { onConflict: "trader_id,user_id", ignoreDuplicates: true },
    ),
    // 3. Mark invitation accepted
    admin
      .from("workspace_invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invitationId),
  ]);

  return NextResponse.json({ ok: true });
}
```

---

## 6 — Retire the old invite/accept page

**File:** `app/invite/accept/page.tsx` — replace entire file

```typescript
import { redirect } from "next/navigation";

export default function InviteAcceptRedirect() {
  redirect("/dashboard");
}
```

Old invitation links will land existing users on the dashboard. New users go through `/join/[token]`.

---

## 7 — Commit and deploy

No migration needed.

```bash
git add -A
git commit -m "feat: EP-072 workspace invitation with Resend email, /join/[token] onboarding, OTP verification"
git push origin main && vercel --prod
```

Ensure `RESEND_API_KEY` is set in Vercel project settings before deploying.

---

## 8 — Acceptance Criteria

Test from the KaiTrades workspace (owner role).

**Invite email:**
- [ ] Owner sends invite to a new email address from Settings → Team
- [ ] Resend email arrives with subject "You've been invited to join KaiTrades"
- [ ] Email body shows inviter name and workspace name
- [ ] Email contains a working "Set up your account →" link pointing to `/join/{uuid}`

**Join page:**
- [ ] `/join/{uuid}` shows "Join KaiTrades" heading and inviter name
- [ ] Email field is pre-filled and disabled (cannot be edited)
- [ ] First name and last name fields are required — form does not submit if empty
- [ ] Submitting the form triggers a Supabase OTP email to the invited address
- [ ] Page transitions to the OTP entry step showing the invited email address
- [ ] "← Back" returns to the profile form with name fields still populated

**OTP verification:**
- [ ] Entering the correct 6-digit code and clicking "Verify and continue" calls `/api/join/complete`
- [ ] Profile shows full name in the mentor dashboard after signing in
- [ ] User appears in the workspace's Team tab
- [ ] Invitation row has `accepted_at` set (verify via admin panel or DB)
- [ ] Browser redirects to `/dashboard` automatically

**Expiry and error states:**
- [ ] Visiting `/join/{uuid}` after 7 days shows "Invitation expired" message
- [ ] Visiting `/join/{uuid}` after it's been accepted shows "Invitation already used" message
- [ ] Invalid UUID returns 404

**Existing user path (unchanged):**
- [ ] Inviting an email that already has a KaiMentors account directly adds them to `trader_members` with no join page
- [ ] The "added" Resend email is received by the existing user

**Admin path (unchanged):**
- [ ] `/invite/accept?id=...` redirects to `/dashboard`
- [ ] TypeScript compiles clean
