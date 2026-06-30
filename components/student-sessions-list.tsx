"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Video } from "lucide-react";
import styles from "./student-sessions-list.module.css";

interface SessionType {
  name: string;
  duration_minutes: number;
  cancellation_hours: number;
}

interface Booking {
  id: string;
  trader_id: string;
  session_type_id: string;
  starts_at: string;
  ends_at: string;
  status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
  student_notes: string | null;
  cancellation_reason: string | null;
  live_class_id: string | null;
  session_type: SessionType | SessionType[] | null;
}

interface Props {
  bookings: Booking[];
  academyName: string;
}

function getSessionType(b: Booking): SessionType | null {
  if (!b.session_type) return null;
  return Array.isArray(b.session_type) ? b.session_type[0] ?? null : b.session_type;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: Booking["status"]): string {
  switch (status) {
    case "pending": return "Awaiting confirmation";
    case "confirmed": return "Confirmed";
    case "cancelled": return "Cancelled";
    case "completed": return "Completed";
    case "no_show": return "No-show";
  }
}

function statusClass(status: Booking["status"]): string {
  switch (status) {
    case "pending": return styles.sPending;
    case "confirmed": return styles.sConfirmed;
    case "cancelled": return styles.sCancelled;
    case "completed": return styles.sCompleted;
    case "no_show": return styles.sNoShow;
  }
}

export function StudentSessionsList({ bookings, academyName }: Props) {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date());
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => setNow(new Date()), 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const nowMs = now.getTime();

  const upcoming = bookings.filter(
    (b) => new Date(b.starts_at).getTime() > nowMs && (b.status === "pending" || b.status === "confirmed"),
  );
  const past = bookings.filter(
    (b) =>
      new Date(b.starts_at).getTime() <= nowMs ||
      b.status === "completed" ||
      b.status === "cancelled" ||
      b.status === "no_show",
  );

  function canJoin(b: Booking): boolean {
    if (b.status !== "confirmed") return false;
    if (!b.live_class_id) return false;
    const startMs = new Date(b.starts_at).getTime();
    return nowMs >= startMs - 15 * 60 * 1000;
  }

  function canCancel(b: Booking): boolean {
    if (b.status !== "pending" && b.status !== "confirmed") return false;
    const st = getSessionType(b);
    if (!st) return true;
    const cancelWindowMs = st.cancellation_hours * 60 * 60 * 1000;
    const startMs = new Date(b.starts_at).getTime();
    return nowMs < startMs - cancelWindowMs;
  }

  async function handleCancel(bookingId: string) {
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", reason: cancelReason || undefined }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        setCancelError(err.error ?? "Could not cancel booking.");
        return;
      }
      setCancelTarget(null);
      router.refresh();
    } catch {
      setCancelError("Network error. Please try again.");
    } finally {
      setCancelling(false);
    }
  }

  function BookingCard({ b }: { b: Booking }) {
    const st = getSessionType(b);
    const showJoin = canJoin(b);
    const showCancel = canCancel(b);
    const isCancelOpen = cancelTarget === b.id;

    return (
      <div className={styles.sessionCard}>
        <div className={styles.cardHeader}>
          <div className={styles.cardInfo}>
            <span className={styles.sessionName}>{st?.name ?? "Session"}</span>
            {st?.duration_minutes ? (
              <span className={styles.sessionDuration}>{st.duration_minutes} min</span>
            ) : null}
          </div>
          <span className={`${styles.statusBadge} ${statusClass(b.status)}`}>
            {statusLabel(b.status)}
          </span>
        </div>
        <p className={styles.sessionTime}>{formatDateTime(b.starts_at)}</p>

        {b.status === "completed" && b.student_notes ? (
          <p className={styles.mentorNoteHint}>Notes available — check with your mentor.</p>
        ) : null}

        <div className={styles.cardActions}>
          {showJoin ? (
            <a
              className={styles.joinBtn}
              href={`/student/live-classes/${b.live_class_id}`}
            >
              <Video size={14} />
              Join session
            </a>
          ) : null}
          {showCancel && !isCancelOpen ? (
            <button
              className={styles.cancelBtn}
              onClick={() => { setCancelTarget(b.id); setCancelReason(""); setCancelError(null); }}
              type="button"
            >
              Cancel
            </button>
          ) : null}
        </div>

        {isCancelOpen ? (
          <div className={styles.cancelForm}>
            <p className={styles.cancelFormTitle}>Cancel this session?</p>
            <textarea
              className={styles.cancelReason}
              maxLength={300}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason (optional)"
              rows={2}
              value={cancelReason}
            />
            {cancelError ? <p className={styles.cancelError}>{cancelError}</p> : null}
            <div className={styles.cancelFormActions}>
              <button
                className={styles.cancelConfirmBtn}
                disabled={cancelling}
                onClick={() => handleCancel(b.id)}
                type="button"
              >
                {cancelling ? "Cancelling…" : "Yes, cancel"}
              </button>
              <button
                className={styles.keepBtn}
                onClick={() => setCancelTarget(null)}
                type="button"
              >
                Keep booking
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <p className="eyebrow">{academyName}</p>
        <h1>My Sessions</h1>
      </div>

      {upcoming.length === 0 && past.length === 0 ? (
        <div className={styles.emptyState}>
          <CalendarClock size={36} />
          <p>You have no sessions yet.</p>
          <a className={styles.bookLink} href="./">
            Book your first session
          </a>
        </div>
      ) : null}

      {upcoming.length > 0 ? (
        <section className={styles.section}>
          <p className={styles.sectionTitle}>Upcoming</p>
          <div className={styles.cardList}>
            {upcoming.map((b) => (
              <BookingCard b={b} key={b.id} />
            ))}
          </div>
        </section>
      ) : null}

      {past.length > 0 ? (
        <section className={styles.section}>
          <p className={styles.sectionTitle}>Past</p>
          <div className={styles.cardList}>
            {past.map((b) => (
              <BookingCard b={b} key={b.id} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
