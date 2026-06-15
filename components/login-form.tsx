"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import styles from "./auth-form.module.css";

export function LoginForm({
  studentDestination = "/student",
  mentorDestination = "/dashboard",
  allowedRole,
}: {
  studentDestination?: string;
  mentorDestination?: string;
  allowedRole?: "student";
} = {}) {
  const router = useRouter();
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
      if (allowedRole && profile?.role !== allowedRole) {
        await supabase.auth.signOut();
        throw new Error(
          "This login is for academy students. Mentor accounts must use the KaiMentors platform login.",
        );
      }

      const destination =
        profile?.role === "super_admin"
          ? "/admin"
          : profile?.role === "student"
            ? studentDestination
            : mentorDestination;
      router.push(destination);
      router.refresh();
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
        Sign in to workspace
      </button>
    </form>
  );
}
