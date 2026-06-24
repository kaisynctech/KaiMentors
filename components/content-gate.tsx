import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import styles from "./content-gate.module.css";

interface ContentGateProps {
  applicationStatus: string | null;
  returnPath: string;
}

const gateMessages: Record<string, { title: string; body: string }> = {
  pending: {
    title: "Access pending",
    body: "Your application is under review. This section unlocks once your broker account is verified.",
  },
  processing: {
    title: "Verification in progress",
    body: "We're checking your broker account details. This usually completes within a few minutes.",
  },
  manual_review: {
    title: "More information needed",
    body: "Your mentor has requested additional details before approving your access. Check your dashboard for instructions.",
  },
  needs_more_information: {
    title: "More information needed",
    body: "Your mentor has requested additional details before approving your access. Check your dashboard for instructions.",
  },
  rejected: {
    title: "Application not approved",
    body: "Your application could not be approved. Contact your academy for support.",
  },
};

export function ContentGate({ applicationStatus, returnPath }: ContentGateProps) {
  const message =
    (applicationStatus ? gateMessages[applicationStatus] : null) ?? {
      title: "Access pending",
      body: "Complete broker verification to access this section.",
    };

  return (
    <div className={styles.wrapper}>
      <div aria-hidden="true" className={styles.blurred}>
        <div className={styles.placeholder}>
          <div className={styles.placeholderCardWide} />
          <div className={styles.placeholderCard} />
          <div className={styles.placeholderCard} />
          <div className={styles.placeholderCard} />
        </div>
      </div>
      <div className={styles.gate}>
        <div className={styles.card}>
          <div className={styles.icon}>
            <LockKeyhole size={24} />
          </div>
          <h2>{message.title}</h2>
          <p>{message.body}</p>
          <Link className={styles.link} href={returnPath}>
            Check verification status
          </Link>
        </div>
      </div>
    </div>
  );
}
