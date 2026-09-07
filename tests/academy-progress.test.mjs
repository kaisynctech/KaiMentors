import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPulseInsights,
  classifyLearner,
  currentLessonTitle,
  studentHasCourseAccess,
} from "../lib/academy-progress.ts";

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
