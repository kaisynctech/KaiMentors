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
