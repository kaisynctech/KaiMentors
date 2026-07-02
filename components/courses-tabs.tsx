"use client";

import Link from "next/link";
import styles from "./courses-tabs.module.css";

interface Props {
  activeTab: "courses" | "media";
}

export function CoursesTabs({ activeTab }: Props) {
  return (
    <div className={styles.tabs}>
      <Link
        className={`${styles.tab} ${activeTab === "courses" ? styles.tabActive : ""}`}
        href="/dashboard/courses"
      >
        Courses
      </Link>
      <Link
        className={`${styles.tab} ${activeTab === "media" ? styles.tabActive : ""}`}
        href="/dashboard/courses?tab=media"
      >
        Media Library
      </Link>
    </div>
  );
}
