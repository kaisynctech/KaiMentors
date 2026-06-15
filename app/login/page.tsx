import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { LoginForm } from "@/components/login-form";
import styles from "../auth.module.css";

export default function LoginPage() {
  return (
    <main className={styles.page}>
      <section className={styles.aside}>
        <BrandMark />
        <div>
          <p className="eyebrow">Welcome back</p>
          <h1>Run your academy with confidence.</h1>
          <p>
            Manage verified students, private content, broker connections, and
            your branded portal.
          </p>
        </div>
        <small>Secure multi-tenant infrastructure powered by Supabase.</small>
      </section>
      <section className={styles.content}>
        <div className={styles.card}>
          <p className="eyebrow">Account access</p>
          <h2>Sign in to KaiMentors</h2>
          <p>Use the email address and password for your KaiMentors account.</p>
          <LoginForm />
          <div className={styles.footer}>
            New mentor? <Link href="/onboarding">Create a workspace</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
