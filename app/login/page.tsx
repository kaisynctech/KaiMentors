import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { LoginForm } from "@/components/login-form";
import { createClient } from "@/lib/supabase/server";
import styles from "../auth.module.css";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Only honour next if it is a safe relative path (prevents open-redirect).
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//") ? next : null;

  const supabase = await createClient();
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();
      // If a safe next param is present, always follow it (e.g. goto chain from
      // custom domain login). Otherwise fall back to the role default.
      const dest =
        safeNext ??
        (profile?.role === "super_admin" ? "/admin" :
         profile?.role === "trader" ? "/dashboard" :
         profile?.role === "student" ? "/student" : null);
      if (dest) redirect(dest);
    }
  }

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
        <div className={styles.partnerBadge}>
          <Image
            alt="XM Global"
            height={16}
            src="/images/xm-global-logo.svg"
            unoptimized
            width={54}
          />
          <span>Partnered with XM Global</span>
        </div>
      </section>
      <section className={styles.content}>
        <div className={styles.card}>
          <p className="eyebrow">Account access</p>
          <h2>Sign in to KaiMentors</h2>
          <p>Use the email address and password for your KaiMentors account.</p>
          <LoginForm next={safeNext ?? undefined} />
          <div className={styles.footer}><Link href="/recover">Forgot your password?</Link></div>
          <div className={styles.footer}><Link href="/account-setup">Resume account setup</Link></div>
          <div className={styles.footer}>
            New mentor? <Link href="/onboarding">Create a workspace</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
