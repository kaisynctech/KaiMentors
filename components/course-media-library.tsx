"use client";

import { useRef, useState } from "react";
import { Archive, FileImage, FileText, Film, Loader2, UploadCloud } from "lucide-react";
import { Upload } from "tus-js-client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import styles from "./course-media-library.module.css";

type Media = { id: string; title: string; media_type: "video" | "pdf" | "image"; mime_type: string; size_bytes: number; duration_seconds: number | null; processing_state: string; created_at: string; usageCount: number };

export function CourseMediaLibrary({ media }: { media: Media[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "uploading" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");

  async function uploadMedia(formData: FormData) {
    const file = fileRef.current?.files?.[0];
    if (!file) return setMessage("Choose a video, PDF, or image.");
    const mediaType = file.type.startsWith("video/") ? "video" : file.type === "application/pdf" ? "pdf" : "image";
    setState("uploading"); setMessage(""); setProgress(0);
    const init = await fetch("/api/course-media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: String(formData.get("title") || file.name), fileName: file.name, mimeType: file.type, sizeBytes: file.size, mediaType, replacesMediaId: formData.get("replacesMediaId") || null }) });
    const payload = await init.json();
    if (!init.ok) { setState("error"); return setMessage(payload.error ?? "Upload could not start."); }
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setState("error"); return setMessage("Your session expired. Sign in and retry."); }
    const upload = new Upload(file, {
      endpoint: payload.uploadUrl,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      headers: { authorization: `Bearer ${session.access_token}`, "x-upsert": "false" },
      metadata: { bucketName: payload.bucketName, objectName: payload.storagePath, contentType: file.type, cacheControl: "private, max-age=0" },
      chunkSize: 6 * 1024 * 1024,
      removeFingerprintOnSuccess: true,
      onProgress: (sent, total) => setProgress(Math.round((sent / total) * 100)),
      onError: () => { setState("error"); setMessage("Upload paused after repeated network failures. Retry to resume."); },
      onSuccess: async () => {
        const final = await fetch(`/api/course-media/${payload.mediaId}/finalize`, { method: "POST" });
        const result = await final.json();
        if (!final.ok) { setState("error"); return setMessage(result.error ?? "Upload verification failed."); }
        setState("idle"); setMessage("Media uploaded and verified."); router.refresh();
      },
    });
    const previous = await upload.findPreviousUploads();
    if (previous[0]) upload.resumeFromPreviousUpload(previous[0]);
    upload.start();
  }

  async function archive(id: string) {
    if (!window.confirm("Archive this media? Active references will block the action.")) return;
    const response = await fetch(`/api/course-media/${id}`, { method: "DELETE" });
    const payload = await response.json();
    setMessage(response.ok ? "Media archived." : payload.error); router.refresh();
  }

  return <div className={styles.page}>
    <form action={uploadMedia} className={styles.uploadCard}>
      <div><p className="eyebrow">Protected media</p><h2>Resumable upload</h2><p>Videos upload directly to protected storage. PDFs and images use the same tenant-scoped lifecycle.</p></div>
      <label>Asset title<input maxLength={180} name="title" required /></label>
      <label>Replace existing asset<select name="replacesMediaId"><option value="">No replacement</option>{media.filter(item=>item.processing_state==="ready").map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label className={styles.drop}><UploadCloud size={22}/><span>Select video, PDF, or image</span><input accept="video/mp4,video/webm,application/pdf,image/png,image/jpeg,image/webp" ref={fileRef} type="file" required /></label>
      {state === "uploading" ? <div className={styles.progress}><span style={{ width: `${progress}%` }}/><strong>{progress}%</strong></div> : null}
      <button disabled={state === "uploading"}>{state === "uploading" ? <Loader2 className={styles.spin}/> : <UploadCloud/>} Upload media</button>
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
