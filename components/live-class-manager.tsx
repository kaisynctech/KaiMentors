"use client";

import { CalendarDays, Loader2, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./live-class-manager.module.css";

type ClassStatus = "draft" | "published" | "archived";
type RoomStatus = "scheduled" | "live" | "ended";
type Provider = "zoom" | "google_meet" | "teams" | "other";

interface LiveClass {
  id: string;
  title: string;
  description: string | null;
  provider: Provider;
  meeting_id: string | null;
  join_url: string | null;
  starts_at: string;
  ends_at: string | null;
  status: ClassStatus;
  room_status: RoomStatus;
  recording_enabled: boolean;
  recording_url: string | null;
}

interface Props {
  classes: LiveClass[];
}

const PROVIDER_LABELS: Record<Provider, string> = {
  zoom: "Zoom",
  google_meet: "Google Meet",
  teams: "Microsoft Teams",
  other: "Other",
};

function formatDateTime(startsAt: string, endsAt: string | null) {
  const start = new Date(startsAt);
  const day = start.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const startTime = start.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  if (!endsAt) return `${day} · ${startTime}`;
  const endTime = new Date(endsAt).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${day} · ${startTime} – ${endTime}`;
}

function toLocalDatetimeValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toLocalTimeValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localDatetimeToISO(val: string) {
  return new Date(val).toISOString();
}

function combineStartAndEndTime(startsAtIso: string, endTimeVal: string) {
  const base = new Date(startsAtIso);
  const [h, m] = endTimeVal.split(":").map(Number);
  base.setHours(h, m, 0, 0);
  return base.toISOString();
}

export function LiveClassManager({ classes: initial }: Props) {
  const router = useRouter();
  const [classes, setClasses] = useState<LiveClass[]>(initial);
  const [selected, setSelected] = useState<LiveClass | null>(null);
  const [creating, setCreating] = useState(false);

  // form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [provider, setProvider] = useState<Provider>("zoom");
  const [meetingId, setMeetingId] = useState("");
  const [meetingPasscode, setMeetingPasscode] = useState("");
  const [joinUrl, setJoinUrl] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAtTime, setEndsAtTime] = useState("");
  const [recordingEnabled, setRecordingEnabled] = useState(false);
  const [publishedToggle, setPublishedToggle] = useState(false);

  // async state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<LiveClass | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // recording URL inline edit
  const [recordingUrlDraft, setRecordingUrlDraft] = useState("");
  const [savingRecUrl, setSavingRecUrl] = useState(false);

  function openCreate() {
    setSelected(null);
    setCreating(true);
    setTitle("");
    setDescription("");
    setProvider("zoom");
    setMeetingId("");
    setMeetingPasscode("");
    setJoinUrl("");
    setStartsAt("");
    setEndsAtTime("");
    setRecordingEnabled(false);
    setPublishedToggle(false);
    setError(null);
  }

  function openEdit(cls: LiveClass) {
    setCreating(false);
    setSelected(cls);
    setTitle(cls.title);
    setDescription(cls.description ?? "");
    setProvider(cls.provider);
    setMeetingId(cls.meeting_id ?? "");
    setMeetingPasscode("");
    setJoinUrl(cls.join_url ?? "");
    setStartsAt(cls.starts_at ? toLocalDatetimeValue(cls.starts_at) : "");
    setEndsAtTime(cls.ends_at ? toLocalTimeValue(cls.ends_at) : "");
    setRecordingEnabled(cls.recording_enabled);
    setPublishedToggle(cls.status === "published");
    setError(null);
    setRecordingUrlDraft(cls.recording_url ?? "");
  }

  function closePanel() {
    setSelected(null);
    setCreating(false);
    setError(null);
  }

  async function handleSave() {
    setError(null);
    if (!title.trim()) { setError("Title is required."); return; }
    if (!startsAt) { setError("Start date/time is required."); return; }
    if (provider === "zoom" && !meetingId.trim()) { setError("Meeting ID is required for Zoom."); return; }
    if (provider !== "zoom" && !joinUrl.trim()) { setError("Join URL is required."); return; }

    const startsAtIso = localDatetimeToISO(startsAt);
    const endsAtIso = endsAtTime ? combineStartAndEndTime(startsAtIso, endsAtTime) : null;

    setSaving(true);
    try {
      if (creating) {
        const res = await fetch("/api/live-classes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim() || null,
            provider,
            meetingId: provider === "zoom" ? meetingId.trim() || null : null,
            meetingPasscode: provider === "zoom" ? meetingPasscode.trim() || null : null,
            joinUrl: provider !== "zoom" ? joinUrl.trim() || null : null,
            startsAt: startsAtIso,
            endsAt: endsAtIso,
            recordingEnabled,
          }),
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error ?? "Failed to create class."); return; }

        const newCls: LiveClass = {
          id: json.id,
          title: title.trim(),
          description: description.trim() || null,
          provider,
          meeting_id: provider === "zoom" ? meetingId.trim() || null : null,
          join_url: provider !== "zoom" ? joinUrl.trim() || null : null,
          starts_at: startsAtIso,
          ends_at: endsAtIso,
          status: "draft",
          room_status: "scheduled",
          recording_enabled: recordingEnabled,
          recording_url: null,
        };
        setClasses((prev) => [newCls, ...prev].sort((a, b) => b.starts_at.localeCompare(a.starts_at)));
        setCreating(false);
        setSelected(newCls);
      } else if (selected) {
        const patch: Record<string, unknown> = {
          title: title.trim(),
          description: description.trim() || null,
          provider,
          meetingId: provider === "zoom" ? meetingId.trim() || null : null,
          meetingPasscode: provider === "zoom" && meetingPasscode.trim() ? meetingPasscode.trim() : undefined,
          joinUrl: provider !== "zoom" ? joinUrl.trim() || null : null,
          startsAt: startsAtIso,
          endsAt: endsAtIso,
          status: publishedToggle ? "published" : "draft",
          recordingEnabled,
        };
        const res = await fetch(`/api/live-classes/${selected.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error ?? "Failed to save changes."); return; }

        const updated: LiveClass = {
          ...selected,
          title: title.trim(),
          description: description.trim() || null,
          provider,
          meeting_id: provider === "zoom" ? meetingId.trim() || null : null,
          join_url: provider !== "zoom" ? joinUrl.trim() || null : null,
          starts_at: startsAtIso,
          ends_at: endsAtIso,
          status: publishedToggle ? "published" : "draft",
          recording_enabled: recordingEnabled,
        };
        setClasses((prev) =>
          prev.map((c) => (c.id === selected.id ? updated : c)).sort((a, b) => b.starts_at.localeCompare(a.starts_at)),
        );
        setSelected(updated);
      }
    } finally {
      setSaving(false);
    }
  }

  async function patchRoomStatus(cls: LiveClass, roomStatus: RoomStatus) {
    const res = await fetch(`/api/live-classes/${cls.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomStatus }),
    });
    if (!res.ok) return;
    const updated = { ...cls, room_status: roomStatus };
    setClasses((prev) => prev.map((c) => (c.id === cls.id ? updated : c)));
    setSelected(updated);
    if (roomStatus === "live") {
      router.push(`/dashboard/live-classes/${cls.id}/host`);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/live-classes/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        setDeleteError(json.error ?? "Failed to delete.");
        return;
      }
      setClasses((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      if (selected?.id === deleteTarget.id) { setSelected(null); setCreating(false); }
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  async function saveRecordingUrl() {
    if (!selected) return;
    setSavingRecUrl(true);
    try {
      const res = await fetch(`/api/live-classes/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordingUrl: recordingUrlDraft.trim() || null }),
      });
      if (!res.ok) return;
      const updated = { ...selected, recording_url: recordingUrlDraft.trim() || null };
      setClasses((prev) => prev.map((c) => (c.id === selected.id ? updated : c)));
      setSelected(updated);
    } finally {
      setSavingRecUrl(false);
    }
  }

  const showForm = creating || selected !== null;

  return (
    <div className={styles.workspace}>
      {/* ── Left panel ─────────────────────────────────── */}
      <div className={styles.listPanel}>
        <div className={styles.listHeader}>
          <div>
            <p className={styles.eyebrow}>Sessions</p>
            <h2>Live Classes</h2>
          </div>
          <button className={styles.scheduleBtn} onClick={openCreate} type="button">
            <Plus size={13} />
            Schedule class
          </button>
        </div>

        {classes.length === 0 ? (
          <div className={styles.empty}>
            <CalendarDays size={32} />
            <h3>No classes yet</h3>
            <p>Schedule your first live session to get started.</p>
          </div>
        ) : (
          <ul className={styles.classList}>
            {classes.map((cls) => (
              <li
                className={`${styles.classRow} ${selected?.id === cls.id || (creating && false) ? styles.classRowActive : ""}`}
                key={cls.id}
                onClick={() => openEdit(cls)}
              >
                <div className={styles.classRowMain}>
                  <div className={styles.classRowTop}>
                    <span className={`${styles.providerBadge} ${styles[`provider_${cls.provider}`]}`}>
                      {PROVIDER_LABELS[cls.provider]}
                    </span>
                    {cls.room_status === "live" && (
                      <span className={styles.liveBadge}>
                        <span className={styles.liveDot} />
                        Live
                      </span>
                    )}
                    <span className={`${styles.statusBadge} ${cls.status === "published" ? styles.statusPublished : styles.statusDraft}`}>
                      {cls.status === "published" ? "Published" : "Draft"}
                    </span>
                  </div>
                  <p className={styles.classTitle}>{cls.title}</p>
                  <p className={styles.classDate}>{formatDateTime(cls.starts_at, cls.ends_at)}</p>
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
            <CalendarDays size={36} />
            <p>Select a class to edit, or schedule a new one.</p>
          </div>
        ) : (
          <div className={styles.form}>
            <div className={styles.formHeader}>
              <h2>{creating ? "Schedule a class" : "Edit class"}</h2>
              <button className={styles.closeBtn} onClick={closePanel} type="button">
                <X size={15} />
              </button>
            </div>

            <div className={styles.formBody}>
              {/* Title */}
              <label className={styles.fieldLabel}>
                Title <span className={styles.required}>*</span>
                <input
                  className={styles.input}
                  maxLength={120}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Weekly live Q&A"
                  type="text"
                  value={title}
                />
              </label>

              {/* Description */}
              <label className={styles.fieldLabel}>
                Description
                <textarea
                  className={styles.textarea}
                  maxLength={600}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional — shown to students"
                  rows={3}
                  value={description}
                />
              </label>

              {/* Provider */}
              <label className={styles.fieldLabel}>
                Provider <span className={styles.required}>*</span>
                <select
                  className={styles.select}
                  onChange={(e) => setProvider(e.target.value as Provider)}
                  value={provider}
                >
                  <option value="zoom">Zoom</option>
                  <option value="google_meet">Google Meet</option>
                  <option value="teams">Microsoft Teams</option>
                  <option value="other">Other</option>
                </select>
              </label>

              {/* Zoom fields */}
              {provider === "zoom" && (
                <>
                  <label className={styles.fieldLabel}>
                    Meeting ID <span className={styles.required}>*</span>
                    <input
                      className={styles.input}
                      maxLength={50}
                      onChange={(e) => setMeetingId(e.target.value)}
                      placeholder="e.g. 123 456 7890"
                      type="text"
                      value={meetingId}
                    />
                  </label>
                  <label className={styles.fieldLabel}>
                    Passcode
                    <input
                      className={styles.input}
                      maxLength={50}
                      onChange={(e) => setMeetingPasscode(e.target.value)}
                      placeholder="Optional but recommended"
                      type="text"
                      value={meetingPasscode}
                    />
                  </label>
                  <div className={styles.toggleRow}>
                    <div>
                      <p className={styles.toggleLabel}>Record this session</p>
                      <p className={styles.toggleHint}>Enable cloud recording in your Zoom settings for this meeting</p>
                    </div>
                    <button
                      className={`${styles.toggle} ${recordingEnabled ? styles.toggleOn : ""}`}
                      onClick={() => setRecordingEnabled((v) => !v)}
                      type="button"
                    >
                      <span className={styles.toggleThumb} />
                    </button>
                  </div>
                </>
              )}

              {/* Non-Zoom join URL */}
              {provider !== "zoom" && (
                <label className={styles.fieldLabel}>
                  Join URL <span className={styles.required}>*</span>
                  <input
                    className={styles.input}
                    onChange={(e) => setJoinUrl(e.target.value)}
                    placeholder="https://meet.google.com/..."
                    type="url"
                    value={joinUrl}
                  />
                </label>
              )}

              {/* Date/time */}
              <div className={styles.twoColumns}>
                <label className={styles.fieldLabel}>
                  Start date/time <span className={styles.required}>*</span>
                  <input
                    className={styles.input}
                    onChange={(e) => setStartsAt(e.target.value)}
                    type="datetime-local"
                    value={startsAt}
                  />
                </label>
                <label className={styles.fieldLabel}>
                  End time
                  <input
                    className={styles.input}
                    onChange={(e) => setEndsAtTime(e.target.value)}
                    type="time"
                    value={endsAtTime}
                  />
                </label>
              </div>

              {/* Status toggle (edit only) */}
              {!creating && (
                <div className={styles.toggleRow}>
                  <div>
                    <p className={styles.toggleLabel}>Published</p>
                    <p className={styles.toggleHint}>Students can see this class when published</p>
                  </div>
                  <button
                    className={`${styles.toggle} ${publishedToggle ? styles.toggleOn : ""}`}
                    onClick={() => setPublishedToggle((v) => !v)}
                    type="button"
                  >
                    <span className={styles.toggleThumb} />
                  </button>
                </div>
              )}

              {error && <p className={styles.errorMsg}>{error}</p>}
            </div>

            {/* Session lifecycle actions (edit only) */}
            {selected && (
              <div className={styles.lifecycleSection}>
                {selected.status === "published" && selected.room_status === "scheduled" && (
                  <button
                    className={styles.startBtn}
                    onClick={() => patchRoomStatus(selected, "live")}
                    type="button"
                  >
                    Start session
                  </button>
                )}
                {selected.room_status === "live" && (
                  <button
                    className={styles.endBtn}
                    onClick={() => patchRoomStatus(selected, "ended")}
                    type="button"
                  >
                    End session
                  </button>
                )}
                {selected.room_status === "ended" && selected.recording_enabled && (
                  <div className={styles.recordingRow}>
                    <input
                      className={styles.input}
                      onChange={(e) => setRecordingUrlDraft(e.target.value)}
                      placeholder="Paste recording URL…"
                      type="url"
                      value={recordingUrlDraft}
                    />
                    <button
                      className={styles.saveRecBtn}
                      disabled={savingRecUrl}
                      onClick={saveRecordingUrl}
                      type="button"
                    >
                      {savingRecUrl ? <Loader2 className={styles.spin} size={13} /> : "Save"}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className={styles.formFooter}>
              {selected && (
                <button
                  className={styles.deleteBtn}
                  onClick={() => setDeleteTarget(selected)}
                  type="button"
                >
                  <Trash2 size={13} />
                  Delete
                </button>
              )}
              <div className={styles.footerActions}>
                <button className={styles.cancelBtn} onClick={closePanel} type="button">
                  Cancel
                </button>
                <button
                  className={styles.saveBtn}
                  disabled={saving}
                  onClick={handleSave}
                  type="button"
                >
                  {saving ? <Loader2 className={styles.spin} size={13} /> : creating ? "Create class" : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Delete confirmation modal ─────────────────── */}
      {deleteTarget && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>Delete class?</h2>
              <button className={styles.closeBtn} onClick={() => setDeleteTarget(null)} type="button">
                <X size={15} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <p>
                Delete <strong>{deleteTarget.title}</strong>? This cannot be undone.
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
