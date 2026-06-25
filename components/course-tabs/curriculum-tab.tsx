"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  GripVertical,
  Layers3,
  Plus,
} from "lucide-react";
import { formatDuration } from "@/lib/courses";
import type { LessonWithBlocksInput } from "@/lib/courses";
import { AddLessonPanel } from "./add-lesson-panel";
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
  addBlock: (fd: FormData) => Promise<void>;
  patchCurriculum: (payload: CurriculumPatch) => Promise<void>;
}

const BLOCK_LABELS: Record<string, string> = {
  video: "Video",
  rich_text: "Written content",
  pdf: "PDF",
  image: "Image",
  gallery: "Image gallery",
  link: "External link",
};

function blockIcon(_type: string) {
  return <Layers3 size={14} />;
}

export function CurriculumTab({
  modules,
  lessons,
  readyMedia,
  selectedLesson,
  setSelectedLesson,
  busy,
  createModule,
  createLessonWithBlocks,
  addBlock,
  patchCurriculum,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [activePanel, setActivePanel] = useState<"add_module" | "add_lesson" | "add_block" | null>(null);
  const [pendingModuleId, setPendingModuleId] = useState<string | null>(null);

  function toggleModule(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function isCollapsed(id: string) {
    return Boolean(collapsed[id]);
  }

  function selectLesson(id: string | null) {
    setSelectedLesson(id);
    setActivePanel(null);
  }

  const selectedLessonData = selectedLesson
    ? lessons.find((l) => l.id === selectedLesson) ?? null
    : null;

  const selectedModule = selectedLessonData
    ? modules.find((m) => m.id === selectedLessonData.module_id) ?? null
    : null;

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

  async function handleAddBlock(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await addBlock(fd);
    setActivePanel(null);
    e.currentTarget.reset();
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

        {activePanel !== "add_module" && activePanel !== "add_lesson" && selectedLesson && selectedLessonData && (
          <>
            <div className={styles.blocksPanel}>
              <div className={styles.blocksPanelHeader}>
                <div className={styles.blocksPanelTitle}>
                  <p>{selectedModule?.title ?? "Module"}</p>
                  <h4>{selectedLessonData.title}</h4>
                </div>
                <button
                  className={styles.ghostBtn}
                  disabled={busy}
                  onClick={() => setActivePanel("add_block")}
                  type="button"
                >
                  <Plus size={12} /> Add block
                </button>
              </div>

              {selectedLessonData.blocks.length === 0 ? (
                <p className={styles.blocksEmpty}>No content blocks yet.</p>
              ) : (
                selectedLessonData.blocks.map((block) => (
                  <div className={styles.blockRow} key={block.id}>
                    <div className={styles.blockTypeIcon}>{blockIcon(block.block_type)}</div>
                    <div className={styles.blockInfo}>
                      <strong>{BLOCK_LABELS[block.block_type] ?? block.block_type}</strong>
                      <p>{block.media_id ? "Protected media" : "No media"}</p>
                    </div>
                    <GripVertical className={styles.dragHandle} size={16} />
                  </div>
                ))
              )}
            </div>

            {activePanel === "add_block" && (
              <form onSubmit={handleAddBlock} className={styles.panel}>
                <h3>Add content block</h3>
                <label>
                  Block type
                  <select name="blockType">
                    <option value="rich_text">Written content</option>
                    <option value="video">Video</option>
                    <option value="pdf">PDF</option>
                    <option value="image">Image</option>
                    <option value="gallery">Image gallery</option>
                    <option value="link">Link</option>
                  </select>
                </label>
                <label>
                  Single media asset
                  <select name="mediaId">
                    <option value="">None</option>
                    {readyMedia.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title} ({m.media_type})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Gallery images
                  <select multiple name="galleryMediaIds">
                    {readyMedia
                      .filter((m) => m.media_type === "image")
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.title}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Written content
                  <textarea name="text" />
                </label>
                <label>
                  Link URL
                  <input name="url" type="url" />
                </label>
                <label>
                  Link label
                  <input name="label" />
                </label>
                <label>
                  Caption
                  <input name="caption" />
                </label>
                <label>
                  Order
                  <input defaultValue="0" min="0" name="sortOrder" type="number" />
                </label>
                <label className={styles.check}>
                  <input defaultChecked name="isRequired" type="checkbox" /> Required
                </label>
                <button disabled={busy || !selectedLesson} type="submit">
                  Add block
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
