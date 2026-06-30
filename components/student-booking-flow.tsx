"use client";

import { useState, useEffect } from "react";
import { CalendarCheck, CheckCircle, ChevronLeft, Clock, Users } from "lucide-react";
import styles from "./student-booking-flow.module.css";

interface SessionType {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  max_participants: number;
  requires_approval: boolean;
}

interface UpcomingBooking {
  id: string;
  starts_at: string;
  ends_at: string;
  status: "pending" | "confirmed";
  session_type: { name: string } | Array<{ name: string }> | null;
}

interface Slot {
  startsAt: string;
  endsAt: string;
}

interface Mentor {
  userId: string;
  role: "owner" | "mentor";
  name: string;
}

interface Props {
  sessionTypes: SessionType[];
  upcomingBookings: UpcomingBooking[];
  traderId: string;
  academyName: string;
  mentors: Mentor[];
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getLocalDateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getTypeName(b: UpcomingBooking): string {
  if (!b.session_type) return "Session";
  if (Array.isArray(b.session_type)) return b.session_type[0]?.name ?? "Session";
  return b.session_type.name;
}

export function StudentBookingFlow({
  sessionTypes,
  upcomingBookings,
  traderId,
  academyName,
  mentors,
}: Props) {
  const isMultiMentor = mentors.length > 1;

  const [step, setStep] = useState<0 | 1 | 2 | 3 | "success">(() =>
    isMultiMentor ? 0 : 1,
  );
  const [selectedMentor, setSelectedMentor] = useState<Mentor | null>(() =>
    isMultiMentor ? null : (mentors[0] ?? null),
  );
  const [selectedType, setSelectedType] = useState<SessionType | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [studentNotes, setStudentNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [bookedStartsAt, setBookedStartsAt] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedType || !selectedMentor || step !== 2) return;
    setSlotsLoading(true);
    setSlotsError(null);
    setSlots([]);
    setSelectedDate(null);
    setSelectedSlot(null);
    const params = new URLSearchParams({
      traderId,
      typeId: selectedType.id,
      mentorUserId: selectedMentor.userId,
    });
    fetch(`/api/bookings/slots?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load slots.");
        return r.json() as Promise<Slot[]>;
      })
      .then((data) => {
        setSlots(data);
        setSlotsLoading(false);
      })
      .catch(() => {
        setSlotsError("Could not load available slots. Please try again.");
        setSlotsLoading(false);
      });
  }, [selectedType, selectedMentor, traderId, step]);

  const slotsByDate = slots.reduce<Record<string, Slot[]>>((acc, slot) => {
    const key = getLocalDateKey(slot.startsAt);
    (acc[key] ??= []).push(slot);
    return acc;
  }, {});
  const availableDates = Object.keys(slotsByDate).sort();

  async function handleBook() {
    if (!selectedType || !selectedSlot || !selectedMentor) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionTypeId: selectedType.id,
          traderId,
          mentorUserId: selectedMentor.userId,
          startsAt: selectedSlot.startsAt,
          endsAt: selectedSlot.endsAt,
          studentNotes: studentNotes || undefined,
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        setSubmitError(err.error ?? "Could not book session.");
        setSubmitting(false);
        return;
      }
      const booking = (await res.json()) as { starts_at: string };
      setBookedStartsAt(booking.starts_at);
      setStep("success");
    } catch {
      setSubmitError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  function resetFlow() {
    setStep(isMultiMentor ? 0 : 1);
    setSelectedMentor(isMultiMentor ? null : (mentors[0] ?? null));
    setSelectedType(null);
    setSlots([]);
    setSelectedDate(null);
    setSelectedSlot(null);
    setStudentNotes("");
    setBookedStartsAt(null);
    setSubmitError(null);
  }

  if (step === "success") {
    return (
      <div className={styles.page}>
        <div className={styles.successBox}>
          <CheckCircle className={styles.successIcon} size={48} />
          <h2>Booking requested!</h2>
          <p className={styles.successType}>{selectedType?.name}</p>
          {selectedMentor && isMultiMentor ? (
            <p className={styles.successType} style={{ fontSize: "0.85rem", opacity: 0.7 }}>
              with {selectedMentor.name}
            </p>
          ) : null}
          {bookedStartsAt ? (
            <p className={styles.successTime}>{formatDateTime(bookedStartsAt)}</p>
          ) : null}
          {selectedType?.requires_approval ? (
            <p className={styles.successNote}>
              Your mentor will confirm this booking shortly.
            </p>
          ) : (
            <p className={styles.successNote}>Your session is confirmed.</p>
          )}
          <button className={styles.primaryBtn} onClick={resetFlow}>
            Book another session
          </button>
        </div>
      </div>
    );
  }

  // Step nav labels
  const stepLabels = isMultiMentor
    ? ["Select mentor", "Session type", "Pick a slot", "Confirm"]
    : ["Session type", "Pick a slot", "Confirm"];
  // Map visual step index to internal step number
  const stepIndexToNum = isMultiMentor ? [0, 1, 2, 3] : [1, 2, 3];
  const currentStepIndex = typeof step === "number" ? stepIndexToNum.indexOf(step) : -1;

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <p className="eyebrow">{academyName}</p>
        <h1>Book a Session</h1>
      </div>

      {upcomingBookings.length > 0 ? (
        <section className={styles.section}>
          <p className={styles.sectionTitle}>Your upcoming sessions</p>
          <div className={styles.bookingList}>
            {upcomingBookings.map((b) => (
              <div className={styles.bookingCard} key={b.id}>
                <div className={styles.bookingMeta}>
                  <span className={styles.bookingName}>{getTypeName(b)}</span>
                  <span
                    className={`${styles.statusBadge} ${b.status === "confirmed" ? styles.confirmed : styles.pending}`}
                  >
                    {b.status}
                  </span>
                </div>
                <p className={styles.bookingTime}>{formatDateTime(b.starts_at)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className={styles.stepNav}>
        {stepLabels.map((label, i) => (
          <div
            className={`${styles.stepItem} ${currentStepIndex === i ? styles.stepActive : ""} ${currentStepIndex > i ? styles.stepDone : ""}`}
            key={label}
          >
            <span className={styles.stepNum}>{i + 1}</span>
            <span className={styles.stepLabel}>{label}</span>
          </div>
        ))}
      </div>

      {/* Step 0 — Select mentor (multi-mentor workspaces only) */}
      {step === 0 ? (
        <section className={styles.section}>
          <p className={styles.sectionTitle}>Choose your mentor</p>
          <div className={styles.mentorGrid}>
            {mentors.map((m) => (
              <div className={styles.mentorCard} key={m.userId}>
                <p className={styles.mentorName}>{m.name}</p>
                <span className={styles.mentorRoleBadge}>
                  {m.role === "owner" ? "Lead mentor" : "Mentor"}
                </span>
                <button
                  className={styles.primaryBtn}
                  onClick={() => {
                    setSelectedMentor(m);
                    setStep(1);
                  }}
                >
                  Book with {m.name.split(" ")[0]}
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Step 1 — Session type */}
      {step === 1 ? (
        <section className={styles.section}>
          {isMultiMentor ? (
            <button className={styles.backBtn} onClick={() => setStep(0)}>
              <ChevronLeft size={16} />
              Back
            </button>
          ) : null}
          {sessionTypes.length === 0 ? (
            <div className={styles.emptyState}>
              <CalendarCheck size={32} />
              <p>No session types are available yet.</p>
            </div>
          ) : (
            <div className={styles.typeGrid}>
              {sessionTypes.map((st) => (
                <button
                  className={styles.typeCard}
                  key={st.id}
                  onClick={() => {
                    setSelectedType(st);
                    setStep(2);
                  }}
                >
                  <p className={styles.typeName}>{st.name}</p>
                  <div className={styles.typeMeta}>
                    <span>
                      <Clock size={13} />
                      {st.duration_minutes} min
                    </span>
                    {st.max_participants > 1 ? (
                      <span>
                        <Users size={13} />
                        Up to {st.max_participants}
                      </span>
                    ) : null}
                    {st.requires_approval ? (
                      <span className={styles.approvalBadge}>Requires approval</span>
                    ) : null}
                  </div>
                  {st.description ? (
                    <p className={styles.typeDesc}>{st.description}</p>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {/* Step 2 — Pick a slot */}
      {step === 2 && selectedType ? (
        <section className={styles.section}>
          <button className={styles.backBtn} onClick={() => setStep(1)}>
            <ChevronLeft size={16} />
            Back
          </button>
          <p className={styles.sectionTitle}>
            {selectedType.name} — {selectedType.duration_minutes} min
          </p>
          {slotsLoading ? <p className={styles.loading}>Loading available slots…</p> : null}
          {slotsError ? <p className={styles.errorText}>{slotsError}</p> : null}
          {!slotsLoading && !slotsError && availableDates.length === 0 ? (
            <div className={styles.emptyState}>
              <CalendarCheck size={32} />
              <p>No slots available in the booking window. Check back later.</p>
            </div>
          ) : null}
          {!slotsLoading && availableDates.length > 0 ? (
            <>
              <div className={styles.dateTabs}>
                {availableDates.map((d) => (
                  <button
                    className={`${styles.dateTab} ${selectedDate === d ? styles.dateTabActive : ""}`}
                    key={d}
                    onClick={() => {
                      setSelectedDate(d);
                      setSelectedSlot(null);
                    }}
                  >
                    {formatDate(slotsByDate[d][0].startsAt)}
                  </button>
                ))}
              </div>
              {selectedDate ? (
                <div className={styles.timeGrid}>
                  {(slotsByDate[selectedDate] ?? []).map((slot) => (
                    <button
                      className={`${styles.timeSlot} ${selectedSlot?.startsAt === slot.startsAt ? styles.timeSlotActive : ""}`}
                      key={slot.startsAt}
                      onClick={() => setSelectedSlot(slot)}
                    >
                      {formatTime(slot.startsAt)}
                    </button>
                  ))}
                </div>
              ) : null}
              {selectedSlot ? (
                <div className={styles.slotActions}>
                  <button className={styles.primaryBtn} onClick={() => setStep(3)}>
                    Continue
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      {/* Step 3 — Confirm */}
      {step === 3 && selectedType && selectedSlot ? (
        <section className={styles.section}>
          <button className={styles.backBtn} onClick={() => setStep(2)}>
            <ChevronLeft size={16} />
            Back
          </button>
          <p className={styles.sectionTitle}>Confirm your booking</p>
          <div className={styles.confirmCard}>
            {selectedMentor && isMultiMentor ? (
              <div className={styles.confirmRow}>
                <span className={styles.confirmLabel}>Mentor</span>
                <span>{selectedMentor.name}</span>
              </div>
            ) : null}
            <div className={styles.confirmRow}>
              <span className={styles.confirmLabel}>Session</span>
              <span>{selectedType.name}</span>
            </div>
            <div className={styles.confirmRow}>
              <span className={styles.confirmLabel}>Duration</span>
              <span>{selectedType.duration_minutes} min</span>
            </div>
            <div className={styles.confirmRow}>
              <span className={styles.confirmLabel}>Date &amp; time</span>
              <span>{formatDateTime(selectedSlot.startsAt)}</span>
            </div>
            {selectedType.requires_approval ? (
              <p className={styles.approvalNotice}>
                This session requires mentor approval. You&apos;ll be notified once
                confirmed.
              </p>
            ) : null}
          </div>
          <div className={styles.notesGroup}>
            <label className={styles.notesLabel} htmlFor="student-notes">
              Notes for your mentor (optional)
            </label>
            <textarea
              className={styles.notesArea}
              id="student-notes"
              maxLength={500}
              onChange={(e) => setStudentNotes(e.target.value)}
              placeholder="What would you like to discuss?"
              rows={4}
              value={studentNotes}
            />
          </div>
          {submitError ? <p className={styles.errorText}>{submitError}</p> : null}
          <div className={styles.confirmActions}>
            <button
              className={styles.primaryBtn}
              disabled={submitting}
              onClick={handleBook}
            >
              {submitting ? "Booking…" : "Confirm booking"}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
