"use client";

import { CheckCircle2 } from "lucide-react";
import { timeAgo } from "@/lib/courses";
import styles from "../course-detail-manager.module.css";

type Status = "draft" | "published" | "archived";

interface Lesson {
  id: string;
  is_required: boolean;
  status: Status;
}

interface Module {
  id: string;
}

interface ProgressItem {
  student_user_id: string;
  full_name: string;
  started: number;
  completed: number;
  last_activity_at: string | null;
}

interface Props {
  progress: ProgressItem[];
  modules: Module[];
  lessons: Lesson[];
}

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

export function StudentsTab({ progress, lessons }: Props) {
  const totalRequired = lessons.filter(
    (l) => l.is_required && l.status === "published",
  ).length;

  const completedStudents = progress.filter(
    (p) => totalRequired > 0 && p.completed >= totalRequired,
  ).length;

  const inProgressStudents = progress.filter(
    (p) => p.started > 0 && (p.completed < totalRequired || totalRequired === 0),
  ).length;

  const avgProgress =
    progress.length > 0 && totalRequired > 0
      ? Math.round(
          (progress.reduce((sum, p) => sum + p.completed / totalRequired, 0) /
            progress.length) *
            100,
        )
      : 0;

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <p>Total learners</p>
          <strong>{progress.length}</strong>
        </div>
        <div className={styles.statCard}>
          <p>Completed</p>
          <strong>{completedStudents}</strong>
        </div>
        <div className={styles.statCard}>
          <p>In progress</p>
          <strong>{inProgressStudents}</strong>
        </div>
        <div className={styles.statCard}>
          <p>Avg progress</p>
          <strong>{avgProgress}%</strong>
        </div>
      </div>

      <div className={styles.progressPanel}>
        <div className={styles.progressHeader}>
          Learner progress
          <button
            aria-disabled="true"
            className={styles.ghostBtn}
            onClick={(e) => e.preventDefault()}
            type="button"
          >
            {/* Export: future */}
            Export
          </button>
        </div>

        {progress.length === 0 ? (
          <p className={styles.progressEmpty}>No learner activity yet.</p>
        ) : (
          progress.map((p) => {
            const percent =
              totalRequired > 0
                ? Math.round((p.completed / totalRequired) * 100)
                : 0;
            const isComplete = totalRequired > 0 && p.completed >= totalRequired;

            return (
              <div className={styles.progressRow} key={p.student_user_id}>
                <div className={styles.progressAvatar} aria-hidden="true">
                  {initials(p.full_name)}
                </div>
                <div className={styles.progressMeta}>
                  <p className={styles.progressName}>{p.full_name}</p>
                  <p className={styles.progressTime}>
                    Last active {timeAgo(p.last_activity_at)}
                  </p>
                  <div
                    className={`${styles.progressBar} ${isComplete ? styles.progressBarComplete : percent === 0 ? styles.progressBarEmpty : ""}`}
                    role="progressbar"
                    aria-valuenow={percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${p.full_name} progress`}
                  >
                    <span style={{ width: `${percent}%` }} />
                  </div>
                  {!isComplete && (
                    <p className={styles.progressLabel}>
                      {percent}% · {p.completed}/{totalRequired} lessons
                    </p>
                  )}
                </div>
                {isComplete && (
                  <span className={styles.progressBadge}>
                    <CheckCircle2 size={11} /> Completed
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
