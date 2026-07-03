# EP-077 — Fix LoginForm Silent Submit on Academy Portal Pages

## Root Cause

`LoginForm` uses `<form action={asyncFn}>`, which is React 19's form action API.
React 19 wraps every form action in `startTransition`. **State updates inside a
transition are deferred — they do not flush until after the transition
completes.** This has two consequences:

1. `setLoading(true)` at the top of `signIn` never produces a visible spinner
   during the operation. The button appears unresponsive (no feedback).
2. `disabled={loading}` never activates during the action, so rapid multi-clicks
   trigger multiple concurrent `signIn` calls.

For a **successful** login the sequence is:
- User clicks Sign In → no spinner → sign-in runs silently → redirect happens
  after several seconds of silence → looks like "nothing happened."

For a **failed** login:
- `setError` is also deferred, so the error message may appear late or the form
  reset (React 19 resets form fields after every action) clears the fields
  before the user reads the error.

**The fix is `useFormStatus`**, which is specifically designed to track a form
action's pending state and updates the button UI immediately during the
transition — no deferred flush required.

---

## Secondary issues fixed in the same pass

- `fetch("/api/workspace/activate", ...)` response is not checked; a 401 or 403
  from the server is silently ignored and the redirect still fires.
- No `console.error` inside the catch block makes browser debugging impossible.

---

## File changes

### `components/login-form.tsx`

Full replacement:

```typescript
"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import styles from "./auth-form.module.css";

// ── Submit button ────────────────────────────────────────────────────────────
// Must be a separate component so useFormStatus can read the parent form's
// pending state. This updates immediately when the form action starts,
// unlike setLoading() which is deferred inside a transition.
function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} type="submit">
      {pending && <Loader2 className={styles.spin} size={18} />}
      {label}
    </button>
  );
}

// ── Login form ───────────────────────────────────────────────────────────────
export function LoginForm({
  studentDestination = "/student",
  mentorDestination = "/dashboard",
  allowedRole,
  academyTraderId,
  academyContext,
  submitLabel = "Sign in to workspace",
}: {
  studentDestination?: string;
  mentorDestination?: string;
  allowedRole?: "student";
  academyTraderId?: string;
  academyContext?: {
    traderId: string;
    studentDestination: string;
    mentorDestination: string;
  };
  submitLabel?: string;
} = {}) {
  const [error, setError] = useState("");

  async function signIn(formData: FormData) {
    setError("");

    try {
      const supabase = createClient();
      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: String(formData.get("email")).trim(),
          password: String(formData.get("password")),
        });
      if (signInError || !data.user) {
        throw signInError ?? new Error("Sign in failed.");
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();

      if (academyContext) {
        // Mentor/owner check first — a super_admin who owns this workspace
        // must be routed to the mentor dashboard, not blocked.
        const { data: membership } = await supabase
          .from("trader_members")
          .select("id")
          .eq("user_id", data.user.id)
          .eq("trader_id", academyContext.traderId)
          .maybeSingle();

        if (membership) {
          const activateRes = await fetch("/api/workspace/activate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ traderId: academyContext.traderId }),
          });
          if (!activateRes.ok) {
            // Log for debugging but do not block the redirect — the
            // workspace cookie is a best-effort enhancement.
            console.error(
              "[LoginForm] /api/workspace/activate returned",
              activateRes.status,
            );
          }
          window.location.href = academyContext.mentorDestination;
          return;
        }

        // No membership — block super_admin from going further.
        if (profile?.role === "super_admin") {
          await supabase.auth.signOut();
          throw new Error("Platform admin accounts cannot use academy login.");
        }

        // Student at this academy.
        const { data: application } = await supabase
          .from("student_applications")
          .select("id")
          .eq("student_user_id", data.user.id)
          .eq("trader_id", academyContext.traderId)
          .maybeSingle();
        if (application) {
          window.location.href = academyContext.studentDestination;
          return;
        }

        await supabase.auth.signOut();
        throw new Error("No account was found for this academy.");
      }

      if (allowedRole && profile?.role !== allowedRole) {
        await supabase.auth.signOut();
        throw new Error(
          "This login is for academy students. Mentor accounts must use the KaiMentors platform login.",
        );
      }
      if (allowedRole === "student" && academyTraderId) {
        const { data: application } = await supabase
          .from("student_applications")
          .select("id")
          .eq("student_user_id", data.user.id)
          .eq("trader_id", academyTraderId)
          .maybeSingle();
        if (!application) {
          await supabase.auth.signOut();
          throw new Error(
            "This student account is not registered for this academy.",
          );
        }
      }

      const destination =
        profile?.role === "super_admin"
          ? "/admin"
          : profile?.role === "student"
            ? studentDestination
            : mentorDestination;
      window.location.href = destination;
    } catch (err) {
      console.error("[LoginForm] signIn error:", err);
      const message =
        err instanceof Error ? err.message : "Sign in failed.";
      setError(
        message.toLowerCase().includes("invalid login credentials")
          ? "Incorrect email address or password."
          : message,
      );
    }
  }

  return (
    <form action={signIn} className={styles.form}>
      <label>
        Email address
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      {error && <p className={styles.error}>{error}</p>}
      <SubmitButton label={submitLabel} />
    </form>
  );
}
```

**Changes summary:**
- Add `import { useFormStatus } from "react-dom"`
- Remove `loading` state and `setLoading` entirely
- Extract `SubmitButton` as a separate sub-component; it reads `pending` from
  `useFormStatus()` — this updates immediately when the form action starts
- Remove `const [loading, setLoading] = useState(false)` and all `setLoading`
  calls
- Add `activateRes.ok` check with `console.error` on failure
- Add `console.error("[LoginForm] signIn error:", err)` in the catch block
- Keep all auth logic unchanged

---

## What does NOT change

- `components/academy-login-page.tsx` — no changes.
- `app/portal/[slug]/login/page.tsx` — no changes.
- `app/domain-sites/[hostname]/login/page.tsx` — no changes.
- `app/api/workspace/activate/route.ts` — no changes.
- All other files — unchanged.

---

## Why `useFormStatus` and not `onSubmit`

`useFormStatus` is the React 19 / react-dom canonical solution for tracking
form action state. Switching to `onSubmit` would bypass React's progressive
enhancement model and require manually constructing `FormData`. `useFormStatus`
is the correct, minimal-change fix.

The sub-component requirement (`useFormStatus` must be inside the form, not at
the same level as the `<form>` element) is why `SubmitButton` is extracted.

---

## Verification after deploy

1. Navigate to `/portal/traders-confidence/login`.
2. Enter `kaisynctech@gmail.com` and the correct password. Click **Sign In**.
   - **Expected**: button shows spinner immediately (within one frame of the
     click). After 2–4 s, redirect to `/dashboard`.
3. Navigate back to `/portal/traders-confidence/login`. Enter an incorrect
   password. Click **Sign In**.
   - **Expected**: button shows spinner → error "Incorrect email address or
     password." appears → form fields are preserved (React 19 resets them, but
     the error remains).
4. Open browser DevTools → Console. Confirm no `[LoginForm]` errors appear for
   a successful login.
5. Check Network tab during sign-in: confirm `POST /api/workspace/activate`
   returns 200 OK.
