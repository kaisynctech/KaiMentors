"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Plus,
} from "lucide-react";
import { formatDuration } from "@/lib/courses";
import type { LessonWithBlocksInput } from "@/lib/courses";
import { AddLessonPanel } from "./add-lesson-panel";
import { EditLessonPanel } from "./edit-lesson-panel";
import styles from "../course-detail-manager.module.css";

type Status = "draft" | "published" | "archived";
type BlockType = { id: string; block_type: string; sort_order: number; media_id: string | null };
type Media = { id: string; title: string; media_type: "video" | "pdf" | "image"; processing_state: string };

interface Lesson {
  id: string;
  module_id: string;
  title: string;
  description: string | null;
  status: Status;
  sort_order: number;
  duration_seconds: number | null;
  is_required: boolean;
  blocks: BlockType[];
}

interface Module {
  id: string;
  title: string;
  description: string | null;
  status: Status;
  sort_order: number;
  is_required: boolean;
  lessons: Lesson[];
}

interface CurriculumPatch {
  modules: Array<{ id: string; sort_order: number; status: string }>;
  lessons: Array<{ id: string; sort_order: number; status: string }>;
  acknowledgeImpact: boolean;
}

interface Props {
  course: { id: string; title: string };
  modules: Module[];
  lessons: Lesson[];
  readyMedia: Media[];
  selectedLesson: string | null;
  setSelectedLesson: (id: string | null) => void;
  busy: boolean;
  createModule: (fd: FormData) => Promise<void>;
  createLessonWithBlocks: (lesson: LessonWithBlocksInput) => Promise<void>;
  updateLessonWithBlocks: (lessonId: string, lesson: LessonWithBlocksInput) => Promise<void>;
  patchCurriculum: (payload: CurriculumPatch) => Promise<void>;
}

export function CurriculumTab({
  course,
  modules,
  lessons,
  readyMedia,
  selectedLesson,
  setSelectedLesson,
  busy,
  createModule,
  createLessonWithBlocks,
  updateLessonWithBlocks,
  patchCurriculum,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [activePanel, setActivePanel] = useState<"add_module" | "add_lesson" | "edit_lesson" | null>(null);
  const [pendingModuleId, setPendingModuleId] = useState<string | null>(null);

  function toggleModule(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function isCollapsed(id: string) {
    return Boolean(collapsed[id]);
  }

  function selectLesson(id: string | null) {
    setSelectedLesson(id);
    setActivePanel(id ? "edit_lesson" : null);
  }

  function handleModuleStatusChange(module: Module, status: string) {
    patchCurriculum({
      modules: [{ id: module.id, sort_order: module.sort_order, status }],
      lessons: [],
      acknowledgeImpact: false,
    });
  }

  async function handleCreateModule(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await createModule(fd);
    setActivePanel(null);
    e.currentTarget.reset();
  }

  async function handleCreateLessonWithBlocks(lesson: LessonWithBlocksInput) {
    await createLessonWithBlocks(lesson);
    setActivePanel(null);
    setPendingModuleId(null);
  }

  async function handleUpdateLesson(lessonId: string, lesson: LessonWithBlocksInput) {
    await updateLessonWithBlocks(lessonId, lesson);
    setActivePanel(null);
    setSelectedLesson(null);
  }

  return (
    <div className={styles.split}>
      {/* Left: Module/lesson tree */}
      <div className={styles.treePanel}>
        <div className={styles.treePanelHeader}>
          <h3>Modules and lessons</h3>
          <button
            className={styles.ghostBtn}
            disabled={busy}
            onClick={() => {
              setActivePanel("add_module");
              setSelectedLesson(null);
            }}
            type="button"
          >
            <Plus size={13} /> Add module
          </button>
        </div>

        {modules.length === 0 && (
          <p className={styles.treeEmpty}>Create the first module to begin.</p>
        )}

        {modules.map((module) => {
          const open = !isCollapsed(module.id);
          const moduleLessons = lessons.filter((l) => l.module_id === module.id);
          return (
            <div className={styles.moduleSection} key={module.id}>
              <div
                className={styles.moduleRow}
                onClick={() => toggleModule(module.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && toggleModule(module.id)}
              >
                <ChevronRight
                  className={`${styles.moduleChevron} ${open ? styles.moduleChevronOpen : ""}`}
                  size={14}
                />
                <span className={styles.moduleTitle}>{module.title}</span>
                <select
                  className={styles.moduleStatusSelect}
                  defaultValue={module.status}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    e.stopPropagation();
                    handleModuleStatusChange(module, e.target.value);
                  }}
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </div>

              {open && (
                <div className={styles.lessonTree}>
                  {moduleLessons.map((lesson) => (
                    <div
                      className={`${styles.lessonTreeRow} ${selectedLesson === lesson.id ? styles.selectedLesson : ""}`}
                      key={lesson.id}
                      onClick={() => selectLesson(lesson.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && selectLesson(lesson.id)}
                    >
                      <span className={`${styles.lessonTreeIcon} ${lesson.status === "published" ? styles.lessonTreeIconPublished : ""}`}>
                        {lesson.status === "published" ? (
                          <CheckCircle2 size={14} />
                        ) : (
                          <Circle size={14} />
                        )}
                      </span>
                      <span className={styles.lessonTreeTitle}>{lesson.title}</span>
                      <span className={styles.lessonTreeDuration}>
                        <Clock size={10} />
                        {formatDuration(lesson.duration_seconds)}
                      </span>
                    </div>
                  ))}
                  <div
                    className={styles.addLessonRow}
                    onClick={() => {
                      setActivePanel("add_lesson");
                      setPendingModuleId(module.id);
                      setSelectedLesson(null);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setActivePanel("add_lesson");
                        setPendingModuleId(module.id);
                        setSelectedLesson(null);
                      }
                    }}
                  >
                    <Plus size={11} /> Add lesson
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <div
          className={styles.addModuleRow}
          onClick={() => {
            setActivePanel("add_module");
            setSelectedLesson(null);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setActivePanel("add_module");
              setSelectedLesson(null);
            }
          }}
        >
          <Plus size={12} /> Add module
        </div>
      </div>

      {/* Right: active panel */}
      <div className={styles.formStack}>
        {activePanel === null && !selectedLesson && (
          <div className={styles.panelEmpty}>
            <p>Select a lesson to edit, or use <strong>+ Add module</strong> to begin.</p>
          </div>
        )}

        {activePanel === "add_module" && (
          <form onSubmit={handleCreateModule} className={styles.panel}>
            <h3>
              <Plus size={15} /> Add module
            </h3>
            <label>
              Title
              <input name="title" required />
            </label>
            <label>
              Description
              <textarea name="description" />
            </label>
            <div className={styles.columns}>
              <label>
                Status
                <select name="status">
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </label>
              <label>
                Order
                <input defaultValue="0" min="0" name="sortOrder" type="number" />
              </label>
            </div>
            <label className={styles.check}>
              <input defaultChecked name="isRequired" type="checkbox" /> Required
            </label>
            <button disabled={busy} type="submit">
              Create module
            </button>
          </form>
        )}

        {activePanel === "add_lesson" && (
          <AddLessonPanel
            modules={modules}
            defaultModuleId={pendingModuleId}
            readyMedia={readyMedia}
            busy={busy}
            onSubmit={handleCreateLessonWithBlocks}
          />
        )}

        {activePanel === "edit_lesson" && selectedLesson && (
          <EditLessonPanel
            courseId={course.id}
            lessonId={selectedLesson}
            modules={modules}
            readyMedia={readyMedia}
            busy={busy}
            onSubmit={handleUpdateLesson}
            onCancel={() => {
              setActivePanel(null);
              setSelectedLesson(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
