import Link from "next/link";
import { Globe2, SearchX } from "lucide-react";
import { loadAcademyEntryByHostname } from "@/lib/academy-entry";
import { requestHostname } from "@/lib/seo";
import styles from "./not-found.module.css";

export default async function CustomDomainNotFound() {
  const academy = await loadAcademyEntryByHostname(await requestHostname());

  // The academy's site is live; only this address is wrong.
  if (academy) {
    return (
      <main className={styles.page}>
        <section>
          <span><SearchX size={24} /></span>
          <p>Page not found</p>
          <h1>This page isn&apos;t on {academy.portal.portal_name}.</h1>
          <p>The link may be old or mistyped.</p>
          <div className={styles.actions}>
            <Link href="/">Go to {academy.portal.portal_name}</Link>
            <Link href="/login">Sign in</Link>
          </div>
        </section>
      </main>
    );
  }

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
