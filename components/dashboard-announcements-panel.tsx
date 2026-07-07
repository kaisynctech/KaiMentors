"use client";

import { Bell, Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import styles from "./dashboard-announcements-panel.module.css";

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  status: "draft" | "published";
  is_pinned: boolean;
  published_at: string | null;
  updated_at: string;
}

interface Props {
  initialAnnouncements: AnnouncementRow[];
}

export function DashboardAnnouncementsPanel({
  initialAnnouncements,
}: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(initialAnnouncements);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  function openCreate() {
    setEditingId(null);
    setError("");
    setModalOpen(true);
  }

  function openEdit(row: AnnouncementRow) {
    setEditingId(row.id);
    setError("");
    setModalOpen(true);
  }

  async function saveAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const formData = new FormData(event.currentTarget);
    const payload = {
      title: String(formData.get("title") ?? ""),
      body: String(formData.get("body") ?? ""),
      publish: formData.get("publish") === "on",
      isPinned: formData.get("isPinned") === "on",
    };

    const response = await fetch(
      editingId ? `/api/announcements/${editingId}` : "/api/announcements",
      {
        method: editingId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          editingId
            ? {
                title: payload.title,
                body: payload.body,
                status: payload.publish ? "published" : "draft",
                isPinned: payload.isPinned,
              }
            : payload,
        ),
      },
    );
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(result.error ?? "The announcement could not be saved.");
      return;
    }

    const saved = result.announcement as AnnouncementRow;
    setRows((current) => {
      if (editingId) {
        return current.map((row) => (row.id === editingId ? saved : row));
      }
      return [saved, ...current];
    });
    setModalOpen(false);
    router.refresh();
  }

  async function patchAnnouncement(
    id: string,
    updates: Record<string, unknown>,
  ) {
    setBusyId(id);
    setError("");
    const response = await fetch(`/api/announcements/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(updates),
    });
    const result = await response.json();
    setBusyId(null);
    if (!response.ok) {
      setError(result.error ?? "The announcement could not be updated.");
      return;
    }
    setRows((current) =>
      current.map((row) =>
        row.id === id ? (result.announcement as AnnouncementRow) : row,
      ),
    );
    router.refresh();
  }

  async function deleteAnnouncement(id: string) {
    setBusyId(id);
    setError("");
    const response = await fetch(`/api/announcements/${id}`, {
      method: "DELETE",
    });
    const result = await response.json();
    setBusyId(null);
    if (!response.ok) {
      setError(result.error ?? "The announcement could not be deleted.");
      return;
    }
    setRows((current) => current.filter((row) => row.id !== id));
    router.refresh();
  }

  const editingRow = editingId
    ? rows.find((row) => row.id === editingId) ?? null
    : null;

  return (
    <article className={`card ${styles.panel}`}>
      <div className={styles.panelHeader}>
        <div>
          <h2>Announcements</h2>
          <p>
            Share seminars and important updates — not daily trade signals. Use
            Messages → Post signal for those.
          </p>
        </div>
        <button className={styles.newButton} onClick={openCreate} type="button">
          <Plus size={15} /> New announcement
        </button>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {rows.length ? (
        <div className={styles.list}>
          {rows.map((row) => (
            <div className={styles.row} key={row.id}>
              <div className={styles.rowBody}>
                <strong>{row.title}</strong>
                <p>{row.body}</p>
                <div className={styles.meta}>
                  <span
                    className={`${styles.badge} ${
                      row.status === "published" ? styles.badgePublished : ""
                    }`}
                  >
                    {row.status}
                  </span>
                  {row.is_pinned ? (
                    <span className={`${styles.badge} ${styles.badgePinned}`}>
                      Pinned
                    </span>
                  ) : null}
                  {row.published_at ? (
                    <span>
                      Published{" "}
                      {new Date(row.published_at).toLocaleDateString(undefined, {
                        dateStyle: "medium",
                      })}
                    </span>
                  ) : (
                    <span>Updated {new Date(row.updated_at).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
              <div className={styles.actions}>
                <button disabled={busyId === row.id} onClick={() => openEdit(row)} type="button">
                  Edit
                </button>
                {row.status === "published" ? (
                  <button
                    disabled={busyId === row.id}
                    onClick={() =>
                      void patchAnnouncement(row.id, { status: "draft" })
                    }
                    type="button"
                  >
                    Unpublish
                  </button>
                ) : (
                  <button
                    disabled={busyId === row.id}
                    onClick={() =>
                      void patchAnnouncement(row.id, { status: "published" })
                    }
                    type="button"
                  >
                    Publish
                  </button>
                )}
                <button
                  disabled={busyId === row.id}
                  onClick={() =>
                    void patchAnnouncement(row.id, { isPinned: !row.is_pinned })
                  }
                  type="button"
                >
                  {row.is_pinned ? "Unpin" : "Pin"}
                </button>
                <button
                  data-danger="true"
                  disabled={busyId === row.id}
                  onClick={() => void deleteAnnouncement(row.id)}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <Bell size={25} />
          <strong>No announcements yet</strong>
          <p>
            Share seminars and important updates — not daily trade signals. Use
            Messages → Post signal for those.
          </p>
        </div>
      )}

      {modalOpen ? (
        <div className={styles.modalOverlay}>
          <form className={styles.modal} onSubmit={saveAnnouncement}>
            <header>
              <div>
                <span>Overview</span>
                <h2>{editingRow ? "Edit announcement" : "New announcement"}</h2>
              </div>
              <button
                aria-label="Close"
                onClick={() => setModalOpen(false)}
                type="button"
              >
                <X size={18} />
              </button>
            </header>
            <label>
              Title
              <input
                defaultValue={editingRow?.title ?? ""}
                maxLength={160}
                name="title"
                placeholder="Weekly seminar reminder"
                required
              />
            </label>
            <label>
              Body
              <textarea
                defaultValue={editingRow?.body ?? ""}
                maxLength={10000}
                name="body"
                placeholder="Date, time, and what students should prepare..."
                required
                rows={6}
              />
            </label>
            <label className={styles.checkboxRow}>
              <input
                defaultChecked={editingRow?.status === "published"}
                name="publish"
                type="checkbox"
              />
              Publish now
            </label>
            <label className={styles.checkboxRow}>
              <input
                defaultChecked={editingRow?.is_pinned ?? false}
                name="isPinned"
                type="checkbox"
              />
              Pin to top
            </label>
            {error ? <p className={styles.error}>{error}</p> : null}
            <div className={styles.modalActions}>
              <button disabled={saving} type="submit">
                {saving ? <Loader2 className={styles.spin} size={16} /> : null}
                Save announcement
              </button>
              <button
                data-secondary="true"
                onClick={() => setModalOpen(false)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </article>
  );
}
