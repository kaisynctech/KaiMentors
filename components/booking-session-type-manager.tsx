"use client";

import { Info, Loader2, Plus, X } from "lucide-react";
import { useState } from "react";
import styles from "./booking-session-type-manager.module.css";

// ── Types ────────────────────────────────────────────

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

interface AvailabilityWindow {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

interface AvailabilityOverride {
  id: string;
  override_date: string;
  start_time: string | null;
  end_time: string | null;
  is_blocked: boolean;
  reason: string | null;
}

interface Props {
  sessionTypes: SessionType[];
  windows: AvailabilityWindow[];
  overrides: AvailabilityOverride[];
  mentorTimezone: string;
}

// ── Constants ────────────────────────────────────────

const ADVANCE_OPTIONS = [
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "4 weeks", days: 28 },
  { label: "6 weeks", days: 42 },
  { label: "8 weeks", days: 56 },
];

const NOTICE_OPTIONS = [
  { label: "1 hour", hours: 1 },
  { label: "2 hours", hours: 2 },
  { label: "4 hours", hours: 4 },
  { label: "12 hours", hours: 12 },
  { label: "24 hours", hours: 24 },
  { label: "48 hours", hours: 48 },
];

const CANCEL_OPTIONS = [
  { label: "None", hours: 0 },
  { label: "4 hours", hours: 4 },
  { label: "8 hours", hours: 8 },
  { label: "12 hours", hours: 12 },
  { label: "24 hours", hours: 24 },
  { label: "48 hours", hours: 48 },
];

const DAYS = [
  { label: "Monday", short: "Mon", value: 1 },
  { label: "Tuesday", short: "Tue", value: 2 },
  { label: "Wednesday", short: "Wed", value: 3 },
  { label: "Thursday", short: "Thu", value: 4 },
  { label: "Friday", short: "Fri", value: 5 },
  { label: "Saturday", short: "Sat", value: 6 },
  { label: "Sunday", short: "Sun", value: 0 },
];

// ── Helpers ──────────────────────────────────────────

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes === 60) return "1 hour";
  if (minutes === 90) return "1.5 hours";
  return `${minutes / 60} hours`;
}

function formatParticipants(max: number): string {
  return max === 1 ? "1-on-1" : `Up to ${max}`;
}

function toHHMM(time: string): string {
  return time.slice(0, 5);
}

function formatOverrideDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ── Main component ───────────────────────────────────

export function BookingSessionTypeManager({
  sessionTypes: initial,
  windows: initialWindows,
  overrides: initialOverrides,
  mentorTimezone,
}: Props) {
  const [activeTab, setActiveTab] = useState<"session-types" | "availability">("session-types");

  return (
    <div className={styles.bookingManager}>
      {/* Tab bar */}
      <div className={styles.tabBar}>
        <button
          className={`${styles.tabBtn} ${activeTab === "session-types" ? styles.activeTabBtn : ""}`}
          onClick={() => setActiveTab("session-types")}
          type="button"
        >
          Session Types
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === "availability" ? styles.activeTabBtn : ""}`}
          onClick={() => setActiveTab("availability")}
          type="button"
        >
          Availability
        </button>
      </div>

      {activeTab === "session-types" && (
        <SessionTypesPanel initialSessionTypes={initial} />
      )}

      {activeTab === "availability" && (
        <AvailabilityPanel
          initialOverrides={initialOverrides}
          initialWindows={initialWindows}
          mentorTimezone={mentorTimezone}
        />
      )}
    </div>
  );
}

// ── Session Types Panel ──────────────────────────────

function SessionTypesPanel({ initialSessionTypes }: { initialSessionTypes: SessionType[] }) {
  const [sessionTypes, setSessionTypes] = useState<SessionType[]>(initialSessionTypes);
  const [selected, setSelected] = useState<SessionType | null>(null);
  const [creating, setCreating] = useState(false);

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

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
            name: name.trim(), description: description.trim() || null,
            durationMinutes, maxParticipants, bufferMinutes, requiresApproval,
            advanceBookingDays, minNoticeHours, cancellationHours,
            zoomMeetingId: zoomMeetingId.trim() || null,
            zoomPasscode: zoomPasscode.trim() || null,
          }),
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error ?? "Failed to create."); return; }
        const newSt: SessionType = {
          id: json.id, name: name.trim(), description: description.trim() || null,
          duration_minutes: durationMinutes, max_participants: maxParticipants,
          buffer_minutes: bufferMinutes, requires_approval: requiresApproval,
          advance_booking_days: advanceBookingDays, min_notice_hours: minNoticeHours,
          cancellation_hours: cancellationHours, zoom_meeting_id: zoomMeetingId.trim() || null,
          is_active: true, sort_order: 0,
        };
        setSessionTypes((prev) => [...prev, newSt]);
        setCreating(false);
        setSelected(newSt);
      } else if (selected) {
        const res = await fetch(`/api/bookings/session-types/${selected.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(), description: description.trim() || null,
            durationMinutes, maxParticipants, bufferMinutes, requiresApproval,
            advanceBookingDays, minNoticeHours, cancellationHours,
            zoomMeetingId: zoomMeetingId.trim() || null,
            zoomPasscode: zoomPasscode.trim() ? zoomPasscode.trim() : undefined,
          }),
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error ?? "Failed to save."); return; }
        const updated: SessionType = {
          ...selected, name: name.trim(), description: description.trim() || null,
          duration_minutes: durationMinutes, max_participants: maxParticipants,
          buffer_minutes: bufferMinutes, requires_approval: requiresApproval,
          advance_booking_days: advanceBookingDays, min_notice_hours: minNoticeHours,
          cancellation_hours: cancellationHours, zoom_meeting_id: zoomMeetingId.trim() || null,
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
      const res = await fetch(`/api/bookings/session-types/${deleteTarget.id}`, { method: "DELETE" });
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
      {/* Left panel */}
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

      {/* Right panel */}
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
              <label className={styles.fieldLabel}>
                Session name <span className={styles.required}>*</span>
                <input className={styles.input} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Strategy Review" type="text" value={name} />
              </label>

              <label className={styles.fieldLabel}>
                Description
                <textarea className={styles.textarea} maxLength={500} onChange={(e) => setDescription(e.target.value)} placeholder="Optional — shown to students when booking" rows={3} value={description} />
              </label>

              <div className={styles.twoColumns}>
                <label className={styles.fieldLabel}>
                  Duration <span className={styles.required}>*</span>
                  <select className={styles.select} onChange={(e) => setDurationMinutes(Number(e.target.value))} value={durationMinutes}>
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
                  <input className={styles.input} max={50} min={1} onChange={(e) => setMaxParticipants(Math.max(1, Math.min(50, Number(e.target.value))))} type="number" value={maxParticipants} />
                  <span className={styles.fieldHint}>1 = one-to-one, 2+ = group</span>
                </label>
              </div>

              <label className={styles.fieldLabel}>
                Buffer time
                <select className={styles.select} onChange={(e) => setBufferMinutes(Number(e.target.value))} value={bufferMinutes}>
                  <option value={0}>None</option>
                  <option value={5}>5 min</option>
                  <option value={10}>10 min</option>
                  <option value={15}>15 min</option>
                  <option value={30}>30 min</option>
                </select>
                <span className={styles.fieldHint}>Blocked time after each session ends</span>
              </label>

              <div className={styles.toggleRow}>
                <div>
                  <p className={styles.toggleLabel}>Requires approval</p>
                  <p className={styles.toggleHint}>You manually confirm each booking request</p>
                </div>
                <button className={`${styles.toggle} ${requiresApproval ? styles.toggleOn : ""}`} onClick={() => setRequiresApproval((v) => !v)} type="button">
                  <span className={styles.toggleThumb} />
                </button>
              </div>

              <div className={styles.sectionHeading}>Booking rules</div>

              <label className={styles.fieldLabel}>
                Students can book up to
                <select className={styles.select} onChange={(e) => setAdvanceBookingDays(Number(e.target.value))} value={advanceBookingDays}>
                  {ADVANCE_OPTIONS.map((o) => <option key={o.days} value={o.days}>{o.label} ahead</option>)}
                </select>
              </label>

              <div className={styles.twoColumns}>
                <label className={styles.fieldLabel}>
                  Minimum notice
                  <select className={styles.select} onChange={(e) => setMinNoticeHours(Number(e.target.value))} value={minNoticeHours}>
                    {NOTICE_OPTIONS.map((o) => <option key={o.hours} value={o.hours}>{o.label}</option>)}
                  </select>
                </label>
                <label className={styles.fieldLabel}>
                  Cancellation window
                  <select className={styles.select} onChange={(e) => setCancellationHours(Number(e.target.value))} value={cancellationHours}>
                    {CANCEL_OPTIONS.map((o) => <option key={o.hours} value={o.hours}>{o.label}</option>)}
                  </select>
                </label>
              </div>

              <div className={styles.sectionHeading}>Zoom</div>

              <label className={styles.fieldLabel}>
                Zoom Meeting ID
                <input className={styles.input} maxLength={50} onChange={(e) => setZoomMeetingId(e.target.value)} placeholder="e.g. 123 456 7890" type="text" value={zoomMeetingId} />
                <span className={styles.fieldHint}>Students join this meeting when their booking starts</span>
              </label>

              <label className={styles.fieldLabel}>
                Zoom Passcode
                <input autoComplete="new-password" className={styles.input} maxLength={50} onChange={(e) => setZoomPasscode(e.target.value)} placeholder={selected ? "Leave blank to keep existing" : "Optional"} type="password" value={zoomPasscode} />
              </label>

              {error && <p className={styles.errorMsg}>{error}</p>}
            </div>

            <div className={styles.formFooter}>
              <div className={styles.footerLeft}>
                {selected && (
                  <>
                    <button className={styles.toggleActiveBtn} onClick={() => toggleActive(selected)} type="button">
                      {selected.is_active ? "Deactivate" : "Activate"}
                    </button>
                    <button className={styles.deleteBtn} onClick={() => setDeleteTarget(selected)} type="button">
                      Delete
                    </button>
                  </>
                )}
              </div>
              <div className={styles.footerRight}>
                <button className={styles.cancelBtn} onClick={closePanel} type="button">Cancel</button>
                <button className={styles.saveBtn} disabled={saving} onClick={handleSave} type="button">
                  {saving ? <Loader2 className={styles.spin} size={13} /> : creating ? "Create" : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {deleteTarget && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>Delete session type?</h2>
              <button className={styles.closeBtn} onClick={() => setDeleteTarget(null)} type="button"><X size={15} /></button>
            </div>
            <div className={styles.modalBody}>
              <p>Delete <strong>{deleteTarget.name}</strong>? This cannot be undone. Session types with active bookings cannot be deleted.</p>
              {deleteError && <p className={styles.errorMsg}>{deleteError}</p>}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setDeleteTarget(null)} type="button">Cancel</button>
              <button className={styles.deleteConfirmBtn} disabled={deleting} onClick={handleDelete} type="button">
                {deleting ? <Loader2 className={styles.spin} size={13} /> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Availability Panel ───────────────────────────────

function AvailabilityPanel({
  initialWindows,
  initialOverrides,
  mentorTimezone,
}: {
  initialWindows: AvailabilityWindow[];
  initialOverrides: AvailabilityOverride[];
  mentorTimezone: string;
}) {
  const [windows, setWindows] = useState<AvailabilityWindow[]>(initialWindows);
  const [overrides, setOverrides] = useState<AvailabilityOverride[]>(initialOverrides);

  // Add-window inline form
  const [addingDay, setAddingDay] = useState<number | null>(null);
  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("17:00");
  const [windowSaving, setWindowSaving] = useState(false);
  const [windowError, setWindowError] = useState<string | null>(null);

  // Add-override form
  const [overrideType, setOverrideType] = useState<"block" | "open">("block");
  const [overrideDate, setOverrideDate] = useState("");
  const [overrideStart, setOverrideStart] = useState("09:00");
  const [overrideEnd, setOverrideEnd] = useState("17:00");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  function openAddWindow(day: number) {
    setAddingDay(day);
    setNewStart("09:00");
    setNewEnd("17:00");
    setWindowError(null);
  }

  async function saveWindow() {
    if (addingDay === null) return;
    if (newStart >= newEnd) { setWindowError("End time must be after start time."); return; }
    setWindowSaving(true);
    setWindowError(null);
    try {
      const res = await fetch("/api/bookings/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayOfWeek: addingDay, startTime: newStart, endTime: newEnd }),
      });
      const json = await res.json();
      if (!res.ok) { setWindowError(json.error ?? "Failed to save."); return; }
      const newWindow: AvailabilityWindow = {
        id: json.id,
        day_of_week: addingDay,
        start_time: newStart,
        end_time: newEnd,
        is_active: true,
      };
      setWindows((prev) =>
        [...prev, newWindow].sort((a, b) =>
          a.day_of_week !== b.day_of_week
            ? a.day_of_week - b.day_of_week
            : a.start_time.localeCompare(b.start_time),
        ),
      );
      setAddingDay(null);
    } finally {
      setWindowSaving(false);
    }
  }

  async function deleteWindow(id: string) {
    const res = await fetch(`/api/bookings/availability/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setWindows((prev) => prev.filter((w) => w.id !== id));
  }

  async function toggleWindow(w: AvailabilityWindow) {
    const res = await fetch(`/api/bookings/availability/${w.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !w.is_active }),
    });
    if (!res.ok) return;
    setWindows((prev) => prev.map((x) => (x.id === w.id ? { ...x, is_active: !x.is_active } : x)));
  }

  async function saveOverride() {
    if (!overrideDate) { setOverrideError("Date is required."); return; }
    if (overrideType === "open" && overrideStart >= overrideEnd) {
      setOverrideError("End time must be after start time.");
      return;
    }
    setOverrideSaving(true);
    setOverrideError(null);
    try {
      const body =
        overrideType === "block"
          ? { isBlocked: true, overrideDate, reason: overrideReason.trim() || undefined }
          : { isBlocked: false, overrideDate, startTime: overrideStart, endTime: overrideEnd, reason: overrideReason.trim() || undefined };
      const res = await fetch("/api/bookings/availability/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setOverrideError(json.error ?? "Failed to save."); return; }
      const newOv: AvailabilityOverride = {
        id: json.id,
        override_date: overrideDate,
        is_blocked: overrideType === "block",
        start_time: overrideType === "open" ? overrideStart : null,
        end_time: overrideType === "open" ? overrideEnd : null,
        reason: overrideReason.trim() || null,
      };
      setOverrides((prev) =>
        [...prev, newOv].sort((a, b) => a.override_date.localeCompare(b.override_date)),
      );
      setOverrideDate("");
      setOverrideReason("");
    } finally {
      setOverrideSaving(false);
    }
  }

  async function deleteOverride(id: string) {
    const res = await fetch(`/api/bookings/availability/overrides/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setOverrides((prev) => prev.filter((o) => o.id !== id));
  }

  return (
    <div className={styles.availabilityContent}>
      {/* Timezone notice */}
      <div className={styles.tzNotice}>
        <Info size={14} />
        <span>
          Your availability times are in <strong>{mentorTimezone}</strong> — students see them in their local timezone automatically.
        </span>
      </div>

      {/* Weekly schedule */}
      <div className={styles.availSection}>
        <p className={styles.availSectionTitle}>Weekly schedule</p>
        <div className={styles.weekGrid}>
          {DAYS.map((day) => {
            const dayWindows = windows
              .filter((w) => w.day_of_week === day.value)
              .sort((a, b) => a.start_time.localeCompare(b.start_time));
            const isAdding = addingDay === day.value;

            return (
              <div className={styles.dayRow} key={day.value}>
                <div className={styles.dayName}>{day.label}</div>
                <div className={styles.daySlots}>
                  {dayWindows.map((w) => (
                    <div
                      className={`${styles.windowChip} ${!w.is_active ? styles.windowChipInactive : ""}`}
                      key={w.id}
                    >
                      <button
                        className={styles.windowChipTime}
                        onClick={() => toggleWindow(w)}
                        title={w.is_active ? "Click to disable" : "Click to enable"}
                        type="button"
                      >
                        {toHHMM(w.start_time)} – {toHHMM(w.end_time)}
                      </button>
                      <button
                        className={styles.windowChipDelete}
                        onClick={() => deleteWindow(w.id)}
                        title="Remove window"
                        type="button"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}

                  {isAdding ? (
                    <div className={styles.addWindowInline}>
                      <input
                        className={styles.timeInput}
                        onChange={(e) => setNewStart(e.target.value)}
                        type="time"
                        value={newStart}
                      />
                      <span className={styles.timeSep}>–</span>
                      <input
                        className={styles.timeInput}
                        onChange={(e) => setNewEnd(e.target.value)}
                        type="time"
                        value={newEnd}
                      />
                      <button
                        className={styles.saveWindowBtn}
                        disabled={windowSaving}
                        onClick={saveWindow}
                        type="button"
                      >
                        {windowSaving ? <Loader2 className={styles.spin} size={11} /> : "Save"}
                      </button>
                      <button
                        className={styles.cancelWindowBtn}
                        onClick={() => { setAddingDay(null); setWindowError(null); }}
                        type="button"
                      >
                        <X size={11} />
                      </button>
                      {windowError && <span className={styles.inlineError}>{windowError}</span>}
                    </div>
                  ) : (
                    <button
                      className={styles.addWindowBtn}
                      onClick={() => openAddWindow(day.value)}
                      type="button"
                    >
                      <Plus size={11} />
                      Add
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Date overrides */}
      <div className={styles.availSection}>
        <p className={styles.availSectionTitle}>Date overrides</p>

        {overrides.length > 0 && (
          <div className={styles.overrideList}>
            {overrides.map((ov) => (
              <div className={styles.overrideRow} key={ov.id}>
                <span className={ov.is_blocked ? styles.blockedBadge : styles.extraBadge}>
                  {ov.is_blocked ? "Blocked" : "Extra hours"}
                </span>
                <span className={styles.overrideDate}>{formatOverrideDate(ov.override_date)}</span>
                {!ov.is_blocked && ov.start_time && ov.end_time && (
                  <span className={styles.overrideTime}>
                    {toHHMM(ov.start_time)} – {toHHMM(ov.end_time)}
                  </span>
                )}
                {ov.reason && <span className={styles.overrideReason}>{ov.reason}</span>}
                <button
                  className={styles.overrideDeleteBtn}
                  onClick={() => deleteOverride(ov.id)}
                  type="button"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add override form */}
        <div className={styles.addOverrideForm}>
          <p className={styles.addOverrideTitle}>Add override</p>

          <div className={styles.radioGroup}>
            <label className={styles.radioLabel}>
              <input
                checked={overrideType === "block"}
                name="overrideType"
                onChange={() => setOverrideType("block")}
                type="radio"
                value="block"
              />
              Block this date
            </label>
            <label className={styles.radioLabel}>
              <input
                checked={overrideType === "open"}
                name="overrideType"
                onChange={() => setOverrideType("open")}
                type="radio"
                value="open"
              />
              Open extra hours
            </label>
          </div>

          <div className={styles.overrideFormRow}>
            <input
              className={styles.input}
              onChange={(e) => setOverrideDate(e.target.value)}
              type="date"
              value={overrideDate}
            />

            {overrideType === "open" && (
              <>
                <input
                  className={styles.timeInput}
                  onChange={(e) => setOverrideStart(e.target.value)}
                  type="time"
                  value={overrideStart}
                />
                <span className={styles.timeSep}>–</span>
                <input
                  className={styles.timeInput}
                  onChange={(e) => setOverrideEnd(e.target.value)}
                  type="time"
                  value={overrideEnd}
                />
              </>
            )}
          </div>

          <input
            className={styles.input}
            maxLength={200}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder="Reason (optional)"
            type="text"
            value={overrideReason}
          />

          {overrideError && <p className={styles.errorMsg}>{overrideError}</p>}

          <button
            className={styles.saveOverrideBtn}
            disabled={overrideSaving}
            onClick={saveOverride}
            type="button"
          >
            {overrideSaving ? <Loader2 className={styles.spin} size={13} /> : "Add override"}
          </button>
        </div>
      </div>
    </div>
  );
}
