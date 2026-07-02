"use client";

import { useRef, useState } from "react";
import { ImageIcon, Loader2, Save, Trash2, Video } from "lucide-react";
import styles from "./broker-instructions-editor.module.css";

interface TabData {
  instructions: string;
  imagePath: string | null;
  imagePreviewUrl: string | null;
  videoPath: string | null;
  videoPreviewUrl: string | null;
}

interface BrokerInstructionsEditorProps {
  accountId: string;
  brokerName: string;
  initialNew: TabData;
  initialExisting: TabData;
  onSaved: () => void;
}

export function BrokerInstructionsEditor({
  accountId,
  brokerName,
  initialNew,
  initialExisting,
  onSaved,
}: BrokerInstructionsEditorProps) {
  const [activeTab, setActiveTab] = useState<"new" | "existing">("new");
  const [newData, setNewData] = useState<TabData>(initialNew);
  const [existingData, setExistingData] = useState<TabData>(initialExisting);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const newImageRef = useRef<HTMLInputElement>(null);
  const newVideoRef = useRef<HTMLInputElement>(null);
  const existingImageRef = useRef<HTMLInputElement>(null);
  const existingVideoRef = useRef<HTMLInputElement>(null);

  function getTabData(tab: "new" | "existing") {
    return tab === "new" ? newData : existingData;
  }

  function setTabData(tab: "new" | "existing", patch: Partial<TabData>) {
    if (tab === "new") setNewData((prev) => ({ ...prev, ...patch }));
    else setExistingData((prev) => ({ ...prev, ...patch }));
  }

  async function uploadMedia(
    tab: "new" | "existing",
    mediaType: "image" | "video",
    file: File,
  ) {
    const key = `${tab}-${mediaType}`;
    setUploading(key);
    setError(null);
    try {
      const res = await fetch("/api/brokers/accounts/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          tab,
          mediaType,
          mimeType: file.type,
          fileSize: file.size,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Upload failed.");
        return;
      }
      const { signedUrl, storagePath } = json as { signedUrl: string; storagePath: string };
      const putRes = await fetch(signedUrl, {
        method: "PUT",
        headers: { "content-type": file.type },
        body: file,
      });
      if (!putRes.ok) {
        setError("File upload failed. Please try again.");
        return;
      }
      const previewUrl = URL.createObjectURL(file);
      if (mediaType === "image") {
        setTabData(tab, { imagePath: storagePath, imagePreviewUrl: previewUrl });
      } else {
        setTabData(tab, { videoPath: storagePath, videoPreviewUrl: previewUrl });
      }
    } finally {
      setUploading(null);
    }
  }

  function handleFileChange(tab: "new" | "existing", mediaType: "image" | "video") {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void uploadMedia(tab, mediaType, file);
      e.target.value = "";
    };
  }

  function removeMedia(tab: "new" | "existing", mediaType: "image" | "video") {
    if (mediaType === "image") setTabData(tab, { imagePath: null, imagePreviewUrl: null });
    else setTabData(tab, { videoPath: null, videoPreviewUrl: null });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/brokers/accounts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          newAccountInstructions: newData.instructions || null,
          newAccountImagePath: newData.imagePath,
          newAccountVideoPath: newData.videoPath,
          existingAccountInstructions: existingData.instructions || null,
          existingAccountImagePath: existingData.imagePath,
          existingAccountVideoPath: existingData.videoPath,
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        setError(json.error ?? "Save failed.");
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const data = getTabData(activeTab);

  return (
    <div className={styles.editor}>
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === "new" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("new")}
          type="button"
        >
          New to {brokerName}
        </button>
        <button
          className={`${styles.tab} ${activeTab === "existing" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("existing")}
          type="button"
        >
          Already have an account
        </button>
      </div>

      <div className={styles.panel}>
        <div className={styles.mediaSection}>
          <span className={styles.mediaLabel}>Image</span>
          {data.imagePreviewUrl ? (
            <div className={styles.imagePreview}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="Broker instruction" src={data.imagePreviewUrl} />
              <button
                className={styles.removeBtn}
                onClick={() => removeMedia(activeTab, "image")}
                type="button"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ) : (
            <button
              className={styles.uploadZone}
              disabled={uploading === `${activeTab}-image`}
              onClick={() => {
                if (activeTab === "new") newImageRef.current?.click();
                else existingImageRef.current?.click();
              }}
              type="button"
            >
              {uploading === `${activeTab}-image` ? (
                <Loader2 className={styles.spin} size={20} />
              ) : (
                <ImageIcon size={20} />
              )}
              <span>Upload image</span>
            </button>
          )}
        </div>

        <div className={styles.textSection}>
          <span className={styles.mediaLabel}>Instructions</span>
          <textarea
            className={styles.textarea}
            maxLength={5000}
            onChange={(e) => setTabData(activeTab, { instructions: e.target.value })}
            placeholder="Write step-by-step instructions for students opening a broker account..."
            rows={6}
            value={data.instructions}
          />
        </div>

        <div className={styles.mediaSection}>
          <span className={styles.mediaLabel}>Video</span>
          {data.videoPreviewUrl ? (
            <div className={styles.videoPreview}>
              <video controls src={data.videoPreviewUrl} />
              <button
                className={styles.removeBtn}
                onClick={() => removeMedia(activeTab, "video")}
                type="button"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ) : (
            <button
              className={styles.uploadZone}
              disabled={uploading === `${activeTab}-video`}
              onClick={() => {
                if (activeTab === "new") newVideoRef.current?.click();
                else existingVideoRef.current?.click();
              }}
              type="button"
            >
              {uploading === `${activeTab}-video` ? (
                <Loader2 className={styles.spin} size={20} />
              ) : (
                <Video size={20} />
              )}
              <span>Upload video</span>
            </button>
          )}
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.saveRow}>
        <button
          className={styles.saveBtn}
          disabled={saving}
          onClick={() => void save()}
          type="button"
        >
          {saving ? <Loader2 className={styles.spin} size={16} /> : <Save size={16} />}
          Save instructions
        </button>
      </div>

      <input
        accept="image/jpeg,image/png,image/webp,image/gif"
        hidden
        onChange={handleFileChange("new", "image")}
        ref={newImageRef}
        type="file"
      />
      <input
        accept="video/mp4,video/webm,video/quicktime"
        hidden
        onChange={handleFileChange("new", "video")}
        ref={newVideoRef}
        type="file"
      />
      <input
        accept="image/jpeg,image/png,image/webp,image/gif"
        hidden
        onChange={handleFileChange("existing", "image")}
        ref={existingImageRef}
        type="file"
      />
      <input
        accept="video/mp4,video/webm,video/quicktime"
        hidden
        onChange={handleFileChange("existing", "video")}
        ref={existingVideoRef}
        type="file"
      />
    </div>
  );
}
