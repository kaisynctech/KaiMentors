"use client";

import Link from "next/link";
import styles from "./settings-tabs.module.css";

const TABS = [
  { value: "account",    label: "Account"        },
  { value: "team",       label: "Team"            },
  { value: "brokers",    label: "Broker Accounts" },
  { value: "branding",   label: "Academy Page"    },
  { value: "student-access", label: "Student access" },
  { value: "billing",    label: "Billing"         },
  { value: "audit-logs", label: "Audit Logs"      },
] as const;

type TabValue = (typeof TABS)[number]["value"];

interface Props {
  activeTab: TabValue;
}

export function SettingsTabs({ activeTab }: Props) {
  return (
    <div className={styles.tabs}>
      {TABS.map((t) => (
        <Link
          key={t.value}
          href={t.value === "account" ? "/dashboard/settings" : `/dashboard/settings?tab=${t.value}`}
          className={`${styles.tab} ${activeTab === t.value ? styles.tabActive : ""}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
