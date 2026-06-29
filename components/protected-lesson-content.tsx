"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, PartyPopper } from "lucide-react";
import Image from "next/image";
import styles from "./protected-lesson-content.module.css";

type Media = { id: string; media_type: string; title: string; processing_state?: string };
type Block = {
  id: string;
  block_type: string;
  sort_order: number;
  media_id: string | null;
  content: Record<string, unknown>;
  media: Media | null;
  galleryMedia?: Array<{ sort_order: number; caption: string | null; media: Media | null }>;
};

export function ProtectedLessonContent({
  lessonId,
  blocks,
  resumeSeconds,
  completed,
  watermark,
  previewMode = false,
  courseWillBeComplete = false,
  courseId,
}: {
  lessonId: string;
  blocks: Block[];
  resumeSeconds: number;
  completed: boolean;
  watermark: string;
  previewMode?: boolean;
  courseWillBeComplete?: boolean;
  courseId?: string;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(completed);
  const [courseComplete, setCourseComplete] = useState(false);
  const lastWrite = useRef(0);
  const autoCompleted = useRef<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    const mediaIds = [...new Set(blocks.flatMap((block) => [block.media_id, ...(block.galleryMedia ?? []).map((item) => item.media?.id ?? null)]).filter((id): id is string => Boolean(id)))];
    Promise.all(mediaIds.map(async (mediaId) => {
      const response = await fetch(`/api/course-media/${mediaId}/session`, { method: "POST" });
      if (!response.ok) return null;
      const payload = await response.json();
      return [mediaId, payload.url] as const;
    })).then((entries) => {
      if (active) {
        setUrls(Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, string]>));
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [blocks]);

  async function progress(position: number, isCompleted = false) {
    if (previewMode) return;
    const now = Date.now();
    if (!isCompleted && now - lastWrite.current < 15000) return;
    lastWrite.current = now;
    await fetch("/api/course-progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lessonId, positionSeconds: Math.max(0, Math.floor(position)), completed: isCompleted }) });
    if (isCompleted) {
      setDone(true);
      if (courseWillBeComplete) setCourseComplete(true);
    }
  }

  if (loading) return <div className={styles.loading}><Loader2 /> Preparing protected lesson...</div>;

  return <div className={styles.content}>
    {blocks.map((block) => {
      const value = block.content ?? {};
      if (block.block_type === "rich_text") return (
        <section
          className={styles.text}
          key={block.id}
          // Content is authored by verified mentors — dangerouslySetInnerHTML is intentional.
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: String(value.html ?? "") }}
        />
      );
      if (block.block_type === "link") return <a className={styles.link} href={String(value.url ?? "#")} key={block.id} rel="noopener noreferrer" target="_blank">{String(value.label ?? "Open supporting link")}<ExternalLink /></a>;
      if (block.block_type === "gallery") {
        const items = (block.galleryMedia ?? []).filter((item) => item.media && urls[item.media.id]).sort((a, b) => a.sort_order - b.sort_order);
        return items.length ? <section className={styles.gallery} key={block.id}>{items.map((item) => <figure key={item.media!.id}><div className={styles.galleryImage}><div className={styles.watermark}>{watermark}</div><Image alt={item.caption ?? item.media!.title} fill sizes="(max-width: 600px) 100vw, 50vw" src={urls[item.media!.id]} unoptimized /></div>{item.caption ? <figcaption>{item.caption}</figcaption> : null}</figure>)}</section> : <div className={styles.unavailable} key={block.id}>This protected gallery is unavailable or still processing.</div>;
      }
      const url = block.media_id ? urls[block.media_id] : null;
      if (!url) return <div className={styles.unavailable} key={block.id}>This protected media is unavailable or still processing.</div>;
      return <section className={styles.media} key={block.id}><div className={styles.watermark}>{watermark}</div>{block.block_type === "video" ? <video controls controlsList="nodownload noremoteplayback" disablePictureInPicture onEnded={(event) => progress(event.currentTarget.duration, true)} onLoadedMetadata={(event) => { if (resumeSeconds > 0) event.currentTarget.currentTime = Math.min(resumeSeconds, event.currentTarget.duration || resumeSeconds); }} onPause={(event) => progress(event.currentTarget.currentTime)} onTimeUpdate={(event) => {
                const video = event.currentTarget;
                if (
                  !done &&
                  !autoCompleted.current.has(block.id) &&
                  video.duration > 0 &&
                  video.currentTime / video.duration >= 0.9
                ) {
                  autoCompleted.current.add(block.id);
                  progress(video.currentTime, true);
                  return;
                }
                progress(video.currentTime);
              }} playsInline preload="metadata" src={url} /> : block.block_type === "pdf" ? <iframe src={`${url}#toolbar=0&navpanes=0`} title={block.media?.title ?? "Protected document"} /> : <Image alt={String(value.caption ?? block.media?.title ?? "")} height={900} src={url} unoptimized width={1600} />}<p>{String(value.caption ?? block.media?.title ?? "")}</p></section>;
    })}
    <button className={styles.complete} disabled={done} onClick={() => progress(resumeSeconds, true)}>{done ? <><CheckCircle2 /> Lesson completed</> : "Mark lesson complete"}</button>
    {courseComplete && courseId && (
      <div className={styles.courseCompleteOverlay}>
        <PartyPopper size={28} className={styles.courseCompleteIcon} />
        <h2>Course complete!</h2>
        <p>You&apos;ve finished all required lessons. Well done.</p>
        <a className={styles.courseCompleteLink} href={`/student/courses/${courseId}`}>
          View your progress
        </a>
      </div>
    )}
  </div>;
}
