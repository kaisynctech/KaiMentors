"use client";

import { Braces, Camera, ExternalLink, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { StudentBrokerGuide, VerificationMethod } from "@/lib/database.types";
import { VerificationScreenshotUpload } from "./verification-screenshot-upload";
import styles from "./broker-guide-card.module.css";

interface BrokerGuideCardProps {
  guides: StudentBrokerGuide[];
  applicationStatus: string;
  studentUserId: string;
  traderId: string;
  portalId: string;
  currentScreenshotPath: string | null;
}

const methodLabels: Record<VerificationMethod, string> = {
  api: "API (automatic)",
  manual_review: "Manual review by mentor",
  screenshot_upload: "Screenshot upload",
};

const methodIcons: Record<VerificationMethod, React.ElementType> = {
  api: Braces,
  manual_review: ShieldCheck,
  screenshot_upload: Camera,
};

const isUnverified = (status: string) =>
  !["verified", "rejected"].includes(status);

function SingleBrokerView({
  guide,
  applicationStatus,
  studentUserId,
  traderId,
  portalId,
  currentScreenshotPath,
}: {
  guide: StudentBrokerGuide;
  applicationStatus: string;
  studentUserId: string;
  traderId: string;
  portalId: string;
  currentScreenshotPath: string | null;
}) {
  const Icon = methodIcons[guide.verification_method];

  return (
    <>
      <div className={styles.methodRow}>
        <div className={styles.methodIcon}>
          <Icon size={18} />
        </div>
        <div>
          <p className={styles.methodLabel}>Verification method</p>
          <p className={styles.methodName}>{methodLabels[guide.verification_method]}</p>
        </div>
      </div>

      {guide.verification_instructions ? (
        <div className={styles.instructions}>
          <p className={styles.instructionsLabel}>Mentor instructions</p>
          <p className={styles.instructionsText}>{guide.verification_instructions}</p>
        </div>
      ) : null}

      {guide.partner_code ? (
        <div className={styles.partnerCode}>
          <p className={styles.partnerCodeLabel}>Partner / referral code</p>
          <code className={styles.partnerCodeValue}>{guide.partner_code}</code>
          <p className={styles.partnerCodeHint}>Use this code when registering with {guide.broker_name}.</p>
        </div>
      ) : null}

      <div className={styles.actions}>
        {guide.affiliate_link ? (
          <a
            className={styles.affiliateBtn}
            href={guide.affiliate_link}
            rel="noreferrer"
            target="_blank"
          >
            Open broker registration
            <ExternalLink size={15} />
          </a>
        ) : null}

        {isUnverified(applicationStatus) ? (
          <VerificationScreenshotUpload
            currentScreenshotPath={currentScreenshotPath}
            portalId={portalId}
            studentUserId={studentUserId}
            traderId={traderId}
          />
        ) : null}
      </div>
    </>
  );
}

function MultiBrokerView({
  guides,
  applicationStatus,
  studentUserId,
  traderId,
  portalId,
  currentScreenshotPath,
}: BrokerGuideCardProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const guide = guides[activeIndex];
  const Icon = methodIcons[guide.verification_method];

  return (
    <>
      <div className={styles.tabs} role="tablist">
        {guides.map((g, i) => (
          <button
            className={`${styles.tab}${i === activeIndex ? ` ${styles.tabActive}` : ""}`}
            key={g.id}
            onClick={() => setActiveIndex(i)}
            role="tab"
            aria-selected={i === activeIndex}
            type="button"
          >
            {g.broker_name}
          </button>
        ))}
      </div>

      <div className={styles.methodRow}>
        <div className={styles.methodIcon}>
          <Icon size={18} />
        </div>
        <div>
          <p className={styles.methodLabel}>Verification method</p>
          <p className={styles.methodName}>{methodLabels[guide.verification_method]}</p>
        </div>
      </div>

      {guide.verification_instructions ? (
        <div className={styles.instructions}>
          <p className={styles.instructionsLabel}>Mentor instructions</p>
          <p className={styles.instructionsText}>{guide.verification_instructions}</p>
        </div>
      ) : null}

      {guide.partner_code ? (
        <div className={styles.partnerCode}>
          <p className={styles.partnerCodeLabel}>Partner / referral code</p>
          <code className={styles.partnerCodeValue}>{guide.partner_code}</code>
          <p className={styles.partnerCodeHint}>Use this code when registering with {guide.broker_name}.</p>
        </div>
      ) : null}

      <div className={styles.actions}>
        {guide.affiliate_link ? (
          <a
            className={styles.affiliateBtn}
            href={guide.affiliate_link}
            rel="noreferrer"
            target="_blank"
          >
            Open {guide.broker_name} registration
            <ExternalLink size={15} />
          </a>
        ) : null}

        {isUnverified(applicationStatus) ? (
          <VerificationScreenshotUpload
            currentScreenshotPath={currentScreenshotPath}
            portalId={portalId}
            studentUserId={studentUserId}
            traderId={traderId}
          />
        ) : null}
      </div>
    </>
  );
}

export function BrokerGuideCard(props: BrokerGuideCardProps) {
  const { guides } = props;

  if (guides.length === 0) {
    return (
      <div className={styles.card}>
        <div className={styles.header}>
          <span className="eyebrow">Broker verification</span>
          <h2>How your broker account is verified</h2>
        </div>
        <p className={styles.emptyState}>
          This academy hasn&apos;t configured broker verification yet. Contact the academy directly for access.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className="eyebrow">Broker verification</span>
        <h2>How your broker account is verified</h2>
      </div>

      {guides.length === 1 ? (
        <SingleBrokerView
          guide={guides[0]}
          applicationStatus={props.applicationStatus}
          studentUserId={props.studentUserId}
          traderId={props.traderId}
          portalId={props.portalId}
          currentScreenshotPath={props.currentScreenshotPath}
        />
      ) : (
        <MultiBrokerView {...props} />
      )}
    </div>
  );
}
