"use client";

import Link from "next/link";
import styles from "./settings-tabs.module.css";

const TABS = [
  { value: "account",    label: "Account"        },
  { value: "team",       label: "Team"            },
  { value: "brokers",    label: "Broker Accounts" },
  { value: "branding",   label: "Academy Page"    },
  { value: "student-access", label: "Student access" },
  { value: "features",   label: "Features"        },
  { value: "integration", label: "Integration"    },
  { value: "billing",    label: "Billing"         },
  { value: "audit-logs", label: "Audit Logs"      },
] as const;

type TabValue = (typeof TABS)[number]["value"];

interface Props {
  activeTab: TabValue;
  showIntegration?: boolean;
}

export function SettingsTabs({ activeTab, showIntegration = false }: Props) {
  const tabs = TABS.filter((tab) => tab.value !== "integration" || showIntegration);
  return (
    <div className={styles.tabs}>
      {tabs.map((t) => (
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
