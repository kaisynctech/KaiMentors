"use client";

import { useEffect, useRef, useState, type SyntheticEvent, type VideoHTMLAttributes } from "react";
import { createFile, MP4BoxBuffer } from "mp4box";
import {
  COURSE_MEDIA_RANGE_CHUNK_BYTES,
  COURSE_VIDEO_BUFFER_AHEAD_SECONDS,
} from "@/lib/media-limits";

declare global {
  interface Window {
    ManagedMediaSource?: typeof MediaSource;
  }
}

type MovieInfo = {
  duration: number;
  timescale: number;
  tracks: Array<{
    id: number;
    codec: string;
    video?: unknown;
    audio?: unknown;
  }>;
};

type SegmentInit =
  | { buffer: ArrayBuffer }
  | Array<{ buffer: ArrayBuffer }>;

function mediaSourceCtor() {
  if (typeof window === "undefined") return null;
  const Candidate =
    window.ManagedMediaSource ??
    window.MediaSource ??
    null;
  return Candidate;
}

function toBoxBuffer(data: ArrayBuffer, fileStart: number) {
  return MP4BoxBuffer.fromArrayBuffer(data, fileStart);
}

function initSegmentBuffer(init: SegmentInit | undefined) {
  if (!init) return null;
  if (Array.isArray(init)) return init[0]?.buffer ?? null;
  return init.buffer ?? null;
}

function seekOffset(result: unknown) {
  if (typeof result === "number" && Number.isFinite(result)) return result;
  if (result && typeof result === "object" && "offset" in result) {
    const offset = Number((result as { offset: number }).offset);
    if (Number.isFinite(offset)) return offset;
  }
  return null;
}

function bufferedAhead(video: HTMLVideoElement) {
  const { buffered, currentTime } = video;
  for (let i = 0; i < buffered.length; i += 1) {
    if (currentTime >= buffered.start(i) && currentTime <= buffered.end(i)) {
      return buffered.end(i) - currentTime;
    }
  }
  return 0;
}

async function readRange(mediaId: string, start: number, end: number) {
  const response = await fetch(
    `/api/course-media/${mediaId}/bytes?start=${start}&end=${end}`,
    { cache: "no-store" },
  );
  if (!response.ok && response.status !== 206) {
    throw new Error("range");
  }
  const totalHeader = response.headers.get("content-range")?.split("/")[1];
  const total = totalHeader && totalHeader !== "*" ? Number(totalHeader) : null;
  return { buffer: await response.arrayBuffer(), total };
}

export function CourseVideo({
  mediaId,
  fallbackUrl,
  useChunks,
  resumeSeconds = 0,
  restoreSeconds,
  ...videoProps
}: {
  mediaId: string;
  fallbackUrl: string;
  useChunks: boolean;
  resumeSeconds?: number;
  restoreSeconds?: number | null;
} & Omit<VideoHTMLAttributes<HTMLVideoElement>, "src" | "preload">) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState(useChunks ? undefined : fallbackUrl);
  const [chunked, setChunked] = useState(useChunks);

  useEffect(() => {
    if (!useChunks) {
      setChunked(false);
      setSrc(fallbackUrl);
      return;
    }
    const video = videoRef.current;
    const MediaSourceClass = mediaSourceCtor();
    if (!video || !MediaSourceClass) {
      setChunked(false);
      setSrc(fallbackUrl);
      return;
    }

    let cancelled = false;
    let objectUrl = "";
    let nextStart = 0;
    let fileSize = Number.POSITIVE_INFINITY;
    let ready = false;
    const mediaSource = new MediaSourceClass();
    const mp4 = createFile() as unknown as {
      onError: ((module: string, message: string) => void) | undefined;
      onReady: ((info: MovieInfo) => void) | undefined;
      onSegment:
        | ((id: number, user: unknown, buffer: ArrayBuffer, sampleNumber: number) => void)
        | undefined;
      appendBuffer: (data: ReturnType<typeof MP4BoxBuffer.fromArrayBuffer>) => number | undefined;
      setSegmentOptions: (id: number, user: unknown, options: { nbSamples: number }) => void;
      initializeSegmentation: () => SegmentInit;
      start: () => void;
      stop: () => void;
      seek: (time: number, useRap: boolean) => unknown;
      releaseUsedSamples: (id: number, sampleNumber: number) => void;
    };
    const pending: ArrayBuffer[] = [];
    let appending = false;
    let sourceBuffer: SourceBuffer | null = null;
    let pumping = false;

    function fail() {
      if (cancelled) return;
      cancelled = true;
      mp4.stop?.();
      setChunked(false);
      setSrc(fallbackUrl);
    }

    function appendNext() {
      if (!sourceBuffer || appending || sourceBuffer.updating || pending.length === 0) return;
      appending = true;
      const buffer = pending.shift();
      if (!buffer) {
        appending = false;
        return;
      }
      try {
        sourceBuffer.appendBuffer(buffer);
      } catch {
        appending = false;
        fail();
      }
    }

    async function pump() {
      if (pumping || cancelled) return;
      pumping = true;
      try {
        while (!cancelled && nextStart < fileSize) {
          if (ready && video && bufferedAhead(video) > COURSE_VIDEO_BUFFER_AHEAD_SECONDS) {
            break;
          }
          const end = Math.min(nextStart + COURSE_MEDIA_RANGE_CHUNK_BYTES - 1, fileSize - 1);
          if (end < nextStart) break;
          const { buffer, total } = await readRange(mediaId, nextStart, end);
          if (cancelled) return;
          if (total && Number.isFinite(total)) fileSize = total;
          const wanted = mp4.appendBuffer(toBoxBuffer(buffer, nextStart));
          nextStart = typeof wanted === "number" && Number.isFinite(wanted) ? wanted : end + 1;
        }
      } catch {
        fail();
      } finally {
        pumping = false;
      }
    }

    mp4.onError = () => fail();
    mp4.onReady = (info: MovieInfo) => {
      const playable = info.tracks.filter((track) => track.video || track.audio);
      if (playable.length === 0) {
        fail();
        return;
      }
      const mime = `video/mp4; codecs="${playable.map((track) => track.codec).join(", ")}"`;
      if (!MediaSourceClass.isTypeSupported(mime)) {
        fail();
        return;
      }
      sourceBuffer = mediaSource.addSourceBuffer(mime);
      sourceBuffer.addEventListener("updateend", () => {
        appending = false;
        appendNext();
      });
      sourceBuffer.addEventListener("error", fail);
      for (const track of playable) {
        mp4.setSegmentOptions(track.id, sourceBuffer, { nbSamples: 60 });
      }
      const init = initSegmentBuffer(mp4.initializeSegmentation() as SegmentInit);
      if (!init) {
        fail();
        return;
      }
      pending.push(init);
      appendNext();
      if (info.duration > 0 && info.timescale > 0) {
        try {
          mediaSource.duration = info.duration / info.timescale;
        } catch {
          /* some ManagedMediaSource implementations set duration themselves */
        }
      }
      ready = true;
      const startAt = restoreSeconds ?? (resumeSeconds > 0 ? resumeSeconds : 0);
      const sought = startAt > 0 ? seekOffset(mp4.seek(startAt, true)) : seekOffset(mp4.seek(0, true));
      if (sought != null) nextStart = sought;
      mp4.start();
      void pump();
    };
    mp4.onSegment = (_id: number, _user: unknown, buffer: ArrayBuffer, sampleNumber: number) => {
      pending.push(buffer);
      appendNext();
      if (typeof sampleNumber === "number") {
        try {
          mp4.releaseUsedSamples(_id, sampleNumber);
        } catch {
          /* older builds may not expose the track yet */
        }
      }
    };

    video.disableRemotePlayback = true;
    objectUrl = URL.createObjectURL(mediaSource);
    setSrc(objectUrl);
    mediaSource.addEventListener("sourceopen", () => {
      void pump();
    });
    mediaSource.addEventListener("error", fail);

    const onWaiting = () => {
      if (ready) void pump();
    };
    const onSeeking = () => {
      if (!ready || !video) return;
      const offset = seekOffset(mp4.seek(video.currentTime, true));
      if (offset != null) nextStart = offset;
      void pump();
    };
    const onTimeUpdate = () => {
      if (ready && video && bufferedAhead(video) < COURSE_VIDEO_BUFFER_AHEAD_SECONDS / 2) {
        void pump();
      }
    };

    video.addEventListener("waiting", onWaiting);
    video.addEventListener("seeking", onSeeking);
    video.addEventListener("timeupdate", onTimeUpdate);

    return () => {
      cancelled = true;
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("seeking", onSeeking);
      video.removeEventListener("timeupdate", onTimeUpdate);
      try {
        mp4.stop();
      } catch {
        /* ignore */
      }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fallbackUrl, mediaId, resumeSeconds, restoreSeconds, useChunks]);

  function handleLoadedMetadata(event: SyntheticEvent<HTMLVideoElement>) {
    if (!chunked) videoProps.onLoadedMetadata?.(event);
    const video = event.currentTarget;
    const start = restoreSeconds ?? (resumeSeconds > 0 ? resumeSeconds : 0);
    if (!chunked && start > 0) {
      video.currentTime = Math.min(start, video.duration || start);
    }
    if (chunked) videoProps.onLoadedMetadata?.(event);
  }

  return (
    <video
      {...videoProps}
      onLoadedMetadata={handleLoadedMetadata}
      playsInline
      preload="metadata"
      ref={videoRef}
      src={src}
    />
  );
}
