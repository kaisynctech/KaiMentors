import { Globe2 } from "lucide-react";
import styles from "./not-found.module.css";

export default function CustomDomainNotFound() {
  return (
    <main className={styles.page}>
      <section>
        <span><Globe2 size={24} /></span>
        <p>Website unavailable</p>
        <h1>This academy website is not active yet.</h1>
        <p>
          The domain may still be awaiting verification, DNS propagation, or a
          published website release. Please contact the academy owner.
        </p>

      </section>
    </main>
  );
}
