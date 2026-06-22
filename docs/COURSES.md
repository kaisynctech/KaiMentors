# Courses

Last updated: 2026-06-22

## Status

The protected courses Phase 1 application is implemented and migration `202606210025_protected_courses_curriculum_media_progress.sql` is deployed remotely. Application commit `6828fb679121d9f186de8ad62ad0abb2e5b66246` is deployed at `https://kaimentors.vercel.app`. Migration parity, table availability, private storage, anonymous denial, service-role media-session denial, tenant integrity, public/protected route checks, tests, typecheck, and production build pass. Authenticated role, upload/playback/progress, responsive visual and custom-domain acceptance remain pending because production currently has no course/media fixture or configured academy domain.

## Curriculum Model

The hierarchy is `courses` -> `course_modules` -> `lessons` -> `lesson_content_blocks`. Existing course, lesson, resource, and storage paths are retained. Migration `025` creates one default module per existing course and assigns each legacy lesson to it without replacing IDs.

Courses contain title, description, cover, status, order, and `access_mode`. Modules and lessons have independent order, required/optional state, and draft/published/archived lifecycle. A lesson can contain ordered rich text, video, PDF, image, image gallery, and external-link blocks. `lesson_content_block_media` stores ordered gallery images as normalized tenant-owned references.

## Mentor Experience

- `/dashboard/courses` provides an enterprise course table and course creation.
- `/dashboard/courses/[courseId]` provides Overview, Curriculum, Resources, Access, Students, and Settings tabs.
- `/dashboard/media` provides the shared protected Media Library.
- Curriculum order and publication changes warn when learner history exists; existing progress is retained.
- Media replacement atomically updates block, gallery, and resource references. Referenced media cannot be deleted and enters `deletion_blocked` instead.

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

`/student/courses` exposes My Learning, Continue Watching, and Completed views. Course and lesson routes remain academy-context aware. Progress is calculated from published required lessons.

`record_lesson_progress` upserts one tenant/student/lesson row, records first start and first completion, keeps completion monotonic, and updates last activity. The player writes at most every 15 seconds plus pause/end/completion events. Resume position and completion survive curriculum reordering and temporary access loss.

## Publishing

Only published courses, modules, lessons, resources, and ready media can reach students. Draft and archived records remain staff-managed but are absent from active learning flows. Direct URLs are denied by RLS when verification, tenant context, publication state, or grants do not satisfy `can_access_course`.

## Auditing

Course creation/update, module creation, lesson creation, curriculum reorder, access changes, media upload/lifecycle, video upload, and protected media session issuance are auditable. Media session rows provide short-lived delivery evidence without storing signed URLs or secrets.
