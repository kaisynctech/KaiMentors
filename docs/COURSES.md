# Courses

Last updated: 2026-06-23

## Status

The protected courses Phase 1 application is implemented and migration `202606210025_protected_courses_curriculum_media_progress.sql` is deployed remotely. Application commit `6828fb679121d9f186de8ad62ad0abb2e5b66246` is deployed at `https://kaimentors.vercel.app`. Migration parity, table availability, private storage, anonymous denial, service-role media-session denial, tenant integrity, public/protected route checks, tests, typecheck, and production build pass. Authenticated role, upload/playback/progress, responsive visual and custom-domain acceptance remain pending because production currently has no course/media fixture or configured academy domain.

## Curriculum Model

The hierarchy is `courses` -> `course_modules` -> `lessons` -> `lesson_content_blocks`. Existing course, lesson, resource, and storage paths are retained. Migration `025` creates one default module per existing course and assigns each legacy lesson to it without replacing IDs.

Courses contain title, description, cover, status, order, and `access_mode`. Modules and lessons have independent order, required/optional state, and draft/published/archived lifecycle. A lesson can contain ordered rich text, video, PDF, image, image gallery, and external-link blocks. `lesson_content_block_media` stores ordered gallery images as normalized tenant-owned references.

## Mentor Experience

**Course library — `/dashboard/courses`**

The page renders a stats row (total courses, published count, total lessons, active learners), filter pills (All / Published / Draft / Archived), and a responsive card grid. Each card shows a 96 px thumbnail, a status badge, title, module/lesson counts, a learner-completeness progress bar, and an active-learner count. An "Add" dashed-border card and a "New course" button in the page header both open a modal. The modal contains the course creation form (title, description, status, sort order, optional thumbnail upload) with a focus trap, Escape-key dismissal, and backdrop-click dismissal.

**Course detail — `/dashboard/courses/[courseId]`**

The component is split into a parent shell (`CourseDetailManager`) and six independent tab subcomponents under `components/course-tabs/`:

- **Overview** — four KPI cards (Modules, Lessons, Active learners, Completion rate) and an activity feed. Each activity row shows avatar initials, student name, the action string ("Completed lesson N of M" or "Started lesson N"), and time-ago.
- **Curriculum** — two-column split. Left panel: collapsible module tree with per-module status selects that write immediately via PATCH to the curriculum endpoint (409 confirmation preserved). Each lesson row shows a published/draft icon and highlights the selected lesson. An "Add lesson" row appears at the bottom of each module. Right panel: the selected lesson's content blocks or the active create form (create module, create lesson, add block). Drag-and-drop is deferred to Phase 2.
- **Resources** — left resource list, right add-resource form. All original FormData fields are preserved.
- **Access** — three radio-style option cards (All verified students / Selected groups or students / One-to-one coaching). Selecting "restricted" reveals group-checkbox and student-checkbox pickers. The selected mode is carried via a hidden input. When the mode is not "restricted", no `groupIds` or `studentIds` fields appear in the form; `saveAccess` in the parent shell pre-fills non-access fields from the `course` prop before calling the API.
- **Students** — a stats row (Total learners, Completed, In progress, Avg progress) followed by a per-student progress panel. Each row shows avatar initials, full name, last-activity time-ago, a progress bar (blue for in-progress, green for complete), and a "Completed" badge. Export is aria-disabled and reserved for a future release.
- **Settings** — title, description, status, sort order, and a save button. `saveCourse` pre-fills access fields from the current course state before writing.

`/dashboard/media` provides the shared protected Media Library. Curriculum order and publication changes warn when learner history exists; existing progress is retained. Media replacement atomically updates block, gallery, and resource references. Referenced media cannot be deleted and enters `deletion_blocked` instead.

## Media Library

`course_media` is the normalized metadata and lifecycle record. Supported Phase 1 media are MP4/WebM video up to the bucket's 500 MB limit, PDF up to 100 MB, and PNG/JPEG/WebP images up to 20 MB. Browser uploads use TUS directly to Supabase Storage, support resume, and never proxy large bodies through Next.js or Vercel. The server validates declared MIME, extension, size, and the uploaded file signature before marking an asset ready.

Lifecycle states are `uploading`, `processing`, `ready`, `failed`, `replaced`, `archived`, and `deletion_blocked`. Storage paths are tenant-prefixed as `{trader_id}/media/{media_id}/source.{extension}`.

Students have no direct `storage.objects` SELECT policy. `issue_course_media_session` proves current course access and records `course_media_access_sessions`; the server then returns a private five-minute signed URL with `no-store` response headers. Reused assets resolve against an accessible course reference rather than an arbitrary first reference. UI download controls, PDF toolbar suppression, and academy/student watermarking deter casual redistribution but are not DRM.

## Access Contract

`can_access_course(course_id, user_id)` is authoritative for course, module, lesson, content-block, gallery-media, resource, and media-session reads. Every student must have a verified application in the course tenant.

- `all_verified`: every verified student in that academy.
- `restricted`: at least one active direct-student or group grant.
- `one_to_one`: exactly one active direct-student grant and no group grant.

`set_course_access` validates all recipients in the course tenant and replaces grants atomically. Access removal takes effect for future content queries and media sessions while retaining progress history.

## Student Learning

**My Learning — `/student/courses`**

The page opens with a hero (portal name eyebrow, "My Learning" heading, subtitle). When the student has an in-progress lesson, a full-width "Continue Watching" resume card appears below the hero. The resume card uses a 180 px left thumbnail column (responsive: stacks at 900 px) containing the course thumbnail, and a right body showing the course name as an eyebrow, the lesson title, the module name, a 4 px blue progress bar, a progress label ("X% · Y required lessons"), and a black "Resume lesson" button linking directly to the lesson player. A "Library" section card grid follows, showing all accessible published courses; each card has a 140 px thumbnail, title, lesson count, a progress bar, and a "Completed" badge when the student has finished all required lessons. A "Completed" section appears below the library only when at least one course is fully finished.

**Student course detail — `/student/courses/[courseId]`**

The hero section shows the course thumbnail in a 280 px left column, with the course title, description, lesson count, and a 4 px blue progress bar on the right. Module cards list lessons in three visual states: a green checkmark circle for completed lessons, a blue-bordered row with a "Resume" pill and blue PlayCircle icon for the most recently active in-progress lesson, and a gray numbered circle for upcoming lessons. The "Resume" lesson is determined from the most recently active `is_started && !is_completed` progress row.

**Lesson player — `/student/courses/[courseId]/lessons/[lessonId]`**

The page wraps the existing `ProtectedLessonContent` component (props are identical: `blocks`, `completed`, `lessonId`, `resumeSeconds`, `watermark`). Above the player: a back link "← Course curriculum" returning to the course detail page; a lesson header card with the module/course eyebrow, lesson title, and description. Below the player: a green completion notice (`role="status"`) when `progress.is_completed === true`. At the page bottom: previous/next lesson navigation using ghost (white) and primary (black) button styles. Navigation links are absent rather than disabled when no previous or next lesson exists.

`record_lesson_progress` upserts one tenant/student/lesson row, records first start and first completion, keeps completion monotonic, and updates last activity. The player writes at most every 15 seconds plus pause/end/completion events. Resume position and completion survive curriculum reordering and temporary access loss.

## Publishing

Only published courses, modules, lessons, resources, and ready media can reach students. Draft and archived records remain staff-managed but are absent from active learning flows. Direct URLs are denied by RLS when verification, tenant context, publication state, or grants do not satisfy `can_access_course`.

## Auditing

Course creation/update, module creation, lesson creation, curriculum reorder, access changes, media upload/lifecycle, video upload, and protected media session issuance are auditable. Media session rows provide short-lived delivery evidence without storing signed URLs or secrets.
