"use client";

import { Loader2, Plus, X } from "lucide-react";
import { useState } from "react";
import styles from "./booking-session-type-manager.module.css";

interface SessionType {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  max_participants: number;
  buffer_minutes: number;
  requires_approval: boolean;
  advance_booking_days: number;
  min_notice_hours: number;
  cancellation_hours: number;
  zoom_meeting_id: string | null;
  is_active: boolean;
  sort_order: number;
}

interface Props {
  sessionTypes: SessionType[];
  mentorTimezone: string;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes === 60) return "1 hour";
  if (minutes === 90) return "1.5 hours";
  return `${minutes / 60} hours`;
}

function formatParticipants(max: number): string {
  return max === 1 ? "1-on-1" : `Up to ${max}`;
}

const ADVANCE_OPTIONS: { label: string; days: number }[] = [
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "4 weeks", days: 28 },
  { label: "6 weeks", days: 42 },
  { label: "8 weeks", days: 56 },
];

const NOTICE_OPTIONS: { label: string; hours: number }[] = [
  { label: "1 hour", hours: 1 },
  { label: "2 hours", hours: 2 },
  { label: "4 hours", hours: 4 },
  { label: "12 hours", hours: 12 },
  { label: "24 hours", hours: 24 },
  { label: "48 hours", hours: 48 },
];

const CANCEL_OPTIONS: { label: string; hours: number }[] = [
  { label: "None", hours: 0 },
  { label: "4 hours", hours: 4 },
  { label: "8 hours", hours: 8 },
  { label: "12 hours", hours: 12 },
  { label: "24 hours", hours: 24 },
  { label: "48 hours", hours: 48 },
];

export function BookingSessionTypeManager({ sessionTypes: initial }: Props) {
  const [sessionTypes, setSessionTypes] = useState<SessionType[]>(initial);
  const [selected, setSelected] = useState<SessionType | null>(null);
  const [creating, setCreating] = useState(false);

  // form fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [maxParticipants, setMaxParticipants] = useState(1);
  const [bufferMinutes, setBufferMinutes] = useState(0);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [advanceBookingDays, setAdvanceBookingDays] = useState(14);
  const [minNoticeHours, setMinNoticeHours] = useState(24);
  const [cancellationHours, setCancellationHours] = useState(12);
  const [zoomMeetingId, setZoomMeetingId] = useState("");
  const [zoomPasscode, setZoomPasscode] = useState("");

  // async
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // delete
  const [deleteTarget, setDeleteTarget] = useState<SessionType | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function openCreate() {
    setSelected(null);
    setCreating(true);
    setName("");
    setDescription("");
    setDurationMinutes(60);
    setMaxParticipants(1);
    setBufferMinutes(0);
    setRequiresApproval(false);
    setAdvanceBookingDays(14);
    setMinNoticeHours(24);
    setCancellationHours(12);
    setZoomMeetingId("");
    setZoomPasscode("");
    setError(null);
  }

  function openEdit(st: SessionType) {
    setCreating(false);
    setSelected(st);
    setName(st.name);
    setDescription(st.description ?? "");
    setDurationMinutes(st.duration_minutes);
    setMaxParticipants(st.max_participants);
    setBufferMinutes(st.buffer_minutes);
    setRequiresApproval(st.requires_approval);
    setAdvanceBookingDays(st.advance_booking_days);
    setMinNoticeHours(st.min_notice_hours);
    setCancellationHours(st.cancellation_hours);
    setZoomMeetingId(st.zoom_meeting_id ?? "");
    setZoomPasscode("");
    setError(null);
  }

  function closePanel() {
    setSelected(null);
    setCreating(false);
    setError(null);
  }

  async function handleSave() {
    setError(null);
    if (!name.trim()) { setError("Session name is required."); return; }

    setSaving(true);
    try {
      if (creating) {
        const res = await fetch("/api/bookings/session-types", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
            durationMinutes,
            maxParticipants,
            bufferMinutes,
            requiresApproval,
            advanceBookingDays,
            minNoticeHours,
            cancellationHours,
            zoomMeetingId: zoomMeetingId.trim() || null,
            zoomPasscode: zoomPasscode.trim() || null,
          }),
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error ?? "Failed to create session type."); return; }

        const newSt: SessionType = {
          id: json.id,
          name: name.trim(),
          description: description.trim() || null,
          duration_minutes: durationMinutes,
          max_participants: maxParticipants,
          buffer_minutes: bufferMinutes,
          requires_approval: requiresApproval,
          advance_booking_days: advanceBookingDays,
          min_notice_hours: minNoticeHours,
          cancellation_hours: cancellationHours,
          zoom_meeting_id: zoomMeetingId.trim() || null,
          is_active: true,
          sort_order: 0,
        };
        setSessionTypes((prev) => [...prev, newSt]);
        setCreating(false);
        setSelected(newSt);
      } else if (selected) {
        const res = await fetch(`/api/bookings/session-types/${selected.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
            durationMinutes,
            maxParticipants,
            bufferMinutes,
            requiresApproval,
            advanceBookingDays,
            minNoticeHours,
            cancellationHours,
            zoomMeetingId: zoomMeetingId.trim() || null,
            zoomPasscode: zoomPasscode.trim() ? zoomPasscode.trim() : undefined,
          }),
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error ?? "Failed to save changes."); return; }

        const updated: SessionType = {
          ...selected,
          name: name.trim(),
          description: description.trim() || null,
          duration_minutes: durationMinutes,
          max_participants: maxParticipants,
          buffer_minutes: bufferMinutes,
          requires_approval: requiresApproval,
          advance_booking_days: advanceBookingDays,
          min_notice_hours: minNoticeHours,
          cancellation_hours: cancellationHours,
          zoom_meeting_id: zoomMeetingId.trim() || null,
        };
        setSessionTypes((prev) => prev.map((s) => (s.id === selected.id ? updated : s)));
        setSelected(updated);
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(st: SessionType) {
    const res = await fetch(`/api/bookings/session-types/${st.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !st.is_active }),
    });
    if (!res.ok) return;
    const updated = { ...st, is_active: !st.is_active };
    setSessionTypes((prev) => prev.map((s) => (s.id === st.id ? updated : s)));
    if (selected?.id === st.id) setSelected(updated);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/bookings/session-types/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) { setDeleteError(json.error ?? "Failed to delete."); return; }
      setSessionTypes((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      if (selected?.id === deleteTarget.id) { setSelected(null); setCreating(false); }
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  const showForm = creating || selected !== null;

  return (
    <div className={styles.workspace}>
      {/* ── Left panel ─────────────────────────────────── */}
      <div className={styles.listPanel}>
        <div className={styles.listHeader}>
          <div>
            <p className={styles.eyebrow}>Configuration</p>
            <h2>Session Types</h2>
          </div>
          <button className={styles.addBtn} onClick={openCreate} type="button">
            <Plus size={13} />
            Add session type
          </button>
        </div>

        {sessionTypes.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>No session types yet</p>
            <p>Create your first session type to start accepting bookings.</p>
          </div>
        ) : (
          <ul className={styles.typeList}>
            {sessionTypes.map((st) => (
              <li
                className={`${styles.typeRow} ${selected?.id === st.id ? styles.typeRowActive : ""}`}
                key={st.id}
                onClick={() => openEdit(st)}
              >
                <div className={styles.typeRowMain}>
                  <p className={styles.typeName}>{st.name}</p>
                  <div className={styles.typeBadges}>
                    <span className={styles.durationBadge}>{formatDuration(st.duration_minutes)}</span>
                    <span className={styles.participantBadge}>{formatParticipants(st.max_participants)}</span>
                    <span className={st.is_active ? styles.activeBadge : styles.inactiveBadge}>
                      {st.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Right panel ─────────────────────────────────── */}
      <div className={styles.detailPanel}>
        {!showForm ? (
          <div className={styles.detailEmpty}>
            <p>Select a session type to edit, or add a new one.</p>
          </div>
        ) : (
          <div className={styles.form}>
            <div className={styles.formHeader}>
              <h2>{creating ? "New session type" : "Edit session type"}</h2>
              <button className={styles.closeBtn} onClick={closePanel} type="button">
                <X size={15} />
              </button>
            </div>

            <div className={styles.formBody}>
              {/* Name */}
              <label className={styles.fieldLabel}>
                Session name <span className={styles.required}>*</span>
                <input
                  className={styles.input}
                  maxLength={80}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Strategy Review"
                  type="text"
                  value={name}
                />
              </label>

              {/* Description */}
              <label className={styles.fieldLabel}>
                Description
                <textarea
                  className={styles.textarea}
                  maxLength={500}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional — shown to students when booking"
                  rows={3}
                  value={description}
                />
              </label>

              {/* Duration + Max participants */}
              <div className={styles.twoColumns}>
                <label className={styles.fieldLabel}>
                  Duration <span className={styles.required}>*</span>
                  <select
                    className={styles.select}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    value={durationMinutes}
                  >
                    <option value={15}>15 min</option>
                    <option value={30}>30 min</option>
                    <option value={45}>45 min</option>
                    <option value={60}>60 min</option>
                    <option value={90}>90 min</option>
                    <option value={120}>2 hours</option>
                  </select>
                </label>
                <label className={styles.fieldLabel}>
                  Max participants <span className={styles.required}>*</span>
                  <input
                    className={styles.input}
                    max={50}
                    min={1}
                    onChange={(e) => setMaxParticipants(Math.max(1, Math.min(50, Number(e.target.value))))}
                    title="1 = one-to-one, 2+ = group"
                    type="number"
                    value={maxParticipants}
                  />
                  <span className={styles.fieldHint}>1 = one-to-one, 2+ = group</span>
                </label>
              </div>

              {/* Buffer */}
              <label className={styles.fieldLabel}>
                Buffer time
                <select
                  className={styles.select}
                  onChange={(e) => setBufferMinutes(Number(e.target.value))}
                  value={bufferMinutes}
                >
                  <option value={0}>None</option>
                  <option value={5}>5 min</option>
                  <option value={10}>10 min</option>
                  <option value={15}>15 min</option>
                  <option value={30}>30 min</option>
                </select>
                <span className={styles.fieldHint}>Blocked time after each session ends</span>
              </label>

              {/* Requires approval */}
              <div className={styles.toggleRow}>
                <div>
                  <p className={styles.toggleLabel}>Requires approval</p>
                  <p className={styles.toggleHint}>You manually confirm each booking request</p>
                </div>
                <button
                  className={`${styles.toggle} ${requiresApproval ? styles.toggleOn : ""}`}
                  onClick={() => setRequiresApproval((v) => !v)}
                  type="button"
                >
                  <span className={styles.toggleThumb} />
                </button>
              </div>

              {/* Booking rules */}
              <div className={styles.sectionHeading}>Booking rules</div>

              <label className={styles.fieldLabel}>
                Students can book up to
                <select
                  className={styles.select}
                  onChange={(e) => setAdvanceBookingDays(Number(e.target.value))}
                  value={advanceBookingDays}
                >
                  {ADVANCE_OPTIONS.map((o) => (
                    <option key={o.days} value={o.days}>{o.label} ahead</option>
                  ))}
                </select>
              </label>

              <div className={styles.twoColumns}>
                <label className={styles.fieldLabel}>
                  Minimum notice
                  <select
                    className={styles.select}
                    onChange={(e) => setMinNoticeHours(Number(e.target.value))}
                    value={minNoticeHours}
                  >
                    {NOTICE_OPTIONS.map((o) => (
                      <option key={o.hours} value={o.hours}>{o.label}</option>
                    ))}
                  </select>
                </label>
                <label className={styles.fieldLabel}>
                  Cancellation window
                  <select
                    className={styles.select}
                    onChange={(e) => setCancellationHours(Number(e.target.value))}
                    value={cancellationHours}
                  >
                    {CANCEL_OPTIONS.map((o) => (
                      <option key={o.hours} value={o.hours}>{o.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Zoom */}
              <div className={styles.sectionHeading}>Zoom</div>

              <label className={styles.fieldLabel}>
                Zoom Meeting ID
                <input
                  className={styles.input}
                  maxLength={50}
                  onChange={(e) => setZoomMeetingId(e.target.value)}
                  placeholder="e.g. 123 456 7890"
                  type="text"
                  value={zoomMeetingId}
                />
                <span className={styles.fieldHint}>Students join this meeting when their booking starts</span>
              </label>

              <label className={styles.fieldLabel}>
                Zoom Passcode
                <input
                  autoComplete="new-password"
                  className={styles.input}
                  maxLength={50}
                  onChange={(e) => setZoomPasscode(e.target.value)}
                  placeholder={selected ? "Leave blank to keep existing" : "Optional"}
                  type="password"
                  value={zoomPasscode}
                />
              </label>

              {error && <p className={styles.errorMsg}>{error}</p>}
            </div>

            <div className={styles.formFooter}>
              <div className={styles.footerLeft}>
                {selected && (
                  <>
                    <button
                      className={styles.toggleActiveBtn}
                      onClick={() => toggleActive(selected)}
                      type="button"
                    >
                      {selected.is_active ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      className={styles.deleteBtn}
                      onClick={() => setDeleteTarget(selected)}
                      type="button"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
              <div className={styles.footerRight}>
                <button className={styles.cancelBtn} onClick={closePanel} type="button">
                  Cancel
                </button>
                <button
                  className={styles.saveBtn}
                  disabled={saving}
                  onClick={handleSave}
                  type="button"
                >
                  {saving ? (
                    <Loader2 className={styles.spin} size={13} />
                  ) : creating ? (
                    "Create"
                  ) : (
                    "Save changes"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Delete modal ──────────────────────────────── */}
      {deleteTarget && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>Delete session type?</h2>
              <button className={styles.closeBtn} onClick={() => setDeleteTarget(null)} type="button">
                <X size={15} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <p>
                Delete <strong>{deleteTarget.name}</strong>? This cannot be undone.
                Session types with active bookings cannot be deleted.
              </p>
              {deleteError && <p className={styles.errorMsg}>{deleteError}</p>}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setDeleteTarget(null)} type="button">
                Cancel
              </button>
              <button
                className={styles.deleteConfirmBtn}
                disabled={deleting}
                onClick={handleDelete}
                type="button"
              >
                {deleting ? <Loader2 className={styles.spin} size={13} /> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
