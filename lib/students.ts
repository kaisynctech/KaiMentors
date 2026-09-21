import type {
  VerificationMethod,
  VerificationStatus,
} from "@/lib/database.types";

export type StudentTab =
  | "all"
  | "pending"
  | "needs_information"
  | "verified"
  | "rejected";

export type ReviewAction =
  | "verified"
  | "rejected"
  | "needs_more_information";

export interface StudentApplicationRow {
  id: string;
  status: VerificationStatus;
  statusReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  reviewVersion: number;
  phoneNumber: string;
  tradingAccountNumber: string | null;
  brokerAccountIdentifier: string | null;
  platformAccountNumber: string | null;
  hasProof: boolean;
  studentName: string;
  studentEmail: string | null;
  profilePhone: string | null;
  brokerId: string | null;
  brokerName: string | null;
  verificationMethod: VerificationMethod | null;
  tradingLevel: string | null;
  brokerVerified?: boolean;
}

/** PostgREST: keep rows that already have an XM / broker account ID. */
export const studentBrokerAccountPresenceOr =
  "and(trading_account_number.not.is.null,trading_account_number.neq.),and(broker_account_identifier.not.is.null,broker_account_identifier.neq.)";

export function hasStudentBrokerAccount(row: {
  tradingAccountNumber?: string | null;
  brokerAccountIdentifier?: string | null;
}) {
  return Boolean(
    (row.tradingAccountNumber ?? "").trim() ||
      (row.brokerAccountIdentifier ?? "").trim(),
  );
}

export function studentBrokerAccountDisplay(row: {
  tradingAccountNumber?: string | null;
  brokerAccountIdentifier?: string | null;
}) {
  const value =
    (row.tradingAccountNumber ?? "").trim() ||
    (row.brokerAccountIdentifier ?? "").trim();
  return value || null;
}

export interface StudentCounts {
  total: number;
  pending: number;
  needsInformation: number;
  verified: number;
  rejected: number;
}

export const studentTabStatuses: Record<
  Exclude<StudentTab, "all">,
  VerificationStatus[]
> = {
  pending: ["pending", "manual_review", "processing"],
  needs_information: ["needs_more_information"],
  verified: ["verified"],
  rejected: ["rejected"],
};

export const reviewableStatuses: VerificationStatus[] = [
  "pending",
  "manual_review",
  "needs_more_information",
];

export const statusLabels: Record<VerificationStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  verified: "Verified",
  rejected: "Rejected",
  manual_review: "Manual review",
  needs_more_information: "Needs information",
};
