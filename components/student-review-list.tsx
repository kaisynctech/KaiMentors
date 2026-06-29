"use client";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  Filter,
  Loader2,
  MessageSquareMore,
  Search,
  X,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { VerificationMethod } from "@/lib/database.types";
import {
  reviewableStatuses,
  statusLabels,
  studentTabStatuses,
  type ReviewAction,
  type StudentApplicationRow,
  type StudentCounts,
  type StudentTab,
} from "@/lib/students";
import styles from "./student-review-list.module.css";

interface StudentReviewListProps {
  applications: StudentApplicationRow[];
  brokers: Array<{ id: string; name: string }>;
  counts: StudentCounts;
  filters: {
    tab: StudentTab;
    search: string;
    brokerId: string;
    method: VerificationMethod | "";
    page: number;
    pageSize: number;
  };
  totalCount: number;
}

interface ReviewDialogState {
  action: ReviewAction;
  applications: StudentApplicationRow[];
}

const tabs: Array<{ key: StudentTab; label: string }> = [
  { key: "all", label: "All students" },
  { key: "pending", label: "Pending review" },
  { key: "needs_information", label: "Needs information" },
  { key: "verified", label: "Verified" },
  { key: "rejected", label: "Rejected" },
];

const levelTagLabels: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  funded: "Funded Trader",
};

const levelTagColors: Record<string, string> = {
  beginner: "#1d4ed8",
  intermediate: "#b45309",
  advanced: "#15803d",
  funded: "#7e22ce",
};

const actionLabels: Record<ReviewAction, string> = {
  verified: "Approve",
  rejected: "Reject",
  needs_more_information: "Request information",
};

function formatMethod(method: VerificationMethod) {
  return method.replaceAll("_", " ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function matchesTab(status: StudentApplicationRow["status"], tab: StudentTab) {
  return tab === "all" || studentTabStatuses[tab].includes(status);
}

export function StudentReviewList({
  applications,
  brokers,
  counts,
  filters,
  totalCount,
}: StudentReviewListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [rows, setRows] = useState(applications);
  const [search, setSearch] = useState(filters.search);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<StudentApplicationRow | null>(null);
  const [dialog, setDialog] = useState<ReviewDialogState | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [proofLoading, setProofLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setRows(applications);
    setSelected(new Set());
  }, [applications]);

  const eligibleRows = useMemo(
    () => rows.filter((row) => reviewableStatuses.includes(row.status)),
    [rows],
  );
  const selectedRows = useMemo(
    () => rows.filter((row) => selected.has(row.id)),
    [rows, selected],
  );
  const pageCount = Math.max(1, Math.ceil(totalCount / filters.pageSize));
  const firstRow =
    totalCount === 0 ? 0 : (filters.page - 1) * filters.pageSize + 1;
  const lastRow = Math.min(filters.page * filters.pageSize, totalCount);

  function navigate(changes: Record<string, string | number | null>) {
    const params = new URLSearchParams();
    if (filters.tab !== "all") params.set("tab", filters.tab);
    if (filters.search) params.set("search", filters.search);
    if (filters.brokerId) params.set("broker", filters.brokerId);
    if (filters.method) params.set("method", filters.method);
    if (filters.page > 1) params.set("page", String(filters.page));
    if (filters.pageSize !== 25) {
      params.set("pageSize", String(filters.pageSize));
    }

    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "" || value === 1) params.delete(key);
      else params.set(key, String(value));
    }

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ page: null, search: search.trim() || null });
  }

  function toggleRow(row: StudentApplicationRow) {
    if (!reviewableStatuses.includes(row.status)) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
  }

  function togglePage() {
    setSelected((current) => {
      const allSelected =
        eligibleRows.length > 0 &&
        eligibleRows.every((row) => current.has(row.id));
      if (allSelected) return new Set();
      return new Set(eligibleRows.map((row) => row.id));
    });
  }

  function openReview(
    action: ReviewAction,
    targetApplications: StudentApplicationRow[],
  ) {
    if (targetApplications.some((application) => application.status === action)) {
      setError("The selected students are already in that status.");
      return;
    }
    setReason("");
    setError("");
    setNotice("");
    setDialog({ action, applications: targetApplications });
  }

  async function submitReview() {
    if (!dialog) return;
    const normalizedReason = reason.trim();
    if (dialog.action !== "verified" && normalizedReason.length < 3) {
      setError("Add a review reason of at least 3 characters.");
      return;
    }

    setSubmitting(true);
    setError("");
    const response = await fetch("/api/students/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        applications: dialog.applications.map((application) => ({
          id: application.id,
          expectedVersion: application.reviewVersion,
        })),
        reason: dialog.action === "verified" ? null : normalizedReason,
        status: dialog.action,
      }),
    });
    const payload = await response.json();
    setSubmitting(false);

    if (!response.ok) {
      setError(payload.error ?? "The review could not be completed.");
      return;
    }

    const changedIds = new Set(
      dialog.applications.map((application) => application.id),
    );
    setRows((current) =>
      current
        .map((row) =>
          changedIds.has(row.id)
            ? {
                ...row,
                reviewVersion: row.reviewVersion + 1,
                status: dialog.action,
                statusReason:
                  dialog.action === "verified" ? null : normalizedReason,
              }
            : row,
        )
        .filter((row) => matchesTab(row.status, filters.tab)),
    );
    if (detail && changedIds.has(detail.id)) {
      setDetail({
        ...detail,
        reviewVersion: detail.reviewVersion + 1,
        status: dialog.action,
        statusReason:
          dialog.action === "verified" ? null : normalizedReason,
      });
    }
    setSelected(new Set());
    setDialog(null);
    setNotice(
      `${dialog.applications.length} student${
        dialog.applications.length === 1 ? "" : "s"
      } updated successfully.`,
    );
    router.refresh();
  }

  async function openProof(application: StudentApplicationRow) {
    setProofLoading(true);
    setError("");
    const response = await fetch(`/api/students/${application.id}/proof`);
    const payload = await response.json();
    setProofLoading(false);
    if (!response.ok || !payload.url) {
      setError(payload.error ?? "The proof could not be opened.");
      return;
    }
    const link = document.createElement("a");
    link.href = payload.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.click();
  }

  const tabCount = (tab: StudentTab) => {
    if (tab === "all") return counts.total;
    if (tab === "pending") return counts.pending;
    if (tab === "needs_information") return counts.needsInformation;
    if (tab === "verified") return counts.verified;
    return counts.rejected;
  };

  return (
    <section className={styles.directory}>
      <div className={styles.directoryHeader}>
        <div>
          <p className={styles.eyebrow}>Student operations</p>
          <h2>Applications and access</h2>
          <p>Review evidence, manage verification, and control academy access.</p>
        </div>
        <span className={styles.resultCount}>{totalCount} results</span>
      </div>

      <nav aria-label="Student status" className={styles.tabs}>
        {tabs.map((tab) => (
          <button
            aria-current={filters.tab === tab.key ? "page" : undefined}
            className={filters.tab === tab.key ? styles.activeTab : ""}
            key={tab.key}
            onClick={() => navigate({ page: null, tab: tab.key })}
            type="button"
          >
            {tab.label}
            <span>{tabCount(tab.key)}</span>
          </button>
        ))}
      </nav>

      <div className={styles.toolbar}>
        <form className={styles.search} onSubmit={submitSearch}>
          <Search size={17} />
          <input
            aria-label="Search students"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email, phone, or account"
            type="search"
            value={search}
          />
        </form>
        <div className={styles.filters}>
          <Filter size={16} />
          <select
            aria-label="Filter by broker"
            onChange={(event) =>
              navigate({ broker: event.target.value || null, page: null })
            }
            value={filters.brokerId}
          >
            <option value="">All brokers</option>
            {brokers.map((broker) => (
              <option key={broker.id} value={broker.id}>
                {broker.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by verification method"
            onChange={(event) =>
              navigate({ method: event.target.value || null, page: null })
            }
            value={filters.method}
          >
            <option value="">All methods</option>
            <option value="api">API</option>
            <option value="manual_review">Manual review</option>
            <option value="screenshot_upload">Screenshot upload</option>
          </select>
          <select
            aria-label="Rows per page"
            onChange={(event) =>
              navigate({ page: null, pageSize: event.target.value })
            }
            value={filters.pageSize}
          >
            <option value="25">25 rows</option>
            <option value="50">50 rows</option>
            <option value="100">100 rows</option>
          </select>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {notice ? (
        <p aria-live="polite" className={styles.notice}>
          {notice}
        </p>
      ) : null}

      {selectedRows.length ? (
        <div className={styles.bulkBar}>
          <strong>{selectedRows.length} selected</strong>
          <span>Actions apply only to eligible applications on this page.</span>
          <div>
            <button
              className={styles.bulkApprove}
              onClick={() => openReview("verified", selectedRows)}
              type="button"
            >
              <Check size={15} /> Approve
            </button>
            <button
              onClick={() => openReview("rejected", selectedRows)}
              type="button"
            >
              <X size={15} /> Reject
            </button>
            <button
              disabled={selectedRows.some(
                (row) => row.status === "needs_more_information",
              )}
              onClick={() =>
                openReview("needs_more_information", selectedRows)
              }
              title={
                selectedRows.some(
                  (row) => row.status === "needs_more_information",
                )
                  ? "One or more selected students already need information"
                  : undefined
              }
              type="button"
            >
              <MessageSquareMore size={15} /> Request information
            </button>
          </div>
        </div>
      ) : null}

      <div className={styles.tableFrame}>
        <table>
          <thead>
            <tr>
              <th className={styles.checkboxCell}>
                <input
                  aria-label="Select all eligible students on this page"
                  checked={
                    eligibleRows.length > 0 &&
                    eligibleRows.every((row) => selected.has(row.id))
                  }
                  onChange={togglePage}
                  type="checkbox"
                />
              </th>
              <th>Student</th>
              <th>Broker account</th>
              <th>Verification</th>
              <th>Status</th>
              <th>Submitted</th>
              <th className={styles.actionsHeading}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((application) => {
              const reviewable = reviewableStatuses.includes(application.status);
              return (
                <tr key={application.id}>
                  <td className={styles.checkboxCell}>
                    <input
                      aria-label={`Select ${application.studentName}`}
                      checked={selected.has(application.id)}
                      disabled={!reviewable}
                      onChange={() => toggleRow(application)}
                      type="checkbox"
                    />
                  </td>
                  <td>
                    <div className={styles.studentCell}>
                      <span>
                        {application.studentName.slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        <div className={styles.studentNameRow}>
                          <strong>{application.studentName}</strong>
                          {application.tradingLevel && (
                            <span
                              className={styles.levelTag}
                              style={{ background: levelTagColors[application.tradingLevel] }}
                            >
                              {levelTagLabels[application.tradingLevel]}
                            </span>
                          )}
                        </div>
                        <small>
                          {application.studentEmail ?? "No email available"}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className={styles.stackedCell}>
                      <strong>{application.brokerName ?? "—"}</strong>
                      <small>
                        {application.tradingAccountNumber ?? "No account number"}
                      </small>
                    </div>
                  </td>
                  <td className={styles.capitalize}>
                    {application.verificationMethod ? formatMethod(application.verificationMethod) : "—"}
                  </td>
                  <td>
                    <span
                      className={`${styles.status} ${styles[application.status]}`}
                    >
                      {statusLabels[application.status]}
                    </span>
                  </td>
                  <td>{formatDate(application.submittedAt)}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <button
                        aria-label={`View ${application.studentName}`}
                        onClick={() => {
                          setDetail(application);
                          setError("");
                        }}
                        title="View details"
                        type="button"
                      >
                        <Eye size={16} />
                      </button>
                      {reviewable ? (
                        <>
                          <button
                            aria-label={`Approve ${application.studentName}`}
                            className={styles.approveIcon}
                            onClick={() => openReview("verified", [application])}
                            title="Approve"
                            type="button"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            aria-label={`Reject ${application.studentName}`}
                            className={styles.rejectIcon}
                            onClick={() => openReview("rejected", [application])}
                            title="Reject"
                            type="button"
                          >
                            <X size={16} />
                          </button>
                          {application.status !== "needs_more_information" ? (
                            <button
                              aria-label={`Request more information from ${application.studentName}`}
                              className={styles.infoIcon}
                              onClick={() =>
                                openReview("needs_more_information", [
                                  application,
                                ])
                              }
                              title="Request information"
                              type="button"
                            >
                              <MessageSquareMore size={16} />
                            </button>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length ? (
          <div className={styles.empty}>
            <MessageSquareMore size={28} />
            <h3>No matching students</h3>
            <p>Change the active tab or filters to broaden the results.</p>
          </div>
        ) : null}
      </div>

      <div className={styles.pagination}>
        <span>
          Showing {firstRow}-{lastRow} of {totalCount}
        </span>
        <div>
          <button
            aria-label="Previous page"
            disabled={filters.page <= 1}
            onClick={() => navigate({ page: filters.page - 1 })}
            type="button"
          >
            <ChevronLeft size={17} />
          </button>
          <strong>
            Page {filters.page} of {pageCount}
          </strong>
          <button
            aria-label="Next page"
            disabled={filters.page >= pageCount}
            onClick={() => navigate({ page: filters.page + 1 })}
            type="button"
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>

      {detail ? (
        <>
          <button
            aria-label="Close student details"
            className={styles.drawerOverlay}
            onClick={() => setDetail(null)}
            type="button"
          />
          <aside
            aria-label={`${detail.studentName} application details`}
            className={styles.drawer}
          >
            <div className={styles.drawerHeader}>
              <div>
                <p className={styles.eyebrow}>Student application</p>
                <h2>{detail.studentName}</h2>
                <p>{detail.studentEmail ?? "No email available"}</p>
              </div>
              <button
                aria-label="Close details"
                onClick={() => setDetail(null)}
                type="button"
              >
                <X size={19} />
              </button>
            </div>
            <span
              className={`${styles.status} ${styles[detail.status]}`}
            >
              {statusLabels[detail.status]}
            </span>
            <dl className={styles.detailGrid}>
              <div>
                <dt>Phone</dt>
                <dd>
                  {detail.phoneNumber ||
                    detail.profilePhone ||
                    "Not provided"}
                </dd>
              </div>
              <div>
                <dt>Broker</dt>
                <dd>{detail.brokerName ?? "—"}</dd>
              </div>
              <div>
                <dt>Trading account</dt>
                <dd>{detail.tradingAccountNumber ?? "Not provided"}</dd>
              </div>
              <div>
                <dt>MT4 / MT5</dt>
                <dd>{detail.platformAccountNumber ?? "Not provided"}</dd>
              </div>
              <div>
                <dt>Verification method</dt>
                <dd className={styles.capitalize}>
                  {detail.verificationMethod ? formatMethod(detail.verificationMethod) : "—"}
                </dd>
              </div>
              <div>
                <dt>Submitted</dt>
                <dd>{formatDate(detail.submittedAt)}</dd>
              </div>
            </dl>
            {detail.statusReason ? (
              <div className={styles.reviewNote}>
                <strong>Latest review note</strong>
                <p>{detail.statusReason}</p>
              </div>
            ) : null}
            <div className={styles.proofBlock}>
              <div>
                <strong>Screenshot proof</strong>
                <p>
                  Proof links are generated securely and expire after five
                  minutes.
                </p>
              </div>
              <button
                disabled={!detail.hasProof || proofLoading}
                onClick={() => openProof(detail)}
                type="button"
              >
                {proofLoading ? (
                  <Loader2 className={styles.spin} size={16} />
                ) : (
                  <ExternalLink size={16} />
                )}
                {detail.hasProof ? "Open proof" : "No proof supplied"}
              </button>
            </div>
            {reviewableStatuses.includes(detail.status) ? (
              <div className={styles.drawerActions}>
                <button
                  className={styles.primaryAction}
                  onClick={() => openReview("verified", [detail])}
                  type="button"
                >
                  <Check size={16} /> Approve student
                </button>
                <button
                  onClick={() => openReview("rejected", [detail])}
                  type="button"
                >
                  <X size={16} /> Reject
                </button>
                {detail.status !== "needs_more_information" ? (
                  <button
                    onClick={() =>
                      openReview("needs_more_information", [detail])
                    }
                    type="button"
                  >
                    <MessageSquareMore size={16} /> Request information
                  </button>
                ) : null}
              </div>
            ) : (
              <p className={styles.lockedNote}>
                This application is view-only in its current status.
              </p>
            )}
          </aside>
        </>
      ) : null}

      {dialog ? (
        <div
          aria-labelledby="review-dialog-title"
          aria-modal="true"
          className={styles.modalOverlay}
          role="dialog"
        >
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>Confirm review action</p>
                <h2 id="review-dialog-title">
                  {actionLabels[dialog.action]}{" "}
                  {dialog.applications.length === 1
                    ? dialog.applications[0].studentName
                    : `${dialog.applications.length} students`}
                </h2>
              </div>
              <button
                aria-label="Close review dialog"
                disabled={submitting}
                onClick={() => setDialog(null)}
                type="button"
              >
                <X size={19} />
              </button>
            </div>
            <p className={styles.modalCopy}>
              {dialog.action === "verified"
                ? "Approval grants access to protected academy course content."
                : "This reason is stored in the audit trail and on each selected application."}
            </p>
            {dialog.action !== "verified" ? (
              <label className={styles.reasonField}>
                Review reason
                <textarea
                  autoFocus
                  maxLength={500}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={
                    dialog.action === "rejected"
                      ? "Explain why the application is being rejected."
                      : "Explain what information the student must provide."
                  }
                  rows={4}
                  value={reason}
                />
                <span>{reason.length}/500</span>
              </label>
            ) : null}
            {error ? <p className={styles.error}>{error}</p> : null}
            <div className={styles.modalActions}>
              <button
                disabled={submitting}
                onClick={() => setDialog(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className={
                  dialog.action === "verified"
                    ? styles.confirmApprove
                    : styles.confirmDanger
                }
                disabled={submitting}
                onClick={submitReview}
                type="button"
              >
                {submitting ? (
                  <Loader2 className={styles.spin} size={16} />
                ) : null}
                Confirm {actionLabels[dialog.action].toLowerCase()}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
