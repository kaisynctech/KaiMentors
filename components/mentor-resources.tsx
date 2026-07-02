"use client";

import Image from "next/image";
import { type FormEvent, useRef, useState, KeyboardEvent } from "react";
import { ExternalLink, FileText, Film, Loader2, Plus, Trash2, UploadCloud } from "lucide-react";
import styles from "./mentor-resources.module.css";

/* ── Types ──────────────────────────────────────────────────────────────── */

interface ResourceItem {
  id:           string;
  title:        string;
  description:  string | null;
  type:         "video" | "pdf" | "link";
  storagePath:  string | null;
  externalUrl:  string | null;
  thumbnailUrl: string | null;
  mediaUrl:     string | null;
  labels:       string[];
  accessScope:  "all_students" | "all_verified";
  status:       "draft" | "published";
  createdAt:    string;
}

interface Props {
  traderId:  string;
  resources: ResourceItem[];
}

type ResourceType = "video" | "pdf" | "link";

/* ── Upload helper ──────────────────────────────────────────────────────── */

async function uploadFile(
  file: File,
  subPath: "resources" | "resources/thumbnails",
): Promise<string> {
  const res = await fetch("/api/resources/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, contentType: file.type, subPath }),
  });
  if (!res.ok) throw new Error("Upload URL failed");
  const { signedUrl, storagePath } = (await res.json()) as {
    signedUrl: string;
    storagePath: string;
  };
  const upload = await fetch(signedUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!upload.ok) throw new Error("Upload failed");
  return storagePath;
}

/* ── Component ──────────────────────────────────────────────────────────── */

export function MentorResources({ resources: initial, traderId: _traderId }: Props) {
  const [resources, setResources] = useState(initial);
  const [showForm, setShowForm]   = useState(false);
  const [itemType, setItemType]   = useState<ResourceType>("video");
  const [labels, setLabels]       = useState<string[]>([]);
  const [labelInput, setLabelInput] = useState("");
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  /* Label chip helpers */
  function commitLabel() {
    const raw = labelInput.trim().replace(/,+$/, "");
    if (!raw || labels.includes(raw) || labels.length >= 10) return;
    setLabels((prev) => [...prev, raw]);
    setLabelInput("");
  }
  function onLabelKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commitLabel(); }
    if (e.key === "Backspace" && !labelInput) setLabels((prev) => prev.slice(0, -1));
  }

  /* Create resource */
  async function createResource(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError("");
    const fd = new FormData(e.currentTarget);

    let storagePath: string | undefined;
    if (itemType !== "link") {
      const file = fileRef.current?.files?.[0];
      if (!file) { setError("Please select a file."); setBusy(false); return; }
      try { storagePath = await uploadFile(file, "resources"); }
      catch { setError("Upload failed. Try again."); setBusy(false); return; }
    }

    const payload = {
      title:       String(fd.get("title")),
      description: String(fd.get("description") || "") || undefined,
      type:        itemType,
      storagePath,
      externalUrl: itemType === "link" ? String(fd.get("externalUrl")) : undefined,
      labels,
      accessScope: String(fd.get("accessScope")) as "all_students" | "all_verified",
      status:      String(fd.get("status")) as "draft" | "published",
    };

    const res = await fetch("/api/resources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as { resourceId?: string; error?: string };
    setBusy(false);
    if (!res.ok) { setError(json.error ?? "Failed to save."); return; }

    const newItem: ResourceItem = {
      id:           json.resourceId!,
      title:        payload.title,
      description:  payload.description ?? null,
      type:         itemType,
      storagePath:  storagePath ?? null,
      externalUrl:  payload.externalUrl ?? null,
      thumbnailUrl: null,
      mediaUrl:     null,
      labels,
      accessScope:  payload.accessScope,
      status:       payload.status,
      createdAt:    new Date().toISOString(),
    };
    setResources((prev) => [newItem, ...prev]);
    setShowForm(false);
    setLabels([]);
    setLabelInput("");
    (e.target as HTMLFormElement).reset();
  }

  /* Delete resource */
  async function deleteResource(id: string) {
    if (!confirm("Delete this resource?")) return;
    setResources((prev) => prev.filter((r) => r.id !== id));
    const res = await fetch(`/api/resources/${id}`, { method: "DELETE" });
    if (!res.ok) {
      // Revert on error
      setResources((prev) => {
        const deleted = initial.find((r) => r.id === id);
        return deleted ? [deleted, ...prev] : prev;
      });
    }
  }

  const accept =
    itemType === "video" ? "video/mp4,video/webm,video/quicktime" : "application/pdf";

  function TypeIcon({ type }: { type: ResourceType }) {
    if (type === "video") return <Film size={28} />;
    if (type === "pdf")   return <FileText size={28} />;
    return <ExternalLink size={28} />;
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.actionRow}>
        <h2 className={styles.pageTitle}>All resources</h2>
        <button
          className={styles.primaryBtn}
          onClick={() => setShowForm(true)}
          type="button"
        >
          <Plus size={15} /> Add resource
        </button>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {/* Create form */}
      {showForm ? (
        <form className={styles.form} onSubmit={createResource}>
          {/* Type selector */}
          <div>
            <p style={{ fontSize: "0.82rem", fontWeight: 600, margin: "0 0 0.5rem" }}>Type</p>
            <div className={styles.typeSelector}>
              {(["video", "pdf", "link"] as ResourceType[]).map((t) => (
                <button
                  className={`${styles.typeBtn} ${itemType === t ? styles.typeBtnActive : ""}`}
                  key={t}
                  onClick={() => setItemType(t)}
                  type="button"
                >
                  {t === "video" ? "Video" : t === "pdf" ? "PDF" : "Link"}
                </button>
              ))}
            </div>
          </div>

          {/* File or URL */}
          {itemType !== "link" ? (
            <label>
              File
              <input accept={accept} key={itemType} ref={fileRef} required type="file" />
            </label>
          ) : (
            <label>
              External URL
              <input
                name="externalUrl"
                placeholder="https://example.com/resource"
                required
                type="url"
              />
            </label>
          )}

          <label>
            Title
            <input maxLength={200} name="title" required />
          </label>

          <label>
            Description (optional)
            <textarea maxLength={1000} name="description" rows={2} />
          </label>

          {/* Labels */}
          <div className={styles.labelInput}>
            <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>Labels</span>
            <input
              onBlur={commitLabel}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={onLabelKeyDown}
              placeholder="Type a label and press Enter or comma"
              type="text"
              value={labelInput}
            />
            {labels.length > 0 ? (
              <div className={styles.labelChips}>
                {labels.map((l) => (
                  <span className={styles.labelChip} key={l}>
                    {l}
                    <button
                      className={styles.labelChipRemove}
                      onClick={() => setLabels((prev) => prev.filter((x) => x !== l))}
                      type="button"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <small>Separate labels with Enter or a comma — up to 10</small>
          </div>

          <label>
            Access
            <select name="accessScope">
              <option value="all_verified">Verified Students Only</option>
              <option value="all_students">All Students</option>
            </select>
          </label>

          <label>
            Status
            <select name="status">
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
          </label>

          <div className={styles.formActions}>
            <button
              className={styles.cancelBtn}
              onClick={() => { setShowForm(false); setLabels([]); setLabelInput(""); }}
              type="button"
            >
              Cancel
            </button>
            <button className={styles.primaryBtn} disabled={busy} type="submit">
              {busy ? <Loader2 className={styles.spin} size={14} /> : <UploadCloud size={14} />}
              {busy ? "Saving…" : "Save resource"}
            </button>
          </div>
        </form>
      ) : null}

      {/* Resource grid */}
      {resources.length === 0 ? (
        <p className={styles.empty}>No resources yet. Add your first one above.</p>
      ) : (
        <div className={styles.resourceGrid}>
          {resources.map((r) => (
            <div className={styles.resourceCard} key={r.id}>
              <button
                aria-label="Delete resource"
                className={styles.deleteBtn}
                onClick={() => void deleteResource(r.id)}
                type="button"
              >
                <Trash2 size={14} />
              </button>

              <div className={styles.thumbnail}>
                {r.thumbnailUrl ? (
                  <Image alt="" fill sizes="280px" src={r.thumbnailUrl} unoptimized />
                ) : (
                  <TypeIcon type={r.type} />
                )}
              </div>

              <div className={styles.badgeRow}>
                <span className={styles.typeBadge}>{r.type.toUpperCase()}</span>
                <span
                  className={`${styles.statusDot} ${
                    r.status === "published" ? styles.statusDotPublished : styles.statusDotDraft
                  }`}
                />
              </div>

              <div className={styles.cardBody}>
                <p className={styles.cardTitle}>{r.title}</p>
                <p className={styles.accessBadge}>
                  {r.accessScope === "all_students" ? "All Students" : "Verified Only"}
                </p>
                {r.labels.length > 0 ? (
                  <div className={styles.cardLabels}>
                    {r.labels.map((l) => (
                      <span className={styles.cardLabelChip} key={l}>{l}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
