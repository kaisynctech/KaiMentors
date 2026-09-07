"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { Archive, FileImage, FileText, Film, Loader2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { COURSE_MEDIA_RULES } from "@/lib/media-limits";
import { useMediaUpload } from "@/lib/use-media-upload";
import styles from "./course-media-library.module.css";

type Media = { id: string; title: string; media_type: "video" | "pdf" | "image"; mime_type: string; size_bytes: number; duration_seconds: number | null; processing_state: string; created_at: string; usageCount: number };

export function CourseMediaLibrary({ media }: { media: Media[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const { state, progress, eta, errorMessage, startUpload, retry } = useMediaUpload();
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (state !== "ready") return;
    setMessage("Media uploaded and verified.");
    router.refresh();
  }, [state, router]);

  async function uploadMedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = fileRef.current?.files?.[0];
    if (!file) return setMessage("Choose a video, PDF, or image.");
    const mediaType = file.type.startsWith("video/") ? "video" : file.type === "application/pdf" ? "pdf" : "image";
    const formData = new FormData(form);
    setMessage("");
    await startUpload(
      file,
      mediaType,
      String(formData.get("title") || file.name),
      String(formData.get("replacesMediaId") || "") || null,
    );
  }

  async function archive(id: string) {
    if (!window.confirm("Archive this media? Active references will block the action.")) return;
    const response = await fetch(`/api/course-media/${id}`, { method: "DELETE" });
    const payload = await response.json();
    setMessage(response.ok ? "Media archived." : payload.error);
    router.refresh();
  }

  return <div className={styles.page}>
    <form className={styles.uploadCard} onSubmit={uploadMedia}>
      <div><p className="eyebrow">Protected media</p><h2>Resumable upload</h2><p>Videos upload directly to protected storage and can resume if the connection drops. A 60-minute 1080p lesson fits in the 2 GB limit.</p></div>
      <label>Asset title<input maxLength={180} name="title" required /></label>
      <label>Replace existing asset<select name="replacesMediaId"><option value="">No replacement</option>{media.filter(item=>item.processing_state==="ready").map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label className={styles.drop}><UploadCloud size={22}/><span>Select video, PDF, or image</span><span>{COURSE_MEDIA_RULES.video.hint}</span><input accept="video/mp4,video/webm,application/pdf,image/png,image/jpeg,image/webp" ref={fileRef} type="file" required /></label>
      {state === "uploading" ? <div className={styles.progress}><span style={{ width: `${progress}%` }}/><strong>{progress}%{eta ? ` · ${eta}` : ""}</strong></div> : null}
      {state === "error" ? (
        <button onClick={() => void retry()} type="button"><UploadCloud /> Resume upload</button>
      ) : (
        <button disabled={state === "uploading"} type="submit">{state === "uploading" ? <Loader2 className={styles.spin}/> : <UploadCloud/>} Upload media</button>
      )}
      {state === "error" && errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}
      {message ? <p className={state === "error" ? styles.error : styles.message}>{message}</p> : null}
    </form>
    <section className={styles.library}><div className={styles.heading}><div><p className="eyebrow">Academy library</p><h2>{media.length} assets</h2></div></div>
      <div className={styles.tableWrap}><table><thead><tr><th>Asset</th><th>Type</th><th>Size</th><th>Status</th><th>Used in</th><th>Action</th></tr></thead><tbody>
        {media.map(item => { const Icon=item.media_type==="video"?Film:item.media_type==="pdf"?FileText:FileImage; return <tr key={item.id}><td><span className={styles.asset}><Icon/><strong>{item.title}</strong></span></td><td>{item.media_type}</td><td>{(item.size_bytes/1024/1024).toFixed(1)} MB</td><td><span className={styles.status}>{item.processing_state}</span></td><td>{item.usageCount} references</td><td><button className={styles.archive} onClick={()=>archive(item.id)} type="button"><Archive/> Archive</button></td></tr> })}
        {!media.length ? <tr><td colSpan={6}>No media uploaded yet.</td></tr> : null}
      </tbody></table></div>
    </section>
  </div>;
}
