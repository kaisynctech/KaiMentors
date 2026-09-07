import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  applyGroupRelativeStuck,
  buildNudgeDraft,
  buildPulseInsights,
  buildNudgeTitle,
  classifyLearner,
  countThinWatches,
  currentLessonTitle,
  isThinWatch,
  learnerIsBehindPeers,
  studentHasCourseAccess,
} from "../lib/academy-progress.ts";
import { formatWatchPosition } from "../lib/courses.ts";

const course = {
  id: "course-1",
  title: "Foundations",
  status: "published",
  access_mode: "all_verified",
};

test("all verified published courses are open to verified students", () => {
  assert.equal(
    studentHasCourseAccess({
      course,
      studentUserId: "s1",
      grants: [],
      studentGroupIds: [],
    }),
    true,
  );
  assert.equal(
    studentHasCourseAccess({
      course: { ...course, status: "draft" },
      studentUserId: "s1",
      grants: [],
      studentGroupIds: [],
    }),
    false,
  );
});

test("restricted courses only include granted students or groups", () => {
  const restricted = { ...course, access_mode: "restricted" };
  assert.equal(
    studentHasCourseAccess({
      course: restricted,
      studentUserId: "s1",
      grants: [],
      studentGroupIds: ["g1"],
    }),
    false,
  );
  assert.equal(
    studentHasCourseAccess({
      course: restricted,
      studentUserId: "s1",
      grants: [{ entity_id: "course-1", group_id: "g1", student_user_id: null, expires_at: null }],
      studentGroupIds: ["g1"],
    }),
    true,
  );
  assert.equal(
    studentHasCourseAccess({
      course: restricted,
      studentUserId: "s1",
      grants: [{ entity_id: "course-1", group_id: null, student_user_id: "s1", expires_at: null }],
      studentGroupIds: [],
    }),
    true,
  );
});

test("quiet students with access and no progress are not started", () => {
  const result = classifyLearner({
    requiredLessonIds: ["l1", "l2"],
    progress: [],
  });
  assert.equal(result.bucket, "not_started");
  assert.equal(result.percent, 0);
});

test("finished required lessons are ahead", () => {
  const result = classifyLearner({
    requiredLessonIds: ["l1", "l2"],
    progress: [
      { lesson_id: "l1", is_started: true, is_completed: true, last_activity_at: "2026-09-01T00:00:00.000Z" },
      { lesson_id: "l2", is_started: true, is_completed: true, last_activity_at: "2026-09-02T00:00:00.000Z" },
    ],
  });
  assert.equal(result.bucket, "ahead");
  assert.equal(result.percent, 100);
});

test("recent incomplete learners are on track and stale ones are stuck", () => {
  const now = Date.parse("2026-09-07T12:00:00.000Z");
  const onTrack = classifyLearner({
    now,
    requiredLessonIds: ["l1", "l2"],
    progress: [
      { lesson_id: "l1", is_started: true, is_completed: true, last_activity_at: "2026-09-06T12:00:00.000Z" },
    ],
  });
  const stuck = classifyLearner({
    now,
    requiredLessonIds: ["l1", "l2"],
    progress: [
      { lesson_id: "l1", is_started: true, is_completed: false, last_activity_at: "2026-08-20T12:00:00.000Z" },
    ],
  });
  assert.equal(onTrack.bucket, "on_track");
  assert.equal(stuck.bucket, "stuck");
});

test("current lesson is the first required lesson not yet completed", () => {
  assert.equal(
    currentLessonTitle(
      [
        { id: "l1", course_id: "c1", title: "Welcome", sort_order: 1 },
        { id: "l2", course_id: "c1", title: "Risk", sort_order: 2 },
      ],
      [{ lesson_id: "l1", is_started: true, is_completed: true, last_activity_at: null }],
    ),
    "Risk",
  );
});

test("digest names quiet students and unfinished access", () => {
  const lines = buildPulseInsights({
    courseTitle: "Foundations",
    counts: { ahead: 2, on_track: 3, stuck: 4, not_started: 8 },
    quietLessonTitle: "Risk",
  });
  assert.match(lines[0], /8 students have not opened/);
  assert.match(lines[1], /gone quiet/);
  assert.match(lines[1], /Risk/);
});

test("digest names students behind their group", () => {
  const lines = buildPulseInsights({
    courseTitle: "Foundations",
    counts: { ahead: 0, on_track: 1, stuck: 3, not_started: 0 },
    quietLessonTitle: "Risk",
    behindGroupCount: 3,
  });
  assert.match(lines[0], /behind their group/);
  assert.match(lines[0], /Risk/);
});

test("a student still active can be stuck when the group has moved on", () => {
  assert.equal(
    learnerIsBehindPeers({ completed: 1, peerCompleted: [4, 4, 4] }),
    true,
  );
  assert.equal(
    learnerIsBehindPeers({ completed: 1, peerCompleted: [4] }),
    false,
  );
  const learners = applyGroupRelativeStuck([
    { applicationId: "a", bucket: "on_track", completed: 1, groupIds: ["gold"] },
    { applicationId: "b", bucket: "ahead", completed: 4, groupIds: ["gold"] },
    { applicationId: "c", bucket: "ahead", completed: 4, groupIds: ["gold"] },
  ]);
  assert.equal(learners[0]?.bucket, "stuck");
  assert.equal(learners[0]?.stuckReason, "behind_group");
  assert.equal(learners[1]?.bucket, "ahead");
});

test("quiet students stay stuck even if the group has not moved", () => {
  const learners = applyGroupRelativeStuck([
    {
      applicationId: "a",
      bucket: "stuck",
      completed: 1,
      groupIds: ["gold"],
      stuckReason: "quiet",
    },
    { applicationId: "b", bucket: "on_track", completed: 1, groupIds: ["gold"] },
    { applicationId: "c", bucket: "on_track", completed: 1, groupIds: ["gold"] },
  ]);
  assert.equal(learners[0]?.stuckReason, "quiet");
  assert.equal(learners[1]?.bucket, "on_track");
});

test("nudge titles name the bucket, group, and course", () => {
  assert.equal(
    buildNudgeTitle({ bucket: "stuck", count: 12 }),
    "Stuck · 12 students",
  );
  assert.equal(
    buildNudgeTitle({
      bucket: "not_started",
      courseTitle: "Foundations",
      groupName: "Gold",
      count: 8,
    }),
    "Not started · Gold · Foundations",
  );
});

test("nudge drafts stay specific to the coaching moment", () => {
  assert.match(
    buildNudgeDraft({ bucket: "stuck", courseTitle: "Foundations" }),
    /stalled on “Foundations”/,
  );
  assert.match(
    buildNudgeDraft({ bucket: "not_started" }),
    /haven’t opened this yet/,
  );
});

test("watch position is a clock time, not a duration phrase", () => {
  assert.equal(formatWatchPosition(null), null);
  assert.equal(formatWatchPosition(0), null);
  assert.equal(formatWatchPosition(14), "0:14");
  assert.equal(formatWatchPosition(860), "14:20");
  assert.equal(formatWatchPosition(3723), "1:02:03");
});

const started = "2026-09-07T12:00:00.000Z";
function secondsLater(seconds) {
  return new Date(Date.parse(started) + seconds * 1000).toISOString();
}

test("incomplete or short lessons are not flagged as thin watches", () => {
  assert.equal(
    isThinWatch({
      isCompleted: false,
      positionSeconds: 0,
      durationSeconds: 600,
    }),
    false,
  );
  assert.equal(
    isThinWatch({
      isCompleted: true,
      positionSeconds: 0,
      firstStartedAt: started,
      firstCompletedAt: secondsLater(5),
      durationSeconds: null,
    }),
    false,
  );
  assert.equal(
    isThinWatch({
      isCompleted: true,
      positionSeconds: 40,
      firstStartedAt: started,
      firstCompletedAt: secondsLater(40),
      durationSeconds: 45,
    }),
    false,
  );
});

test("mark complete near the start of a video is a thin watch", () => {
  assert.equal(
    isThinWatch({
      isCompleted: true,
      positionSeconds: 0,
      firstStartedAt: started,
      firstCompletedAt: secondsLater(2),
      durationSeconds: 600,
    }),
    true,
  );
});

test("skip to the end of a long video in seconds is a thin watch", () => {
  assert.equal(
    isThinWatch({
      isCompleted: true,
      positionSeconds: 3240,
      firstStartedAt: started,
      firstCompletedAt: secondsLater(8),
      durationSeconds: 3600,
    }),
    true,
  );
});

test("skipping a four-minute video after one minute is a thin watch", () => {
  assert.equal(
    isThinWatch({
      isCompleted: true,
      positionSeconds: 2160,
      firstStartedAt: started,
      firstCompletedAt: secondsLater(60),
      durationSeconds: 240,
    }),
    true,
  );
});

test("watching most of a video then completing is not a thin watch", () => {
  assert.equal(
    isThinWatch({
      isCompleted: true,
      positionSeconds: 3240,
      firstStartedAt: started,
      firstCompletedAt: secondsLater(20 * 60),
      durationSeconds: 3600,
    }),
    false,
  );
  assert.equal(
    isThinWatch({
      isCompleted: true,
      positionSeconds: 81,
      firstStartedAt: started,
      firstCompletedAt: secondsLater(80),
      durationSeconds: 90,
    }),
    false,
  );
});

test("thin watch counts name the first skipped lesson", () => {
  const result = countThinWatches(
    [
      { id: "l1", course_id: "c1", title: "Welcome", sort_order: 1, duration_seconds: 600 },
      { id: "l2", course_id: "c1", title: "Risk", sort_order: 2, duration_seconds: 600 },
    ],
    [
      {
        lesson_id: "l1",
        is_started: true,
        is_completed: true,
        last_activity_at: secondsLater(4),
        position_seconds: 540,
        first_started_at: started,
        first_completed_at: secondsLater(4),
      },
      {
        lesson_id: "l2",
        is_started: true,
        is_completed: true,
        last_activity_at: secondsLater(40 * 60),
        position_seconds: 540,
        first_started_at: started,
        first_completed_at: secondsLater(40 * 60),
      },
    ],
  );
  assert.equal(result.count, 1);
  assert.equal(result.firstTitle, "Welcome");
});

test("digest names students who completed without watching", () => {
  const lines = buildPulseInsights({
    courseTitle: "Foundations",
    counts: { ahead: 1, on_track: 2, stuck: 0, not_started: 0 },
    quietLessonTitle: null,
    thinWatchStudentCount: 3,
  });
  assert.match(lines.at(-1) ?? "", /3 students completed lessons without watching/);
});

test("pulse nudges through group conversations and students see leftover time", async () => {
  const root = path.resolve(import.meta.dirname, "..");
  const pulse = await readFile(
    path.join(root, "components", "academy-progress-pulse.tsx"),
    "utf8",
  );
  const home = await readFile(path.join(root, "app", "student", "page.tsx"), "utf8");
  const learning = await readFile(
    path.join(root, "app", "student", "courses", "page.tsx"),
    "utf8",
  );
  const course = await readFile(
    path.join(root, "app", "student", "courses", "[courseId]", "page.tsx"),
    "utf8",
  );
  const lesson = await readFile(
    path.join(root, "app", "student", "courses", "[courseId]", "lessons", "[lessonId]", "page.tsx"),
    "utf8",
  );
  assert.match(pulse, /type: "group"/);
  assert.match(pulse, /allowStudentReplies: true/);
  assert.match(pulse, /Nudge stuck/);
  assert.match(pulse, /panel=bookings&student=/);
  assert.match(pulse, /Barely watched/);
  assert.match(home, /Left off at/);
  assert.match(learning, /Resume from/);
  assert.doesNotMatch(home, /Barely watched/);
  assert.doesNotMatch(learning, /Barely watched/);
  assert.doesNotMatch(course, /Barely watched/);
  assert.doesNotMatch(lesson, /Barely watched/);
});
