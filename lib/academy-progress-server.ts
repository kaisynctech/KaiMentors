import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyGroupRelativeStuck,
  buildPulseInsights,
  classifyLearner,
  currentLessonTitle,
  emptyBucketCounts,
  studentHasCourseAccess,
  type PulseBucket,
  type PulseCourse,
  type PulseGrant,
  type PulseLessonRef,
  type PulseProgressRow,
  type StuckReason,
} from "@/lib/academy-progress";

export type PulseLearner = {
  applicationId: string;
  studentUserId: string;
  fullName: string;
  bucket: PulseBucket;
  completed: number;
  required: number;
  percent: number;
  lastActivityAt: string | null;
  currentLessonTitle: string | null;
  groupIds: string[];
  stuckReason: StuckReason | null;
};

export type PulseLessonStat = {
  id: string;
  courseId: string;
  courseTitle: string;
  title: string;
  sortOrder: number;
  accessCount: number;
  startedCount: number;
  completedCount: number;
};

export type AcademyProgressPulse = {
  courses: Array<{ id: string; title: string }>;
  groups: Array<{ id: string; name: string; color: string }>;
  learners: PulseLearner[];
  lessons: PulseLessonStat[];
  counts: Record<PulseBucket, number>;
  insights: string[];
  selectedCourseTitle: string | null;
};

export async function loadAcademyProgressPulse(
  supabase: SupabaseClient,
  traderId: string,
  filters?: { courseId?: string | null; groupId?: string | null },
): Promise<AcademyProgressPulse> {
  const courseId = filters?.courseId || null;
  const groupId = filters?.groupId || null;

  const [
    coursesResult,
    applicationsResult,
    groupsResult,
    membersResult,
    grantsResult,
    lessonsResult,
    progressResult,
  ] = await Promise.all([
    supabase
      .from("courses")
      .select("id,title,status,access_mode")
      .eq("trader_id", traderId)
      .eq("status", "published")
      .order("sort_order")
      .order("title"),
    supabase
      .from("student_applications")
      .select("id,student_user_id,full_name,profile:profiles!student_user_id(full_name)")
      .eq("trader_id", traderId)
      .eq("status", "verified")
      .not("student_user_id", "is", null),
    supabase
      .from("student_groups")
      .select("id,name,color,system_key")
      .eq("trader_id", traderId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("student_group_members")
      .select("group_id,application_id")
      .eq("trader_id", traderId),
    supabase
      .from("content_access_grants")
      .select("entity_id,group_id,student_user_id,expires_at")
      .eq("trader_id", traderId)
      .eq("entity_type", "course"),
    supabase
      .from("lessons")
      .select("id,course_id,title,sort_order,is_required,status")
      .eq("trader_id", traderId)
      .eq("status", "published")
      .eq("is_required", true)
      .order("sort_order"),
    supabase
      .from("lesson_progress")
      .select("student_user_id,course_id,lesson_id,is_started,is_completed,last_activity_at")
      .eq("trader_id", traderId),
  ]);

  const allCourses = (coursesResult.data ?? []) as PulseCourse[];
  const courses = courseId
    ? allCourses.filter((course) => course.id === courseId)
    : allCourses;
  const courseIds = new Set(courses.map((course) => course.id));

  const groups = (groupsResult.data ?? []).filter(
    (group) => group.system_key == null,
  ) as Array<{ id: string; name: string; color: string; system_key: string | null }>;

  const applications = (applicationsResult.data ?? []).filter(
    (row) => Boolean(row.student_user_id),
  );

  const membersByApplication = new Map<string, string[]>();
  for (const member of membersResult.data ?? []) {
    const list = membersByApplication.get(member.application_id) ?? [];
    list.push(member.group_id);
    membersByApplication.set(member.application_id, list);
  }

  const grants = (grantsResult.data ?? []) as PulseGrant[];
  const requiredLessons = ((lessonsResult.data ?? []) as Array<
    PulseLessonRef & { is_required: boolean; status: string }
  >).filter((lesson) => courseIds.has(lesson.course_id));

  const progressByStudent = new Map<string, PulseProgressRow[]>();
  for (const row of progressResult.data ?? []) {
    if (!courseIds.has(row.course_id)) continue;
    const list = progressByStudent.get(row.student_user_id) ?? [];
    list.push({
      lesson_id: row.lesson_id,
      is_started: row.is_started,
      is_completed: row.is_completed,
      last_activity_at: row.last_activity_at,
    });
    progressByStudent.set(row.student_user_id, list);
  }

  const now = Date.now();
  let learners: PulseLearner[] = [];

  for (const application of applications) {
    const groupIds = membersByApplication.get(application.id) ?? [];
    if (groupId && !groupIds.includes(groupId)) continue;

    const accessible = courses.filter((course) =>
      studentHasCourseAccess({
        course,
        studentUserId: application.student_user_id,
        grants,
        studentGroupIds: groupIds,
        now,
      }),
    );
    if (accessible.length === 0) continue;

    const accessibleIds = new Set(accessible.map((course) => course.id));
    const scopedLessons = requiredLessons.filter((lesson) =>
      accessibleIds.has(lesson.course_id),
    );
    const progress = progressByStudent.get(application.student_user_id) ?? [];
    const classified = classifyLearner({
      requiredLessonIds: scopedLessons.map((lesson) => lesson.id),
      progress,
      now,
    });

    const profile = Array.isArray(application.profile)
      ? application.profile[0] ?? null
      : application.profile;
    learners.push({
      applicationId: application.id,
      studentUserId: application.student_user_id,
      fullName: application.full_name?.trim() || profile?.full_name?.trim() || "Student",
      bucket: classified.bucket,
      completed: classified.completed,
      required: scopedLessons.length,
      percent: classified.percent,
      lastActivityAt: classified.lastActivityAt,
      currentLessonTitle: currentLessonTitle(scopedLessons, progress),
      groupIds,
      stuckReason: classified.bucket === "stuck" ? "quiet" : null,
    });
  }

  learners = applyGroupRelativeStuck(learners);

  const counts = emptyBucketCounts();
  for (const learner of learners) counts[learner.bucket] += 1;

  const accessStudents = learners;
  const lessons: PulseLessonStat[] = requiredLessons.map((lesson) => {
    const course = courses.find((item) => item.id === lesson.course_id);
    let startedCount = 0;
    let completedCount = 0;
    for (const learner of accessStudents) {
      const rows = progressByStudent.get(learner.studentUserId) ?? [];
      const row = rows.find((item) => item.lesson_id === lesson.id);
      if (row?.is_started || row?.is_completed) startedCount += 1;
      if (row?.is_completed) completedCount += 1;
    }
    return {
      id: lesson.id,
      courseId: lesson.course_id,
      courseTitle: course?.title ?? "Course",
      title: lesson.title,
      sortOrder: lesson.sort_order,
      accessCount: accessStudents.length,
      startedCount,
      completedCount,
    };
  });

  const stuckLesson =
    lessons
      .map((lesson) => ({
        title: lesson.title,
        quiet: accessStudents.filter(
          (learner) =>
            learner.bucket === "stuck" &&
            learner.currentLessonTitle === lesson.title,
        ).length,
      }))
      .sort((a, b) => b.quiet - a.quiet)[0] ?? null;

  const selectedCourseTitle =
    courses.length === 1 ? courses[0]?.title ?? null : null;

  return {
    courses: allCourses.map((course) => ({ id: course.id, title: course.title })),
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      color: group.color,
    })),
    learners: learners.sort((a, b) => a.fullName.localeCompare(b.fullName)),
    lessons,
    counts,
    insights: buildPulseInsights({
      courseTitle: selectedCourseTitle,
      counts,
      quietLessonTitle:
        stuckLesson && stuckLesson.quiet > 0 ? stuckLesson.title : null,
      behindGroupCount: learners.filter(
        (learner) => learner.stuckReason === "behind_group",
      ).length,
    }),
    selectedCourseTitle,
  };
}
