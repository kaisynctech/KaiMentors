"use client";

import { BookOpen, Layers3, TrendingUp, Users } from "lucide-react";
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

interface ActivityFeedItem {
  studentName: string;
  lessonTitle: string;
  lessonNumber: number;
  totalLessons: number;
  action: "completed" | "started";
  lastActivityAt: string;
}

interface Props {
  modules: Module[];
  lessons: Lesson[];
  progress: ProgressItem[];
  activityFeed: ActivityFeedItem[];
}

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

export function OverviewTab({ modules, lessons, progress, activityFeed }: Props) {
  const totalRequired = lessons.filter(
    (l) => l.is_required && l.status === "published",
  ).length;

  const completedCount = progress.filter(
    (p) => totalRequired > 0 && p.completed >= totalRequired,
  ).length;

  const completionRate =
    progress.length > 0
      ? Math.round((completedCount / progress.length) * 100)
      : 0;

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <Layers3 size={18} />
          <p>Modules</p>
          <strong>{modules.length}</strong>
        </div>
        <div className={styles.kpiCard}>
          <BookOpen size={18} />
          <p>Lessons</p>
          <strong>{lessons.length}</strong>
        </div>
        <div className={styles.kpiCard}>
          <Users size={18} />
          <p>Active learners</p>
          <strong>{progress.length}</strong>
        </div>
        <div className={styles.kpiCard}>
          <TrendingUp size={18} />
          <p>Completion rate</p>
          <strong>{completionRate}%</strong>
        </div>
      </div>

      <div className={styles.activityPanel}>
        <div className={styles.activityHeader}>Recent learner activity</div>
        {activityFeed.length === 0 ? (
          <p className={styles.activityEmpty}>No learner activity yet.</p>
        ) : (
          activityFeed.map((item, i) => (
            <div className={styles.activityRow} key={i}>
              <div className={styles.avatar} aria-hidden="true">
                {initials(item.studentName)}
              </div>
              <div>
                <p className={styles.activityName}>{item.studentName}</p>
                <p className={styles.activityAction}>
                  {item.action === "completed"
                    ? `Completed lesson ${item.lessonNumber} of ${item.totalLessons}`
                    : `Started lesson ${item.lessonNumber}`}
                </p>
              </div>
              <span className={styles.activityTime}>
                {timeAgo(item.lastActivityAt)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
