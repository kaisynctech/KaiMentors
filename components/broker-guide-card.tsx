import { Braces, Camera, ExternalLink, ShieldCheck } from "lucide-react";
import type { VerificationMethod } from "@/lib/database.types";
import { VerificationScreenshotUpload } from "./verification-screenshot-upload";
import styles from "./broker-guide-card.module.css";

interface BrokerGuideCardProps {
  verificationMethod: VerificationMethod;
  verificationInstructions: string | null;
  affiliateLink: string | null;
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

export function BrokerGuideCard({
  verificationMethod,
  verificationInstructions,
  affiliateLink,
  applicationStatus,
  studentUserId,
  traderId,
  portalId,
  currentScreenshotPath,
}: BrokerGuideCardProps) {
  const Icon = methodIcons[verificationMethod];
  const showUpload =
    verificationMethod === "screenshot_upload" &&
    applicationStatus === "manual_review";

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className="eyebrow">Broker verification</span>
        <h2>How your broker account is verified</h2>
      </div>

      <div className={styles.methodRow}>
        <div className={styles.methodIcon}>
          <Icon size={18} />
        </div>
        <div>
          <p className={styles.methodLabel}>Verification method</p>
          <p className={styles.methodName}>{methodLabels[verificationMethod]}</p>
        </div>
      </div>

      {verificationInstructions ? (
        <div className={styles.instructions}>
          <p className={styles.instructionsLabel}>Mentor instructions</p>
          <p className={styles.instructionsText}>{verificationInstructions}</p>
        </div>
      ) : null}

      <div className={styles.actions}>
        {affiliateLink ? (
          <a
            className={styles.affiliateBtn}
            href={affiliateLink}
            rel="noreferrer"
            target="_blank"
          >
            Open broker registration
            <ExternalLink size={15} />
          </a>
        ) : null}

        {showUpload ? (
          <VerificationScreenshotUpload
            currentScreenshotPath={currentScreenshotPath}
            portalId={portalId}
            studentUserId={studentUserId}
            traderId={traderId}
          />
        ) : null}
      </div>
    </div>
  );
}
