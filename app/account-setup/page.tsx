import { AccountSetupFlow } from "@/components/account-setup-flow";
import { BrandMark } from "@/components/brand-mark";
import styles from "../auth.module.css";

export default function AccountSetupPage() {
  return (
    <main className={styles.page}>
      <section className={styles.aside}>
        <BrandMark />
        <div>
          <h1>Continue without starting over.</h1>
          <p>
            Your identity, academy, website package, and history stay connected
            while setup is completed.
          </p>
        </div>
        <small>Secure account continuation</small>
      </section>
      <section className={styles.content}>
        <div className={styles.card}>
          <AccountSetupFlow />
        </div>
      </section>
    </main>
  );
}
