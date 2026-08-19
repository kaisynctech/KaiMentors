# EP-090 — Permanent Workspace Invite Link

## What this builds

One permanent, reusable link per workspace:
`kaimentors.vercel.app/join/workspace/{token}`

Anyone with the link opens a self-service form, enters their own name, email,
and password, verifies via OTP, and is immediately added to the workspace as a
mentor. No email-specific invitation row required. The token lives on the
`traders` row and only changes when the owner explicitly resets it.

---

## Security constraints (apply to every step below)

- Never handle passwords, OTPs, access tokens, or service-role keys.
- `getSession()` (local JWT decode) only — never `getUser()` — in route handlers.
- `AbortSignal.timeout(10000)` on every PostgREST query; `AbortSignal.timeout(20000)` on every client-side `fetch`.
- Hard-coded tenant/user/course IDs are forbidden; all IDs flow from auth session or validated request body.
- Only KaiTrades may be used as acceptance-test tenant.

---

## Part 1 — Migration

**File:** `supabase/migrations/20260703140000_add_workspace_invite_token.sql`

```sql
-- EP-090: Permanent workspace invite token
-- Adds one UUID per workspace. Existing rows each get a unique random token.
-- UNIQUE constraint prevents collisions; NOT NULL prevents null tokens.

ALTER TABLE public.traders
  ADD COLUMN IF NOT EXISTS invite_token UUID
    DEFAULT gen_random_uuid()
    UNIQUE
    NOT NULL;
```

Apply this migration before deploying any of the code changes below.

**What this does to existing rows:** PostgreSQL evaluates `DEFAULT gen_random_uuid()`
once per existing row during `ALTER TABLE ADD COLUMN`, so every existing workspace
gets its own unique token immediately. No backfill script needed.

---

## Part 2 — New page `app/join/workspace/[token]/page.tsx`

Create this file. Pattern mirrors `app/join/[token]/page.tsx`.

```tsx
import { notFound }               from "next/navigation";
import { createAdminClient }      from "@/lib/supabase/admin";
import { JoinWorkspaceForm }      from "@/components/join-workspace-form";

export const dynamic = "force-dynamic";

export default async function JoinWorkspacePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const admin = createAdminClient();
  if (!admin) notFound();

  // Look up workspace by invite_token.
  // notFound() if the token doesn't match any workspace — prevents enumeration.
  const { data: trader } = await admin
    .from("traders")
    .select("id")
    .eq("invite_token", token)
    .maybeSingle();

  if (!trader) notFound();

  const { data: portalRow } = await admin
    .from("portals")
    .select("portal_name")
    .eq("trader_id", trader.id)
    .maybeSingle();

  const workspaceName = portalRow?.portal_name ?? "the workspace";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f3f4f6",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <JoinWorkspaceForm
        workspaceToken={token}
        workspaceName={workspaceName}
      />
    </div>
  );
}
```

---

## Part 3 — New component `components/join-workspace-form.tsx`

Create this file. Reuses `./join-form.module.css` (no new CSS).

Differences from `components/join-form.tsx`:
- `email` is state the user fills in (not a pre-filled locked prop)
- No `invitationId` or `inviterName` props
- Has `workspaceToken` prop
- POSTs to `/api/join/workspace/complete` with `{ workspaceToken, firstName, lastName }`

```tsx
"use client";

import { useState }              from "react";
import { createBrowserClient }   from "@supabase/ssr";
import { CheckCircle2, Loader2 } from "lucide-react";
import styles                    from "./join-form.module.css";

interface JoinWorkspaceFormProps {
  workspaceToken: string;
  workspaceName: string;
}

type Step = "profile" | "otp" | "completing" | "done";

export function JoinWorkspaceForm({
  workspaceToken,
  workspaceName,
}: JoinWorkspaceFormProps) {
  const [step, setStep]           = useState<Step>("profile");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [otp, setOtp]             = useState("");
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim().toLowerCase();

    if (!firstName.trim() || !lastName.trim()) {
      setError("Please enter your first and last name.");
      return;
    }
    if (!trimmedEmail || !/\S+@\S+\.\S+/.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: { shouldCreateUser: true },
    });
    setBusy(false);

    if (otpError) {
      setError("Could not send verification code. Please try again.");
      return;
    }
    setStep("otp");
  }

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (otp.trim().length < 6) {
      setError("Please enter the 6-digit code.");
      return;
    }

    setBusy(true);

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: otp.trim(),
      type: "email",
    });
    if (verifyError) {
      setBusy(false);
      setError("Incorrect or expired code. Please check your email and try again.");
      return;
    }

    // Set password now that the user is authenticated.
    // Non-blocking: a failure here doesn't block workspace join.
    const { error: pwError } = await supabase.auth.updateUser({ password });
    if (pwError) {
      console.warn("Could not set password:", pwError.message);
    }

    setStep("completing");

    let res: Response;
    try {
      res = await fetch("/api/join/workspace/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceToken,
          firstName: firstName.trim(),
          lastName:  lastName.trim(),
        }),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      setBusy(false);
      setStep("otp");
      setError("Connection timed out. Please try again.");
      return;
    }

    if (!res.ok) {
      const json = await res.json().catch(() => ({})) as { error?: string };
      setBusy(false);
      setStep("otp");
      setError(json.error ?? "Something went wrong. Please try again.");
      return;
    }

    setStep("done");
    setTimeout(() => {
      window.location.href = "/dashboard";
    }, 1200);
  }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <p className={styles.eyebrow}>Workspace invitation</p>
        <h1 className={styles.title}>Join {workspaceName}</h1>
        <p className={styles.sub}>
          Fill in your details to join the{" "}
          <strong>{workspaceName}</strong> mentor workspace.
        </p>
      </div>

      {step === "profile" && (
        <form
          className={styles.form}
          onSubmit={(e) => void handleProfileSubmit(e)}
        >
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
              className={styles.input}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              type="email"
              value={email}
            />
          </label>

          <label className={styles.label}>
            Password
            <input
              className={styles.input}
              minLength={8}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              type="password"
              value={password}
            />
          </label>

          <label className={styles.label}>
            Confirm password
            <input
              className={styles.input}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat password"
              required
              type="password"
              value={confirm}
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
        <form
          className={styles.form}
          onSubmit={(e) => void handleOtpSubmit(e)}
        >
          <p className={styles.otpHint}>
            We sent a 6-digit code to{" "}
            <strong>{email.trim().toLowerCase()}</strong>. Enter it below to
            verify your account.
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
            onClick={() => {
              setStep("profile");
              setOtp("");
              setError(null);
            }}
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

---

## Part 4 — New route `app/api/join/workspace/complete/route.ts`

Create this file. Pattern mirrors `app/api/join/complete/route.ts` but validates
by workspace `invite_token` instead of an invitation row.

```typescript
import { NextResponse }       from "next/server";
import { z }                  from "zod";
import { createClient }       from "@/lib/supabase/server";
import { createAdminClient }  from "@/lib/supabase/admin";

const schema = z.object({
  workspaceToken: z.string().uuid(),
  firstName:      z.string().trim().min(1).max(80),
  lastName:       z.string().trim().min(1).max(80),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // getSession() decodes the JWT from cookies locally — no network call.
  // The user just completed verifyOtp on the client, so their session is fresh.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const user = session.user;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { workspaceToken, firstName, lastName } = parsed.data;
  const fullName = `${firstName} ${lastName}`;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server error." }, { status: 503 });
  }

  const sig = AbortSignal.timeout(10000);

  // Validate workspace token
  const { data: trader } = await admin
    .from("traders")
    .select("id")
    .eq("invite_token", workspaceToken)
    .abortSignal(sig)
    .maybeSingle();

  if (!trader) {
    return NextResponse.json({ error: "Invalid invite link." }, { status: 404 });
  }

  // Idempotent: if the user is already a member, just let them through
  const { data: existing } = await admin
    .from("trader_members")
    .select("id")
    .eq("trader_id", trader.id)
    .eq("user_id", user.id)
    .abortSignal(sig)
    .maybeSingle();

  if (!existing) {
    // Parallel write: profile upsert + workspace membership
    await Promise.all([
      admin
        .from("profiles")
        .upsert({ id: user.id, full_name: fullName }, { onConflict: "id" })
        .abortSignal(sig),
      admin
        .from("trader_members")
        .insert({ trader_id: trader.id, user_id: user.id, role: "mentor" })
        .abortSignal(sig),
    ]);
  }

  return NextResponse.json({ ok: true });
}
```

**Note on `trader_members` insert vs upsert:** Using `insert` (not `upsert`) here
because the duplicate check above already guards it. If the user somehow races a
concurrent request, the unique constraint on `(trader_id, user_id)` will reject
the duplicate — the user is already a member, so the `ok: true` response is still
correct behaviour. If the engineer prefers upsert for robustness:
```typescript
admin
  .from("trader_members")
  .upsert(
    { trader_id: trader.id, user_id: user.id, role: "mentor" },
    { onConflict: "trader_id,user_id", ignoreDuplicates: true },
  )
  .abortSignal(sig),
```

---

## Part 5 — New route `app/api/workspace/invite-token/route.ts`

Create this file. Used by the "Reset link" button in Settings → Team.
Owner-only. Generates a new UUID for the workspace, invalidating the old link.

```typescript
import { NextResponse }       from "next/server";
import { z }                  from "zod";
import { createClient }       from "@/lib/supabase/server";
import { createAdminClient }  from "@/lib/supabase/admin";

const schema = z.object({
  traderId: z.string().uuid(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const user = session.user;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { traderId } = parsed.data;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server error." }, { status: 503 });
  }

  const sig = AbortSignal.timeout(10000);

  // Caller must be owner of this workspace
  const { data: membership } = await admin
    .from("trader_members")
    .select("role")
    .eq("trader_id", traderId)
    .eq("user_id", user.id)
    .abortSignal(sig)
    .maybeSingle();

  if (membership?.role !== "owner") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  // crypto.randomUUID() is available in Node.js 15+ and Vercel Edge Runtime
  const newToken = crypto.randomUUID();

  const { data: updated } = await admin
    .from("traders")
    .update({ invite_token: newToken })
    .eq("id", traderId)
    .abortSignal(sig)
    .select("invite_token")
    .single();

  if (!updated?.invite_token) {
    return NextResponse.json({ error: "Could not reset link." }, { status: 500 });
  }

  return NextResponse.json({ inviteToken: updated.invite_token as string });
}
```

---

## Part 6 — Update `app/dashboard/settings/page.tsx`

In the team tab block (around line 56), extend the `Promise.all` to also fetch
the workspace `invite_token`:

**Replace:**
```typescript
const [{ data: members }, { data: invitations }] = await Promise.all([
  supabase
    .from("trader_members")
    .select("user_id, role, created_at")
    .eq("trader_id", traderId)
    .order("created_at"),
  supabase
    .from("workspace_invitations")
    .select("id, email, created_at")
    .eq("trader_id", traderId)
    .is("accepted_at", null)
    .order("created_at"),
]);
```

**With:**
```typescript
const [{ data: members }, { data: invitations }, { data: traderRow }] =
  await Promise.all([
    supabase
      .from("trader_members")
      .select("user_id, role, created_at")
      .eq("trader_id", traderId)
      .order("created_at"),
    supabase
      .from("workspace_invitations")
      .select("id, email, created_at")
      .eq("trader_id", traderId)
      .is("accepted_at", null)
      .order("created_at"),
    supabase
      .from("traders")
      .select("invite_token")
      .eq("id", traderId)
      .maybeSingle(),
  ]);
```

Then update the `<TeamManager>` call to pass the token:

**Replace:**
```tsx
<TeamManager
  callerRole={membership?.role ?? "mentor"}
  callerUserId={user.id}
  invitations={invitations ?? []}
  members={members ?? []}
  profiles={profiles ?? []}
  traderId={traderId}
/>
```

**With:**
```tsx
<TeamManager
  callerRole={membership?.role ?? "mentor"}
  callerUserId={user.id}
  invitations={invitations ?? []}
  inviteToken={(traderRow as { invite_token?: string | null } | null)?.invite_token ?? null}
  members={members ?? []}
  profiles={profiles ?? []}
  traderId={traderId}
/>
```

**If `traderRow` returns null due to RLS:** The `traders` table RLS policy may not
allow the user client to read that column. If the prop arrives as `null` even
after the migration is applied, switch that single query to the `admin` client:

```typescript
import { createAdminClient } from "@/lib/supabase/admin";
// …
const admin = createAdminClient();
// …in the Promise.all:
admin
  .from("traders")
  .select("invite_token")
  .eq("id", traderId)
  .maybeSingle(),
```

---

## Part 7 — Update `components/team-manager.tsx`

### 7a. Extend the Props interface

**Replace:**
```typescript
interface Props {
  members: Member[];
  profiles: Profile[];
  invitations: PendingInvitation[];
  callerUserId: string;
  callerRole: "owner" | "mentor";
  traderId: string;
}
```

**With:**
```typescript
interface Props {
  members: Member[];
  profiles: Profile[];
  invitations: PendingInvitation[];
  callerUserId: string;
  callerRole: "owner" | "mentor";
  traderId: string;
  inviteToken?: string | null;
}
```

### 7b. Destructure the new prop

**Replace:**
```typescript
export function TeamManager({
  members,
  profiles,
  invitations,
  callerUserId,
  callerRole,
  traderId,
}: Props) {
```

**With:**
```typescript
export function TeamManager({
  members,
  profiles,
  invitations,
  callerUserId,
  callerRole,
  traderId,
  inviteToken,
}: Props) {
```

### 7c. Add state for the workspace link

Add these four lines immediately after the existing `const [newInviteCopied, ...]`
state declaration:

```typescript
const [currentInviteToken, setCurrentInviteToken] = useState(inviteToken ?? null);
const [workspaceLinkCopied, setWorkspaceLinkCopied] = useState(false);
const [resettingToken, setResettingToken]           = useState(false);
const [resetTokenError, setResetTokenError]         = useState<string | null>(null);
```

Add one derived value immediately after those state lines:

```typescript
const workspaceJoinLink = currentInviteToken
  ? `${SITE_URL}/join/workspace/${currentInviteToken}`
  : null;
```

### 7d. Add the "Workspace invite link" section

Add this section immediately after the closing `{isOwner ? (…) : null}` block
for the "Invite a mentor" section (before the final `</div>`):

```tsx
{/* Workspace invite link (owner only) */}
{isOwner && workspaceJoinLink ? (
  <section className={styles.section}>
    <p className={styles.sectionTitle}>Workspace invite link</p>
    <div style={{ padding: "14px 20px 16px" }}>
      <p style={{
        fontSize: "0.82rem",
        color: "#6b7280",
        margin: "0 0 10px",
        lineHeight: "1.5",
      }}>
        Share this link with anyone you want to add as a mentor. They set up
        their own account — no email invitation needed.
      </p>
      <div className={styles.linkBox} style={{ margin: "0 0 10px" }}>
        <span className={styles.linkText}>{workspaceJoinLink}</span>
        <button
          className={styles.copyBtn}
          onClick={async () => {
            await navigator.clipboard.writeText(workspaceJoinLink);
            setWorkspaceLinkCopied(true);
            setTimeout(() => setWorkspaceLinkCopied(false), 2000);
          }}
          type="button"
        >
          {workspaceLinkCopied ? "Copied!" : "Copy link"}
        </button>
      </div>
      {resetTokenError ? (
        <p className={styles.errorMsg} style={{ margin: "0 0 6px" }}>
          {resetTokenError}
        </p>
      ) : null}
      <button
        className={styles.resendBtn}
        disabled={resettingToken}
        onClick={async () => {
          setResettingToken(true);
          setResetTokenError(null);
          try {
            const res = await fetch("/api/workspace/invite-token", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ traderId }),
              signal: AbortSignal.timeout(12000),
            });
            const body = (await res.json()) as {
              inviteToken?: string;
              error?: string;
            };
            if (!res.ok) {
              setResetTokenError(body.error ?? "Could not reset link.");
              return;
            }
            if (body.inviteToken) {
              setCurrentInviteToken(body.inviteToken);
            }
          } catch {
            setResetTokenError("Request timed out. Please try again.");
          } finally {
            setResettingToken(false);
          }
        }}
        style={{ fontSize: "0.75rem" }}
        type="button"
      >
        {resettingToken ? "Resetting…" : "Reset link"}
      </button>
    </div>
  </section>
) : null}
```

The "Reset link" button calls `POST /api/workspace/invite-token` (Part 5),
receives the new token, and updates the displayed link in state without a full
page reload. The old link immediately stops working once the `traders` row is
updated.

---

## Deployment order

1. Apply the migration (`20260703140000_add_workspace_invite_token.sql`) first.
2. Deploy all code changes together in a single commit.
3. After deploy, open Settings → Team and verify the "Workspace invite link"
   section appears with a valid link.

---

## Verification (acceptance test using KaiTrades only)

1. Open Settings → Team → confirm "Workspace invite link" section is visible.
2. Click "Copy link" → paste into browser. Confirm the form loads with
   workspace name visible, all fields editable (name, email, password).
3. Fill the form with a test email. Click Continue → OTP arrives at that email.
4. Enter OTP → "Setting up your account…" → "Account set up! Taking you to
   the dashboard…" → redirects to `/dashboard`.
5. Log into KaiTrades Settings → Team → confirm the test user now appears in
   the member list with role "Mentor".
6. Click "Reset link" → confirm the URL changes → confirm the old URL returns
   404 / notFound().
7. **Clean up:** Remove the test user from KaiTrades team via Settings → Team.

Do not use Traders Confidence or Milkers FX as acceptance-test fixtures.
