"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import styles from "./auth-form.module.css";

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
  const [loading, setLoading] = useState(false);

  async function signIn(formData: FormData) {
    setLoading(true);
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
        if (profile?.role === "super_admin") {
          await supabase.auth.signOut();
          throw new Error("Platform admin accounts cannot use academy login.");
        }

        // Mentor of this academy (trader_members row) takes priority.
        const { data: membership } = await supabase
          .from("trader_members")
          .select("id")
          .eq("user_id", data.user.id)
          .eq("trader_id", academyContext.traderId)
          .maybeSingle();
        if (membership) {
          // Stamp the portal's workspace as active before navigating
          const secure =
            window.location.protocol === "https:" ? "; Secure" : "";
          document.cookie = `km_workspace=${academyContext.traderId}; path=/; max-age=2592000; SameSite=Lax${secure}`;
          window.location.href = academyContext.mentorDestination;
          return;
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
          throw new Error("This student account is not registered for this academy.");
        }
      }

      const destination =
        profile?.role === "super_admin"
          ? "/admin"
          : profile?.role === "student"
            ? studentDestination
            : mentorDestination;
      window.location.href = destination;
    } catch (signInError) {
      const message =
        signInError instanceof Error ? signInError.message : "Sign in failed.";
      setError(
        message.toLowerCase().includes("invalid login credentials")
          ? "Incorrect email address or password."
          : message,
      );
    } finally {
      setLoading(false);
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
      <button disabled={loading} type="submit">
        {loading && <Loader2 className={styles.spin} size={18} />}
        {submitLabel}
      </button>
    </form>
  );
}
