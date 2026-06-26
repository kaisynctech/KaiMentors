"use client";

import { Plus } from "lucide-react";
import { MediaBlockUploader } from "./media-block-uploader";
import styles from "./media-block-uploader.module.css";

type Media = {
  id: string;
  title: string;
  media_type: "video" | "pdf" | "image";
  processing_state: string;
};

interface MediaBlockGalleryUploaderProps {
  availableImages: Media[];
  value: string[];
  onChange: (mediaIds: string[]) => void;
  onUploadStateChange?: (index: number, uploading: boolean) => void;
}

export function MediaBlockGalleryUploader({
  availableImages,
  value,
  onChange,
  onUploadStateChange,
}: MediaBlockGalleryUploaderProps) {
  return (
    <>
      {value.map((mediaId, i) => (
        <div className={styles.gallerySlot} key={i}>
          <MediaBlockUploader
            availableMedia={availableImages}
            mediaType="image"
            onChange={(id) => {
              const next = [...value];
              next[i] = id ?? "";
              onChange(next);
            }}
            onUploadStateChange={(uploading) => onUploadStateChange?.(i, uploading)}
            value={mediaId || null}
          />
          <button
            className={styles.removeSlotBtn}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            type="button"
          >
            Remove image
          </button>
        </div>
      ))}
      <button
        className={styles.addSlotBtn}
        onClick={() => onChange([...value, ""])}
        type="button"
      >
        <Plus size={11} /> Add image
      </button>
    </>
  );
}
