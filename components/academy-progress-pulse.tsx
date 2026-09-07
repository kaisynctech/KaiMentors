"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  CalendarCheck,
  CheckCircle2,
  MessageCircle,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import type { AcademyProgressPulse, PulseLearner } from "@/lib/academy-progress-server";
import {
  PULSE_BUCKETS,
  buildNudgeDraft,
  buildNudgeTitle,
  isNudgeBucket,
  type NudgeBucket,
  type PulseBucket,
} from "@/lib/academy-progress";
import { timeAgo } from "@/lib/courses";
import styles from "./academy-progress-pulse.module.css";

const BUCKET_LABEL: Record<PulseBucket, string> = {
  ahead: "Ahead",
  on_track: "On track",
  stuck: "Stuck",
  not_started: "Not started",
};

const BUCKET_NOTE: Record<PulseBucket, string> = {
  ahead: "Finished the current required lessons",
  on_track: "Moving through the path",
  stuck: "Quiet for 7+ days",
  not_started: "Have access, have not opened it",
};

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function AcademyProgressPulse({
  pulse,
  courseId = "",
  groupId = "",
  bucket: bucketFromUrl = "all",
  showCourseFilter = true,
  messagesEnabled = true,
  bookingsEnabled = true,
}: {
  pulse: AcademyProgressPulse;
  courseId?: string;
  groupId?: string;
  bucket?: PulseBucket | "all";
  showCourseFilter?: boolean;
  messagesEnabled?: boolean;
  bookingsEnabled?: boolean;
}) {
  const router = useRouter();
  const [messagingId, setMessagingId] = useState<string | null>(null);
  const [nudging, setNudging] = useState<NudgeBucket | null>(null);
  const [error, setError] = useState("");
  const [localGroupId, setLocalGroupId] = useState("");
  const [localBucket, setLocalBucket] = useState<PulseBucket | "all">("all");

  const embedded = !showCourseFilter;
  const activeGroupId = embedded ? localGroupId : groupId;
  const activeBucket = embedded ? localBucket : bucketFromUrl;

  const scopedLearners = useMemo(() => {
    if (!activeGroupId) return pulse.learners;
    return pulse.learners.filter((learner) =>
      learner.groupIds.includes(activeGroupId),
    );
  }, [activeGroupId, pulse.learners]);

  const counts = useMemo(() => {
    const next = { ahead: 0, on_track: 0, stuck: 0, not_started: 0 };
    for (const learner of scopedLearners) next[learner.bucket] += 1;
    return next;
  }, [scopedLearners]);

  const visible = useMemo(() => {
    if (activeBucket === "all") return scopedLearners;
    return scopedLearners.filter((learner) => learner.bucket === activeBucket);
  }, [activeBucket, scopedLearners]);

  function hrefFor(next: {
    courseId?: string;
    groupId?: string;
    bucket?: string;
  }) {
    const params = new URLSearchParams();
    const nextCourse = next.courseId ?? courseId;
    const nextGroup = next.groupId ?? groupId;
    const nextBucket = next.bucket ?? bucketFromUrl;
    if (nextCourse) params.set("course", nextCourse);
    if (nextGroup) params.set("group", nextGroup);
    if (nextBucket && nextBucket !== "all") params.set("bucket", nextBucket);
    const query = params.toString();
    return `/dashboard/progress${query ? `?${query}` : ""}`;
  }

  function selectBucket(next: PulseBucket | "all") {
    if (embedded) {
      setLocalBucket(next);
      return;
    }
    router.push(hrefFor({ bucket: next }));
  }

  async function messageStudent(learner: PulseLearner, draft?: string) {
    if (!messagesEnabled) return;
    setMessagingId(learner.applicationId);
    setError("");
    const response = await fetch("/api/messages/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "direct",
        applicationId: learner.applicationId,
      }),
    });
    const payload = await response.json().catch(() => null);
    setMessagingId(null);
    if (!response.ok || !payload?.conversationId) {
      setError(payload?.error ?? "Could not open a conversation.");
      return;
    }
    const params = new URLSearchParams({
      conversation: payload.conversationId,
    });
    if (draft) params.set("draft", draft);
    router.push(`/dashboard/messages?${params.toString()}`);
  }

  async function nudgeBucket(bucket: NudgeBucket) {
    if (!messagesEnabled) return;
    const targets = scopedLearners.filter((learner) => learner.bucket === bucket);
    if (targets.length === 0) return;
    const draft = buildNudgeDraft({
      bucket,
      courseTitle: pulse.selectedCourseTitle,
    });
    if (targets.length === 1) {
      await messageStudent(targets[0], draft);
      return;
    }

    setNudging(bucket);
    setError("");
    const groupName =
      pulse.groups.find((group) => group.id === activeGroupId)?.name ?? null;
    const response = await fetch("/api/messages/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "group",
        title: buildNudgeTitle({
          bucket,
          courseTitle: pulse.selectedCourseTitle,
          groupName,
          count: targets.length,
        }),
        applicationIds: targets.map((learner) => learner.applicationId),
        allowStudentReplies: true,
      }),
    });
    const payload = await response.json().catch(() => null);
    setNudging(null);
    if (!response.ok || !payload?.conversationId) {
      setError(payload?.error ?? "Could not open a group conversation.");
      return;
    }
    const params = new URLSearchParams({
      conversation: payload.conversationId,
      draft,
    });
    router.push(`/dashboard/messages?${params.toString()}`);
  }

  const nudgeBucketActive = isNudgeBucket(activeBucket)
    ? activeBucket
    : null;

  return (
    <div className={styles.wrap}>
      {pulse.insights.length > 0 ? (
        <div className={styles.digest} role="status">
          <TrendingUp size={16} />
          <div>
            {pulse.insights.map((line) => (
              <p key={line}>{line}</p>
            ))}
            {messagesEnabled && (counts.stuck > 0 || counts.not_started > 0) ? (
              <div className={styles.digestActions}>
                {counts.stuck > 0 ? (
                  <button
                    disabled={nudging !== null || messagingId !== null}
                    onClick={() => void nudgeBucket("stuck")}
                    type="button"
                  >
                    <UsersRound size={14} />
                    {nudging === "stuck"
                      ? "Opening…"
                      : `Nudge stuck (${counts.stuck})`}
                  </button>
                ) : null}
                {counts.not_started > 0 ? (
                  <button
                    disabled={nudging !== null || messagingId !== null}
                    onClick={() => void nudgeBucket("not_started")}
                    type="button"
                  >
                    <UsersRound size={14} />
                    {nudging === "not_started"
                      ? "Opening…"
                      : `Nudge not started (${counts.not_started})`}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {showCourseFilter ? (
        <form action="/dashboard/progress" className={styles.filters} method="get">
          <label>
            Course
            <select defaultValue={courseId} name="course">
              <option value="">All published courses</option>
              {pulse.courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Group
            <select defaultValue={groupId} name="group">
              <option value="">All groups</option>
              {pulse.groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Apply</button>
          {bucketFromUrl !== "all" ? (
            <input name="bucket" type="hidden" value={bucketFromUrl} />
          ) : null}
        </form>
      ) : pulse.groups.length > 0 ? (
        <div className={styles.filters}>
          <label>
            Group
            <select
              onChange={(event) => setLocalGroupId(event.target.value)}
              value={localGroupId}
            >
              <option value="">All groups</option>
              {pulse.groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <div className={styles.buckets}>
        <button
          className={`${styles.bucket} ${activeBucket === "all" ? styles.bucketActive : ""}`}
          onClick={() => selectBucket("all")}
          type="button"
        >
          <p>All with access</p>
          <strong>{scopedLearners.length}</strong>
        </button>
        {PULSE_BUCKETS.map((key) => (
          <button
            className={`${styles.bucket} ${styles[key]} ${activeBucket === key ? styles.bucketActive : ""}`}
            key={key}
            onClick={() => selectBucket(key)}
            type="button"
          >
            <p>{BUCKET_LABEL[key]}</p>
            <strong>{counts[key]}</strong>
            <span>{BUCKET_NOTE[key]}</span>
          </button>
        ))}
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <section className={styles.panel}>
        <header className={styles.panelHeader}>
          <h2>
            {activeBucket === "all" ? "Learners" : BUCKET_LABEL[activeBucket]}
            <small>
              {visible.length} student{visible.length === 1 ? "" : "s"}
            </small>
          </h2>
          {nudgeBucketActive && visible.length > 0 && messagesEnabled ? (
            <button
              className={styles.nudgeBtn}
              disabled={nudging !== null || messagingId !== null}
              onClick={() => void nudgeBucket(nudgeBucketActive)}
              type="button"
            >
              <UsersRound size={14} />
              {nudging === activeBucket
                ? "Opening…"
                : visible.length === 1
                  ? "Nudge"
                  : "Nudge these students"}
            </button>
          ) : null}
        </header>
        {visible.length === 0 ? (
          <p className={styles.empty}>No students in this view.</p>
        ) : (
          visible.map((learner) => (
            <div className={styles.row} key={learner.applicationId}>
              <div className={styles.avatar} aria-hidden="true">
                {initials(learner.fullName)}
              </div>
              <div className={styles.meta}>
                <p className={styles.name}>{learner.fullName}</p>
                <p className={styles.sub}>
                  {learner.bucket === "not_started"
                    ? "Has not opened this path yet"
                    : learner.currentLessonTitle
                      ? `Next: ${learner.currentLessonTitle}`
                      : "Path complete"}
                  {" · "}
                  Last active {timeAgo(learner.lastActivityAt)}
                </p>
                <div
                  aria-label={`${learner.fullName} progress`}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={learner.percent}
                  className={`${styles.bar} ${learner.bucket === "ahead" ? styles.barDone : learner.percent === 0 ? styles.barEmpty : ""}`}
                  role="progressbar"
                >
                  <span style={{ width: `${learner.percent}%` }} />
                </div>
                <p className={styles.label}>
                  {learner.percent}% · {learner.completed}/{learner.required} required lessons
                </p>
              </div>
              <div className={styles.actions}>
                {messagesEnabled ? (
                  <button
                    disabled={messagingId === learner.applicationId}
                    onClick={() => void messageStudent(learner)}
                    type="button"
                  >
                    <MessageCircle size={14} />
                    {messagingId === learner.applicationId ? "Opening…" : "Message"}
                  </button>
                ) : null}
                {bookingsEnabled ? (
                  <Link href="/dashboard/bookings">
                    <CalendarCheck size={14} />
                    Sessions
                  </Link>
                ) : null}
              </div>
            </div>
          ))
        )}
      </section>

      {pulse.lessons.length > 0 ? (
        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <h2>
              Lesson completion
              <small>Who has access, who started, who finished</small>
            </h2>
          </header>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Lesson</th>
                  {showCourseFilter && !courseId ? <th>Course</th> : null}
                  <th>Access</th>
                  <th>Started</th>
                  <th>Completed</th>
                </tr>
              </thead>
              <tbody>
                {pulse.lessons.map((lesson) => (
                  <tr key={lesson.id}>
                    <td>{lesson.title}</td>
                    {showCourseFilter && !courseId ? <td>{lesson.courseTitle}</td> : null}
                    <td>{lesson.accessCount}</td>
                    <td>{lesson.startedCount}</td>
                    <td>
                      {lesson.completedCount}
                      {lesson.accessCount > 0 ? (
                        <span className={styles.pct}>
                          {Math.round((lesson.completedCount / lesson.accessCount) * 100)}%
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeBucket === "ahead" && visible.length > 0 ? (
        <p className={styles.footnote}>
          <CheckCircle2 size={14} /> These students finished the required lessons. Rankings stay on the mentor side only.
        </p>
      ) : null}
    </div>
  );
}
