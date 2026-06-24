"use client";

import { useRef, useState } from "react";
import { Camera, CheckCircle2, Loader2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import styles from "./verification-screenshot-upload.module.css";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

interface VerificationScreenshotUploadProps {
  traderId: string;
  studentUserId: string;
  portalId: string;
  currentScreenshotPath: string | null;
}

export function VerificationScreenshotUpload({
  traderId,
  studentUserId,
  portalId,
  currentScreenshotPath,
}: VerificationScreenshotUploadProps) {
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">(
    currentScreenshotPath ? "success" : "idle",
  );
  const [message, setMessage] = useState(
    currentScreenshotPath ? "Screenshot already submitted." : "",
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setStatus("error");
      setMessage("Please upload a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setStatus("error");
      setMessage("File must be under 10 MB.");
      return;
    }

    setStatus("uploading");
    setMessage("");

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const storagePath = `${traderId}/${studentUserId}/resubmission/verification.${ext}`;

    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from("verification-proofs")
      .upload(storagePath, file, { upsert: true });

    if (uploadError) {
      setStatus("error");
      setMessage("Upload failed. Please try again.");
      return;
    }

    const response = await fetch("/api/student/verification-screenshot", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ storagePath, portalId }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setStatus("error");
      setMessage(payload.error ?? "Could not record your screenshot. Please try again.");
      return;
    }

    setPreviewUrl(URL.createObjectURL(file));
    setStatus("success");
    setMessage("Screenshot submitted. Your mentor will review it shortly.");
  }

  return (
    <div className={styles.uploader}>
      <p className={styles.label}>
        <Camera size={13} style={{ display: "inline", verticalAlign: "middle", marginRight: 5 }} />
        Submit verification screenshot
      </p>

      {status === "success" ? (
        <>
          {previewUrl ? (
            <div className={styles.preview}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="Uploaded screenshot" className={styles.previewImg} src={previewUrl} />
            </div>
          ) : null}
          <div className={styles.successBanner}>
            <CheckCircle2 size={18} color="#3a8a1a" />
            <span className={styles.successText}>{message}</span>
          </div>
        </>
      ) : (
        <>
          <div
            className={styles.dropzone}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
            }}
            role="button"
            tabIndex={0}
          >
            <Upload size={22} color="#8a5a00" />
            <p className={styles.dropzoneText}>Click to select a screenshot</p>
            <p className={styles.dropzoneHint}>JPEG, PNG, or WebP — max 10 MB</p>
            <button
              className={styles.uploadBtn}
              disabled={status === "uploading"}
              onClick={(e) => {
                e.stopPropagation();
                fileRef.current?.click();
              }}
              type="button"
            >
              {status === "uploading" ? (
                <Loader2 className={styles.spin} size={16} />
              ) : null}
              {status === "uploading" ? "Uploading…" : "Select file"}
            </button>
          </div>
          <input
            accept="image/jpeg,image/png,image/webp"
            className={styles.fileInput}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
            ref={fileRef}
            type="file"
          />
          {status === "error" ? (
            <p className={styles.error}>{message}</p>
          ) : null}
        </>
      )}
    </div>
  );
}
