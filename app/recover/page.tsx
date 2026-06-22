import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { PasswordRecoveryForm } from "@/components/password-recovery-form";
import styles from "../auth.module.css";

export default function RecoveryPage() {
  return <main className={styles.page}><section className={styles.aside}><BrandMark /><div><p className="eyebrow">Account security</p><h1>Recover access securely.</h1><p>KaiMentors uses a manually entered six-digit code. Email links cannot authenticate your account.</p></div></section><section className={styles.content}><div className={styles.card}><PasswordRecoveryForm /><div className={styles.footer}><Link href="/login">Back to sign in</Link></div></div></section></main>;
}
