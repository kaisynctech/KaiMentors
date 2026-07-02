"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import styles from "./student-broker-view.module.css";

interface BrokerEntry {
  id: string;
  brokerName: string;
  affiliateLink: string | null;
  newAccountInstructions: string | null;
  newAccountImageUrl: string | null;
  newAccountVideoUrl: string | null;
  existingAccountInstructions: string | null;
  existingAccountImageUrl: string | null;
  existingAccountVideoUrl: string | null;
}

interface StudentBrokerViewProps {
  brokers: BrokerEntry[];
}

type InstructionTab = "new" | "existing";

export function StudentBrokerView({ brokers }: StudentBrokerViewProps) {
  const [tabs, setTabs] = useState<Record<string, InstructionTab>>(
    Object.fromEntries(brokers.map((b) => [b.id, "new" as InstructionTab])),
  );

  if (!brokers.length) {
    return (
      <div className={styles.empty}>
        <p>No broker accounts have been configured for this academy yet.</p>
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {brokers.map((broker) => {
        const tab = tabs[broker.id] ?? "new";
        const instructions =
          tab === "new" ? broker.newAccountInstructions : broker.existingAccountInstructions;
        const imageUrl =
          tab === "new" ? broker.newAccountImageUrl : broker.existingAccountImageUrl;
        const videoUrl =
          tab === "new" ? broker.newAccountVideoUrl : broker.existingAccountVideoUrl;
        const initial = broker.brokerName.trim().charAt(0).toUpperCase() || "B";
        const hasContent = instructions || imageUrl || videoUrl;

        return (
          <article className={styles.card} key={broker.id}>
            <div className={styles.cardHeader}>
              <div className={styles.brokerAvatar}>{initial}</div>
              <h2 className={styles.brokerName}>{broker.brokerName}</h2>
              {broker.affiliateLink ? (
                <a
                  className={styles.openBtn}
                  href={broker.affiliateLink}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open account
                  <ExternalLink size={13} />
                </a>
              ) : null}
            </div>

            <div className={styles.tabs}>
              <button
                className={`${styles.tab} ${tab === "new" ? styles.tabActive : ""}`}
                onClick={() => setTabs((prev) => ({ ...prev, [broker.id]: "new" }))}
                type="button"
              >
                New to {broker.brokerName}
              </button>
              <button
                className={`${styles.tab} ${tab === "existing" ? styles.tabActive : ""}`}
                onClick={() =>
                  setTabs((prev) => ({ ...prev, [broker.id]: "existing" }))
                }
                type="button"
              >
                Already have an account
              </button>
            </div>

            {hasContent ? (
              <div className={styles.content}>
                {imageUrl || instructions ? (
                  <div className={styles.contentGrid}>
                    {imageUrl ? (
                      <div className={styles.imageCol}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img alt="" className={styles.image} src={imageUrl} />
                      </div>
                    ) : null}
                    {instructions ? (
                      <div className={styles.textCol}>
                        <pre className={styles.instructions}>{instructions}</pre>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {videoUrl ? (
                  <div className={styles.videoWrap}>
                    <video className={styles.video} controls src={videoUrl} />
                  </div>
                ) : null}
              </div>
            ) : (
              <p className={styles.noContent}>No instructions have been added yet.</p>
            )}
          </article>
        );
      })}
    </div>
  );
}
