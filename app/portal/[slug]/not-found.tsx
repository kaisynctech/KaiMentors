import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";
import styles from "./not-found.module.css";

export default function PortalNotFound() {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.icon}>
          <Compass size={28} />
        </div>
        <p className="eyebrow">Portal unavailable</p>
        <h1>This mentor portal could not be found.</h1>
        <p>
          The address may have changed, or the mentor may still be preparing
          their academy for launch.
        </p>
        <Link href="/">
          <ArrowLeft size={17} /> Return to KaiMentors
        </Link>
      </section>
    </main>
  );
}
