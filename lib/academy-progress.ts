export const STUCK_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export const PULSE_BUCKETS = [
  "ahead",
  "on_track",
  "stuck",
  "not_started",
] as const;

export type PulseBucket = (typeof PULSE_BUCKETS)[number];

export type CourseAccessMode = "all_verified" | "restricted" | "one_to_one";

export type PulseCourse = {
  id: string;
  title: string;
  status: "draft" | "published" | "archived";
  access_mode: CourseAccessMode;
};

export type PulseGrant = {
  entity_id: string;
  group_id: string | null;
  student_user_id: string | null;
  expires_at: string | null;
};

export type PulseProgressRow = {
  lesson_id: string;
  is_started: boolean;
  is_completed: boolean;
  last_activity_at: string | null;
};

export type PulseLessonRef = {
  id: string;
  course_id: string;
  title: string;
  sort_order: number;
};

export function studentHasCourseAccess(args: {
  course: PulseCourse;
  studentUserId: string;
  grants: PulseGrant[];
  studentGroupIds: string[];
  now?: number;
}): boolean {
  if (args.course.status !== "published") return false;
  const now = args.now ?? Date.now();
  const active = args.grants.filter(
    (grant) =>
      grant.entity_id === args.course.id &&
      (!grant.expires_at || Date.parse(grant.expires_at) > now),
  );

  if (args.course.access_mode === "all_verified") return true;

  if (args.course.access_mode === "restricted") {
    return active.some(
      (grant) =>
        grant.student_user_id === args.studentUserId ||
        (grant.group_id != null && args.studentGroupIds.includes(grant.group_id)),
    );
  }

  if (args.course.access_mode === "one_to_one") {
    const individual = active.filter(
      (grant) => grant.student_user_id != null && grant.group_id == null,
    );
    return (
      individual.length === 1 &&
      individual[0]?.student_user_id === args.studentUserId
    );
  }

  return false;
}

export function classifyLearner(args: {
  requiredLessonIds: string[];
  progress: PulseProgressRow[];
  now?: number;
}): {
  bucket: PulseBucket;
  completed: number;
  started: number;
  percent: number;
  lastActivityAt: string | null;
} {
  const now = args.now ?? Date.now();
  const required = new Set(args.requiredLessonIds);
  const relevant = args.progress.filter((row) => required.has(row.lesson_id));
  const started = relevant.filter((row) => row.is_started || row.is_completed).length;
  const completed = relevant.filter((row) => row.is_completed).length;
  const lastActivityAt =
    relevant
      .map((row) => row.last_activity_at)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
  const total = required.size;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  if (total === 0) {
    return {
      bucket: started > 0 ? "on_track" : "not_started",
      completed,
      started,
      percent,
      lastActivityAt,
    };
  }
  if (completed >= total) {
    return { bucket: "ahead", completed, started, percent, lastActivityAt };
  }
  if (started === 0) {
    return { bucket: "not_started", completed, started, percent, lastActivityAt };
  }
  const quiet =
    !lastActivityAt || now - Date.parse(lastActivityAt) > STUCK_AFTER_MS;
  return {
    bucket: quiet ? "stuck" : "on_track",
    completed,
    started,
    percent,
    lastActivityAt,
  };
}

export const GROUP_LAG_MIN_PEERS = 2;

export type StuckReason = "quiet" | "behind_group";

export function medianCompleted(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

export function learnerIsBehindPeers(args: {
  completed: number;
  peerCompleted: number[];
  minPeers?: number;
}): boolean {
  const minPeers = args.minPeers ?? GROUP_LAG_MIN_PEERS;
  const ahead = args.peerCompleted.filter((value) => value > args.completed);
  if (ahead.length < minPeers) return false;
  return args.completed < medianCompleted(args.peerCompleted);
}

export function applyGroupRelativeStuck<
  T extends {
    applicationId: string;
    bucket: PulseBucket;
    completed: number;
    groupIds: string[];
    stuckReason?: StuckReason | null;
  },
>(learners: T[]): T[] {
  const byGroup = new Map<string, T[]>();
  for (const learner of learners) {
    for (const groupId of learner.groupIds) {
      const list = byGroup.get(groupId) ?? [];
      list.push(learner);
      byGroup.set(groupId, list);
    }
  }

  return learners.map((learner) => {
    if (learner.bucket !== "on_track") return learner;

    const cohorts: T[][] = [];
    if (learner.groupIds.length > 0) {
      for (const groupId of learner.groupIds) {
        const members = byGroup.get(groupId);
        if (members && members.length >= GROUP_LAG_MIN_PEERS + 1) {
          cohorts.push(members);
        }
      }
    } else if (learners.length >= GROUP_LAG_MIN_PEERS + 1) {
      cohorts.push(learners);
    }

    const behind = cohorts.some((cohort) =>
      learnerIsBehindPeers({
        completed: learner.completed,
        peerCompleted: cohort
          .filter((peer) => peer.applicationId !== learner.applicationId)
          .map((peer) => peer.completed),
      }),
    );
    if (!behind) return learner;
    return {
      ...learner,
      bucket: "stuck" as const,
      stuckReason: "behind_group" as const,
    };
  });
}

export function currentLessonTitle(
  requiredLessons: PulseLessonRef[],
  progress: PulseProgressRow[],
): string | null {
  const completed = new Set(
    progress.filter((row) => row.is_completed).map((row) => row.lesson_id),
  );
  const next = requiredLessons.find((lesson) => !completed.has(lesson.id));
  return next?.title ?? null;
}

export function buildPulseInsights(args: {
  courseTitle: string | null;
  counts: Record<PulseBucket, number>;
  quietLessonTitle: string | null;
  behindGroupCount?: number;
}): string[] {
  const insights: string[] = [];
  const course = args.courseTitle ? `“${args.courseTitle}”` : "your published courses";
  if (args.counts.not_started > 0) {
    insights.push(
      `${args.counts.not_started} student${args.counts.not_started === 1 ? " has" : "s have"} not opened ${course}.`,
    );
  }
  if (args.counts.stuck > 0) {
    const lesson = args.quietLessonTitle ? ` on “${args.quietLessonTitle}”` : "";
    const behind = args.behindGroupCount ?? 0;
    if (behind > 0 && behind >= args.counts.stuck) {
      insights.push(
        `${args.counts.stuck} student${args.counts.stuck === 1 ? " is" : "s are"} behind their group${lesson}.`,
      );
    } else if (behind > 0) {
      insights.push(
        `${args.counts.stuck} student${args.counts.stuck === 1 ? " is" : "s are"} stuck — quiet for 7+ days or behind their group${lesson}.`,
      );
    } else {
      insights.push(
        `${args.counts.stuck} student${args.counts.stuck === 1 ? " has" : "s have"} gone quiet for 7+ days${lesson}.`,
      );
    }
  }
  if (args.counts.ahead > 0) {
    insights.push(
      `${args.counts.ahead} student${args.counts.ahead === 1 ? " is" : "s are"} ahead of the current path.`,
    );
  }
  if (insights.length === 0) {
    insights.push("No learner movement to review yet. Publish a course and students will appear here.");
  }
  return insights;
}

export function emptyBucketCounts(): Record<PulseBucket, number> {
  return { ahead: 0, on_track: 0, stuck: 0, not_started: 0 };
}

export const NUDGE_BUCKETS = ["stuck", "not_started"] as const;
export type NudgeBucket = (typeof NUDGE_BUCKETS)[number];

export function isNudgeBucket(value: string): value is NudgeBucket {
  return (NUDGE_BUCKETS as readonly string[]).includes(value);
}

export function buildNudgeTitle(args: {
  bucket: NudgeBucket;
  courseTitle?: string | null;
  groupName?: string | null;
  count: number;
}): string {
  const who = args.bucket === "stuck" ? "Stuck" : "Not started";
  const scope = [args.groupName, args.courseTitle].filter(Boolean);
  const title = scope.length
    ? `${who} · ${scope.join(" · ")}`
    : `${who} · ${args.count} student${args.count === 1 ? "" : "s"}`;
  return title.slice(0, 160);
}

export function buildNudgeDraft(args: {
  bucket: NudgeBucket;
  courseTitle?: string | null;
}): string {
  if (args.bucket === "stuck") {
    return args.courseTitle
      ? `Checking in — it looks like you have stalled on “${args.courseTitle}”. Reply here if you want help picking it back up.`
      : "Checking in — it looks like you have stalled. Reply here if you want help picking it back up.";
  }
  return args.courseTitle
    ? `You’ve got access to “${args.courseTitle}” and haven’t opened it yet. Start the first lesson when you’re ready, or reply if something is blocking you.`
    : "You’ve got access and haven’t opened this yet. Start the first lesson when you’re ready, or reply if something is blocking you.";
}
