"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, List, X } from "lucide-react";
import Link from "next/link";
import styles from "./lesson-sidebar.module.css";

interface SidebarLesson {
  id: string;
  title: string;
  is_completed: boolean;
}

interface SidebarModule {
  id: string;
  title: string;
  lessons: SidebarLesson[];
}

interface LessonSidebarProps {
  courseTitle: string;
  courseId: string;
  currentLessonId: string;
  base: string;
  suffix: string;
  modules: SidebarModule[];
}

export function LessonSidebar({
  courseTitle,
  courseId,
  currentLessonId,
  base,
  suffix,
  modules,
}: LessonSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  // collapsed is a Set of module IDs — empty means all expanded
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggleModule(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const contents = (
    <div className={styles.inner}>
      <div className={styles.header}>
        <span className={styles.courseTitle}>{courseTitle}</span>
        <button
          aria-label="Close curriculum"
          className={styles.closeBtn}
          onClick={() => setIsOpen(false)}
        >
          <X size={16} />
        </button>
      </div>

      <div className={styles.moduleList}>
        {modules.map((mod) => {
          const isCollapsed = collapsed.has(mod.id);
          return (
            <div className={styles.moduleSection} key={mod.id}>
              <button
                aria-expanded={!isCollapsed}
                className={styles.moduleToggle}
                onClick={() => toggleModule(mod.id)}
              >
                <span className={styles.moduleToggleTitle}>{mod.title}</span>
                {isCollapsed ? (
                  <ChevronRight size={14} />
                ) : (
                  <ChevronDown size={14} />
                )}
              </button>

              {!isCollapsed && (
                <div className={styles.lessonList}>
                  {mod.lessons.map((lesson) => {
                    const isActive = lesson.id === currentLessonId;
                    return (
                      <Link
                        className={`${styles.lessonRow} ${isActive ? styles.lessonActive : ""} ${lesson.is_completed ? styles.lessonDone : ""}`}
                        href={`${base}/courses/${courseId}/lessons/${lesson.id}${suffix}`}
                        key={lesson.id}
                        onClick={() => setIsOpen(false)}
                      >
                        <span className={styles.lessonIcon}>
                          {lesson.is_completed ? (
                            <CheckCircle2 size={14} />
                          ) : (
                            <span className={styles.lessonDot} />
                          )}
                        </span>
                        <span className={styles.lessonTitle}>{lesson.title}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar — visible ≥900px */}
      <aside className={styles.sidebar}>{contents}</aside>

      {/* Mobile floating trigger */}
      <button
        aria-label="Open curriculum"
        className={styles.mobileToggle}
        onClick={() => setIsOpen(true)}
      >
        <List size={16} />
        Curriculum
      </button>

      {/* Mobile drawer */}
      {isOpen && (
        <div
          className={styles.drawerOverlay}
          onClick={() => setIsOpen(false)}
        >
          <aside
            className={styles.drawer}
            onClick={(e) => e.stopPropagation()}
          >
            {contents}
          </aside>
        </div>
      )}
    </>
  );
}
