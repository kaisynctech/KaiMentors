import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { MentorOnboardingForm } from "@/components/mentor-onboarding-form";
import styles from "../auth.module.css";

export default function OnboardingPage() {
  return (
    <main className={styles.page}>
      <section className={styles.aside}>
        <BrandMark />
        <div>
          <p className="eyebrow">Mentor onboarding</p>
          <h1>Your brand. Your students. Verified access.</h1>
          <p>
            Create one workspace that can grow from your first private lesson
            to a multi-broker academy.
          </p>
        </div>
        <small>
          Portal publishing and broker credentials are configured after sign-in.
        </small>
      </section>
      <section className={styles.content}>
        <div className={`${styles.card} ${styles.wide}`}>
          <p className="eyebrow">Start your workspace</p>
          <h2>Create your mentor account</h2>
          <p>Your portal starts as a private draft until setup is complete.</p>
          <MentorOnboardingForm />
          <div className={styles.footer}>
            Already registered? <Link href="/login">Sign in</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
