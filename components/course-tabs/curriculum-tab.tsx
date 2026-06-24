"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  FilePlus2,
  GripVertical,
  Layers3,
  Plus,
} from "lucide-react";
import { formatDuration } from "@/lib/courses";
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
  createLesson: (fd: FormData) => Promise<void>;
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

function blockIcon(type: string) {
  return <Layers3 size={14} />;
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
  createLesson,
  addBlock,
  patchCurriculum,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [addingLesson, setAddingLesson] = useState(false);

  function toggleModule(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function isCollapsed(id: string) {
    return Boolean(collapsed[id]);
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

  function handleLessonStatusChange(lesson: Lesson, status: string) {
    patchCurriculum({
      modules: [],
      lessons: [{ id: lesson.id, sort_order: lesson.sort_order, status }],
      acknowledgeImpact: false,
    });
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
            onClick={() => setAddingLesson(false)}
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
                      onClick={() => setSelectedLesson(lesson.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && setSelectedLesson(lesson.id)}
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
                      setAddingLesson(true);
                      setSelectedLesson(null);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setAddingLesson(true);
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
          onClick={() => setAddingLesson(false)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setAddingLesson(false)}
        >
          <Plus size={12} /> Add module
        </div>
      </div>

      {/* Right: Selected lesson blocks or forms */}
      <div className={styles.formStack}>
        {selectedLessonData && !addingLesson ? (
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
                  onClick={() => setAddingLesson(true)}
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
                    {/* Drag-and-drop: Phase 2 */}
                    <GripVertical className={styles.dragHandle} size={16} />
                  </div>
                ))
              )}
            </div>

            {addingLesson && (
              <form action={addBlock} className={styles.panel}>
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
        ) : (
          <>
            <form action={createModule} className={styles.panel}>
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

            <form action={createLesson} className={styles.panel}>
              <h3>
                <FilePlus2 size={15} /> Add lesson
              </h3>
              <label>
                Module
                <select name="moduleId" required>
                  {modules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </label>
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
              <label>
                Duration seconds
                <input min="1" name="durationSeconds" type="number" />
              </label>
              <label className={styles.check}>
                <input defaultChecked name="isRequired" type="checkbox" /> Required
              </label>
              <button disabled={busy || !modules.length} type="submit">
                Create lesson
              </button>
            </form>

            {selectedLesson && (
              <form action={addBlock} className={styles.panel}>
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

            {!selectedLesson && modules.length > 0 && (
              <div className={styles.blocksPanel}>
                <p className={styles.blocksInstruction}>
                  Select a lesson in the tree to view and edit its content blocks.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
