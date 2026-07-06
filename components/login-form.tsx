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
  next,
  allowedRole,
  academyTraderId,
  academyContext,
  submitLabel = "Sign in to workspace",
}: {
  studentDestination?: string;
  mentorDestination?: string;
  next?: string;
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
        .abortSignal(AbortSignal.timeout(8000))
        .single();

      if (academyContext) {
        // Mentor/owner check first — a super_admin who owns this workspace
        // must be routed to the mentor dashboard, not blocked.
        const { data: membership } = await supabase
          .from("trader_members")
          .select("id")
          .eq("user_id", data.user.id)
          .eq("trader_id", academyContext.traderId)
          .abortSignal(AbortSignal.timeout(8000))
          .maybeSingle();

        if (membership) {
          // If mentorDestination is an absolute URL (cross-domain goto route), navigate
          // directly — the goto route handles workspace cookie setting on the platform domain.
          // For same-domain destinations, call activate first to set the cookie here.
          if (academyContext.mentorDestination.startsWith("http")) {
            window.location.href = academyContext.mentorDestination;
            return;
          }
          // Same-domain (platform portal login): call activate to set km_workspace cookie.
          const activateRes = await fetch("/api/workspace/activate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ traderId: academyContext.traderId }),
            signal: AbortSignal.timeout(12000),
          });
          if (!activateRes.ok) {
            throw new Error(
              "Could not open this workspace. Please try again.",
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

      // If an explicit next was provided (e.g. from a goto chain), follow it.
      // Otherwise fall back to role defaults.
      const destination =
        next ??
        (profile?.role === "super_admin"
          ? "/admin"
          : profile?.role === "student"
            ? studentDestination
            : mentorDestination);
      window.location.href = destination;
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
