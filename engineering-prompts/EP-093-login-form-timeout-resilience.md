# EP-093 — Login Form Timeout Resilience

## Problem

Two gaps in `components/login-form.tsx` surface under Supabase infrastructure
degradation (slow PostgREST / auth API):

### Gap 1 — Raw "signal timed out" error shown to users

When the activate fetch (`AbortSignal.timeout(12000)`) fires, the browser
throws `DOMException { name: "AbortError", message: "signal timed out" }`.
The outer `catch` block translates only `"invalid login credentials"` — all
other messages show verbatim. The user sees "signal timed out" in red on the
login page instead of a meaningful message.

### Gap 2 — Two unguarded PostgREST queries before the activate call

Lines 59-73 make two PostgREST queries with no `AbortSignal`:

```typescript
// profiles fetch — no timeout
const { data: profile } = await supabase
  .from("profiles").select("role").eq("id", data.user.id).single();

// trader_members fetch — no timeout
const { data: membership } = await supabase
  .from("trader_members").select("id")
  .eq("user_id", data.user.id).eq("trader_id", academyContext.traderId)
  .maybeSingle();
```

Under Supabase infrastructure load these can hang indefinitely, leaving the
user staring at a frozen spinner with no feedback and no way to recover.

---

## Changes — `components/login-form.tsx` only

No migration, no new files, no other files touched.

### Change 1 — Error message handler (lines 143-152)

**Replace:**

```typescript
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
```

**With:**

```typescript
    } catch (err) {
      console.error("[LoginForm] signIn error:", err);
      const isTimeout =
        (err instanceof DOMException && err.name === "AbortError") ||
        (err instanceof Error &&
          err.message.toLowerCase().includes("signal timed out"));
      const message =
        err instanceof Error ? err.message : "Sign in failed.";
      setError(
        isTimeout
          ? "Connection timed out. Please try again."
          : message.toLowerCase().includes("invalid login credentials")
            ? "Incorrect email address or password."
            : message,
      );
    }
```

### Change 2 — Profiles query (line 59)

**Replace:**

```typescript
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();
```

**With:**

```typescript
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .abortSignal(AbortSignal.timeout(8000))
        .single();
```

### Change 3 — Trader members query (line 68)

**Replace:**

```typescript
        const { data: membership } = await supabase
          .from("trader_members")
          .select("id")
          .eq("user_id", data.user.id)
          .eq("trader_id", academyContext.traderId)
          .maybeSingle();
```

**With:**

```typescript
        const { data: membership } = await supabase
          .from("trader_members")
          .select("id")
          .eq("user_id", data.user.id)
          .eq("trader_id", academyContext.traderId)
          .abortSignal(AbortSignal.timeout(8000))
          .maybeSingle();
```

When either of these aborts, the thrown `AbortError` propagates to the outer
`catch`, which Change 1 now maps to "Connection timed out. Please try again."

---

## What is not fixed by this EP

`supabase.auth.signInWithPassword()` does not accept an `AbortSignal` in
`@supabase/supabase-js` v2. If authentication itself hangs the spinner will
continue indefinitely. This cannot be fixed in client code without replacing
the Supabase auth call — left as a separate decision.

The underlying cause of all timeouts is the Supabase infrastructure incident
(June 30 – July 3, 2026). Once the incident resolves, all calls will return
well within the existing timeouts.

---

## Deployment

Single file: `components/login-form.tsx`. No migration required.

---

## Verification (KaiTrades acceptance tenant only)

1. With browser DevTools → Network → throttle to "Slow 3G", attempt login at
   `kaimentors.vercel.app/portal/kaitrades/login` as `kaisynctech@gmail.com`.
2. After ~8 s the profiles or membership query aborts.
3. Confirm the error shown is **"Connection timed out. Please try again."** —
   not "signal timed out" or any raw browser error message.
4. Restore network speed. Confirm normal login succeeds and lands on the
   KaiTrades dashboard.

Do not use Traders Confidence or Milkers FX as acceptance-test fixtures.
