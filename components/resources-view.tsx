"use client";

import Image from "next/image";
import { useState } from "react";
import { ExternalLink, FileText, Film, X } from "lucide-react";
import styles from "./resources-view.module.css";

/* ── Types ──────────────────────────────────────────────────────────────── */

interface ResourceItem {
  id:           string;
  title:        string;
  description:  string | null;
  type:         "video" | "pdf" | "link";
  mediaUrl:     string | null;
  externalUrl:  string | null;
  thumbnailUrl: string | null;
  labels:       string[];
  accessScope:  "all_students" | "all_verified";
}

interface Props {
  traderId:   string;
  resources:  ResourceItem[];
  hasModuleAccess?: boolean;
}

/* ── Component ──────────────────────────────────────────────────────────── */

export function ResourcesView({ resources, hasModuleAccess: _hasModuleAccess }: Props) {
  const [activeLabels, setActiveLabels] = useState<string[]>([]);
  const [lightbox, setLightbox] = useState<ResourceItem | null>(null);

  const allLabels = Array.from(new Set(resources.flatMap((r) => r.labels))).sort();

  function toggleLabel(label: string) {
    setActiveLabels((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
    );
  }

  const filtered =
    activeLabels.length === 0
      ? resources
      : resources.filter((r) => activeLabels.some((l) => r.labels.includes(l)));

  function handleCardClick(r: ResourceItem) {
    if (r.type === "video" && r.mediaUrl) {
      setLightbox(r);
    } else if (r.type === "pdf" && r.mediaUrl) {
      window.open(r.mediaUrl, "_blank");
    } else if (r.type === "link" && r.externalUrl) {
      window.open(r.externalUrl, "_blank");
    }
  }

  function TypeIcon({ type }: { type: ResourceItem["type"] }) {
    if (type === "video") return <Film size={28} />;
    if (type === "pdf")   return <FileText size={28} />;
    return <ExternalLink size={28} />;
  }

  return (
    <div className={styles.wrapper}>
      {/* Label filter bar */}
      {allLabels.length > 0 ? (
        <div className={styles.filterBar}>
          <button
            className={`${styles.filterChip} ${activeLabels.length === 0 ? styles.filterChipActive : ""}`}
            onClick={() => setActiveLabels([])}
            type="button"
          >
            All
          </button>
          {allLabels.map((label) => (
            <button
              className={`${styles.filterChip} ${activeLabels.includes(label) ? styles.filterChipActive : ""}`}
              key={label}
              onClick={() => toggleLabel(label)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {/* Resource grid */}
      {filtered.length === 0 ? (
        <p className={styles.empty}>No resources yet.</p>
      ) : (
        <div className={styles.resourceGrid}>
          {filtered.map((r) => (
            <button
              className={styles.resourceCard}
              key={r.id}
              onClick={() => handleCardClick(r)}
              type="button"
            >
              <div className={styles.thumbnail}>
                {r.thumbnailUrl ? (
                  <Image alt="" fill sizes="280px" src={r.thumbnailUrl} unoptimized />
                ) : (
                  <TypeIcon type={r.type} />
                )}
              </div>

              <div className={styles.badgeRow}>
                <span className={styles.typeBadge}>{r.type.toUpperCase()}</span>
              </div>

              <div className={styles.cardBody}>
                <p className={styles.cardTitle}>{r.title}</p>
                {r.description ? (
                  <p className={styles.cardDesc}>{r.description}</p>
                ) : null}
                {r.labels.length > 0 ? (
                  <div className={styles.cardLabels}>
                    {r.labels.map((l) => (
                      <span className={styles.labelChip} key={l}>{l}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Video lightbox */}
      {lightbox ? (
        <div className={styles.lightboxOverlay} onClick={() => setLightbox(null)}>
          <button
            aria-label="Close"
            className={styles.lightboxClose}
            onClick={() => setLightbox(null)}
            type="button"
          >
            <X size={22} />
          </button>
          <div className={styles.lightboxContent} onClick={(e) => e.stopPropagation()}>
            {lightbox.mediaUrl ? (
              <video
                autoPlay
                className={styles.lightboxVideo}
                controls
                src={lightbox.mediaUrl}
              />
            ) : null}
            {lightbox.title ? (
              <p className={styles.lightboxCaption}>{lightbox.title}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
