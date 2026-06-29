"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Eye } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./course-detail-manager.module.css";
import type { LessonWithBlocksInput } from "@/lib/courses";
import { AccessTab } from "./course-tabs/access-tab";
import { CurriculumTab } from "./course-tabs/curriculum-tab";
import { OverviewTab } from "./course-tabs/overview-tab";
import { ResourcesTab } from "./course-tabs/resources-tab";
import { SettingsTab } from "./course-tabs/settings-tab";
import { StudentsTab } from "./course-tabs/students-tab";

type Status = "draft" | "published" | "archived";
type AccessMode = "all_verified" | "restricted" | "one_to_one";

type Media = {
  id: string;
  title: string;
  media_type: "video" | "pdf" | "image";
  processing_state: string;
};

type Lesson = {
  id: string;
  module_id: string;
  title: string;
  description: string | null;
  status: Status;
  sort_order: number;
  duration_seconds: number | null;
  is_required: boolean;
  blocks: Array<{
    id: string;
    block_type: string;
    sort_order: number;
    media_id: string | null;
  }>;
};

type Module = {
  id: string;
  title: string;
  description: string | null;
  status: Status;
  sort_order: number;
  is_required: boolean;
  requires_previous_completion: boolean;
  lessons: Lesson[];
};

interface ActivityFeedItem {
  studentName: string;
  lessonTitle: string;
  lessonNumber: number;
  totalLessons: number;
  action: "completed" | "started";
  lastActivityAt: string;
}

interface Props {
  course: {
    id: string;
    title: string;
    description: string | null;
    status: Status;
    sort_order: number;
    access_mode: AccessMode;
    thumbnailUrl: string | null;
  };
  modules: Module[];
  media: Media[];
  groups: Array<{ id: string; name: string; color: string }>;
  students: Array<{ student_user_id: string; full_name: string }>;
  selectedGroupIds: string[];
  selectedStudentIds: string[];
  progress: Array<{
    student_user_id: string;
    full_name: string;
    completed: number;
    started: number;
    last_activity_at: string | null;
  }>;
  resources: Array<{ id: string; title: string; status: Status; sort_order: number }>;
  activityFeed: ActivityFeedItem[];
}

const TABS = [
  "Overview",
  "Curriculum",
  "Resources",
  "Access",
  "Students",
  "Settings",
] as const;

export function CourseDetailManager({
  course,
  modules,
  media,
  groups,
  students,
  selectedGroupIds,
  selectedStudentIds,
  progress,
  resources,
  activityFeed,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedLesson, setSelectedLesson] = useState<string | null>(null);
  const [pendingSelectId, setPendingSelectId] = useState<string | null>(null);

  const lessons = useMemo(() => modules.flatMap((m) => m.lessons), [modules]);

  // Open the duplicated lesson once it appears in the refreshed list
  useEffect(() => {
    if (!pendingSelectId) return;
    const exists = lessons.some((l) => l.id === pendingSelectId);
    if (exists) {
      setSelectedLesson(pendingSelectId);
      setPendingSelectId(null);
    }
  }, [lessons, pendingSelectId]);
  const readyMedia = media.filter((m) => m.processing_state === "ready");

  async function call(url: string, body: unknown) {
    setBusy(true);
    setError("");
    setMessage("");
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(payload.error ?? "The change could not be saved.");
      return false;
    }
    setMessage("Saved successfully.");
    router.refresh();
    return true;
  }

  async function createModule(fd: FormData) {
    await call(`/api/courses/${course.id}/modules`, {
      title: fd.get("title"),
      description: fd.get("description") || null,
      status: fd.get("status"),
      sortOrder: Number(fd.get("sortOrder")),
      isRequired: fd.get("isRequired") === "on",
    });
  }

  async function createLessonWithBlocks(lesson: LessonWithBlocksInput) {
    await call(`/api/courses/${course.id}/lessons`, lesson);
  }

  async function updateModule(
    moduleId: string,
    updates: { requiresPreviousCompletion: boolean },
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    const response = await fetch(`/api/courses/${course.id}/modules/${moduleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(payload.error ?? "Module could not be updated.");
      return;
    }
    setMessage("Module updated.");
    router.refresh();
  }

  async function duplicateLesson(lessonId: string) {
    setBusy(true);
    setError("");
    setMessage("");
    const res = await fetch(
      `/api/courses/${course.id}/lessons/${lessonId}/duplicate`,
      { method: "POST" },
    );
    if (!res.ok) {
      setBusy(false);
      return;
    }
    const { lessonId: newId } = await res.json();
    setPendingSelectId(newId);
    router.refresh();
    setBusy(false);
  }

  async function updateLessonWithBlocks(lessonId: string, lesson: LessonWithBlocksInput) {
    setBusy(true);
    setError("");
    setMessage("");
    const response = await fetch(`/api/courses/${course.id}/lessons/${lessonId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lesson),
    });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(payload.error ?? "The lesson could not be updated.");
      return;
    }
    setMessage("Lesson updated successfully.");
    router.refresh();
  }

  async function addBlock(fd: FormData) {
    if (!selectedLesson) return;
    const type = String(fd.get("blockType"));
    const content =
      type === "rich_text"
        ? { html: fd.get("text") }
        : type === "link"
          ? { url: fd.get("url"), label: fd.get("label") }
          : { caption: fd.get("caption") };
    await call(`/api/lessons/${selectedLesson}/blocks`, {
      blockType: type,
      sortOrder: Number(fd.get("sortOrder")),
      mediaId: fd.get("mediaId") || null,
      mediaIds: fd.getAll("galleryMediaIds"),
      content,
      isRequired: fd.get("isRequired") === "on",
    });
  }

  async function addResource(fd: FormData) {
    await call(`/api/courses/${course.id}/resources`, {
      title: fd.get("title"),
      lessonId: fd.get("lessonId") || null,
      mediaId: fd.get("mediaId") || null,
      externalUrl: fd.get("externalUrl") || null,
      status: fd.get("status"),
      sortOrder: Number(fd.get("sortOrder")),
    });
  }

  async function patchCurriculum(payload: {
    modules: Array<{ id: string; sort_order: number; status: string }>;
    lessons: Array<{ id: string; sort_order: number; status: string }>;
    acknowledgeImpact: boolean;
  }) {
    setBusy(true);
    setError("");
    setMessage("");
    let response = await fetch(`/api/courses/${course.id}/curriculum`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    let p = await response.json();
    if (
      response.status === 409 &&
      p.requiresConfirmation &&
      window.confirm(p.error)
    ) {
      response = await fetch(`/api/courses/${course.id}/curriculum`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, acknowledgeImpact: true }),
      });
      p = await response.json();
    }
    setBusy(false);
    if (!response.ok) setError(p.error ?? "The change could not be saved.");
    else {
      setMessage("Curriculum updated.");
      router.refresh();
    }
  }

  async function saveCourse(fd: FormData) {
    fd.set("accessMode", course.access_mode);
    selectedGroupIds.forEach((id) => fd.append("groupIds", id));
    selectedStudentIds.forEach((id) => fd.append("studentIds", id));
    let response = await fetch(`/api/courses/${course.id}`, {
      method: "PATCH",
      body: fd,
    });
    let payload = await response.json();
    if (
      response.status === 409 &&
      payload.requiresConfirmation &&
      window.confirm(payload.error)
    ) {
      fd.set("acknowledgeImpact", "true");
      response = await fetch(`/api/courses/${course.id}`, {
        method: "PATCH",
        body: fd,
      });
      payload = await response.json();
    }
    if (!response.ok) setError(payload.error);
    else {
      setMessage("Course settings updated.");
      router.refresh();
    }
  }

  async function saveAccess(fd: FormData) {
    setBusy(true);
    const response = await fetch(`/api/courses/${course.id}`, {
      method: "PATCH",
      body: (() => {
        const data = new FormData();
        data.set("title", course.title);
        data.set("description", course.description ?? "");
        data.set("status", course.status);
        data.set("sortOrder", String(course.sort_order));
        data.set("accessMode", String(fd.get("accessMode")));
        fd.getAll("groupIds").forEach((v) => data.append("groupIds", v));
        fd.getAll("studentIds").forEach((v) => data.append("studentIds", v));
        data.set("acknowledgeImpact", "true");
        return data;
      })(),
    });
    const p = await response.json();
    setBusy(false);
    if (!response.ok) setError(p.error);
    else {
      setMessage("Course access updated immediately.");
      router.refresh();
    }
  }

  return (
    <div className={styles.workspace}>
      <nav className={styles.tabs}>
        {TABS.map((item) => (
          <button
            className={tab === item ? styles.activeTab : ""}
            key={item}
            onClick={() => setTab(item)}
            type="button"
          >
            {item}
          </button>
        ))}
        <Link
          className={styles.previewLink}
          href={`/dashboard/courses/${course.id}/preview`}
          target="_blank"
        >
          <Eye size={12} /> Preview
        </Link>
      </nav>

      {error ? <p className={styles.error}>{error}</p> : null}
      {message ? (
        <p className={styles.success}>
          <CheckCircle2 /> {message}
        </p>
      ) : null}

      {tab === "Overview" && (
        <OverviewTab
          modules={modules}
          lessons={lessons}
          progress={progress}
          activityFeed={activityFeed}
        />
      )}

      {tab === "Curriculum" && (
        <CurriculumTab
          course={course}
          modules={modules}
          lessons={lessons}
          readyMedia={readyMedia}
          selectedLesson={selectedLesson}
          setSelectedLesson={setSelectedLesson}
          busy={busy}
          createModule={createModule}
          createLessonWithBlocks={createLessonWithBlocks}
          updateLessonWithBlocks={updateLessonWithBlocks}
          updateModule={updateModule}
          duplicateLesson={duplicateLesson}
          patchCurriculum={patchCurriculum}
        />
      )}

      {tab === "Resources" && (
        <ResourcesTab
          course={course}
          resources={resources}
          lessons={lessons}
          readyMedia={readyMedia}
          busy={busy}
          addResource={addResource}
        />
      )}

      {tab === "Access" && (
        <AccessTab
          course={course}
          groups={groups}
          students={students}
          selectedGroupIds={selectedGroupIds}
          selectedStudentIds={selectedStudentIds}
          busy={busy}
          saveAccess={saveAccess}
        />
      )}

      {tab === "Students" && (
        <StudentsTab progress={progress} modules={modules} lessons={lessons} />
      )}

      {tab === "Settings" && (
        <SettingsTab
          course={course}
          busy={busy}
          saveCourse={saveCourse}
          thumbnailUrl={course.thumbnailUrl}
        />
      )}
    </div>
  );
}
