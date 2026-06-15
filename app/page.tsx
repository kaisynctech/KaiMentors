import Link from "next/link";
import { ArrowRight, BadgeCheck, Building2, ShieldCheck } from "lucide-react";
import styles from "./home.module.css";

const benefits = [
  {
    icon: ShieldCheck,
    title: "Verified access",
    copy: "Private content unlocks only after a student passes the configured broker verification workflow.",
  },
  {
    icon: Building2,
    title: "Built for many brokers",
    copy: "Broker-specific behavior stays behind server-side adapters instead of leaking into portals or dashboards.",
  },
  {
    icon: BadgeCheck,
    title: "One SaaS platform",
    copy: "Every mentor gets isolated data, flexible branding, and a professional student experience.",
  },
];

export default function Home() {
  return (
    <main>
      <header className={styles.header}>
        <div className={`container ${styles.nav}`}>
          <Link className={styles.brand} href="/">
            <span>K</span>
            KaiMentors
          </Link>
          <div className={styles.navActions}>
            <Link href="/login">Sign in</Link>
            <Link className="button button-primary" href="/onboarding">
              Create a portal
            </Link>
          </div>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={`container ${styles.heroGrid}`}>
          <div>
            <p className="eyebrow">The verified learning platform</p>
            <h1>Protect your community. Reward genuine students.</h1>
            <p className={styles.heroCopy}>
              KaiMentors gives trading educators a branded portal where broker
              verification controls access to lessons, resources, live classes,
              and community updates.
            </p>
            <div className={styles.heroActions}>
              <Link className="button button-primary" href="/onboarding">
                Launch your portal <ArrowRight size={17} />
              </Link>
              <Link className="button button-secondary" href="/login">
                View dashboard
              </Link>
            </div>
          </div>
          <div className={styles.productCard}>
            <div className={styles.productTop}>
              <span>Student access</span>
              <span className="status">Verified</span>
            </div>
            <div className={styles.profile}>
              <div className={styles.avatar}>KM</div>
              <div>
                <strong>Private academy portal</strong>
                <p>Broker status confirmed</p>
              </div>
            </div>
            <div className={styles.progress}>
              <span />
              <span />
              <span />
            </div>
            <div className={styles.lesson}>
              <div />
              <span>
                <strong>Market structure masterclass</strong>
                <small>Available now</small>
              </span>
              <ArrowRight size={18} />
            </div>
            <div className={styles.lesson}>
              <div />
              <span>
                <strong>Weekly live analysis</strong>
                <small>Thursday, 18:00</small>
              </span>
              <ArrowRight size={18} />
            </div>
          </div>
        </div>
      </section>

      <section className={`container ${styles.benefits}`}>
        {benefits.map(({ icon: Icon, title, copy }) => (
          <article className="card" key={title}>
            <Icon size={22} />
            <h2>{title}</h2>
            <p>{copy}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
