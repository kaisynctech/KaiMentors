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
  currentLessonTitle,
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
  assert.match(pulse, /type: "group"/);
  assert.match(pulse, /allowStudentReplies: true/);
  assert.match(pulse, /Nudge stuck/);
  assert.match(pulse, /panel=bookings&student=/);
  assert.match(home, /Left off at/);
  assert.match(learning, /Resume from/);
});
