# Architect Handoff — Courses UI Redesign

Date: 2026-06-23
Status: **Approved by Product Owner — ready for Architect**
Related design spec: `docs/COURSES_DESIGN_SPEC.md`

---

## Objective

Rebuild the visual and interaction layer of the Courses product area for both the mentor dashboard and the student learning experience. The underlying data model, APIs, access control, media sessions, and business logic are complete and remain unchanged. This handoff concerns the UI only.

The current implementation is functional but uses a developer-style interface — plain HTML tables, numeric order inputs, raw field names (`all_verified`, `one_to_one`), and forms that are always visible. The goal is to replace this with a polished, professional interface that a mentor and their students would be proud to use every day.

The approved design is documented in `docs/COURSES_DESIGN_SPEC.md` with full screen-by-screen specifications.

---

## Customer Problem

Mentors find the current Courses UI difficult to navigate and unintuitive. Creating a module structure requires entering sort order numbers manually. Access modes are named in snake_case. The course list shows a bare table with no visual representation of the courses. There is no clear sense of learner activity at a glance.

Students have a functional but plain learning page with no strong sense of progress or flow between lessons.

---

## Desired Outcomes

**Mentor:**
- Opens Courses and immediately sees a visual library of their courses with thumbnails, status, and active learner counts.
- Creates and manages modules and lessons through a visual tree, not a form with number inputs.
- Understands who has access to a course through plain English options with clear explanations.
- Sees student progress as visual bars, not raw numbers.

**Student:**
- Arrives at My Learning and immediately sees where to resume.
- Navigates their course curriculum with a clear sense of which lessons are done and which are next.
- Watches protected video with their academy watermark visible.
- Views PDFs inline with no download option visible.
- Moves between lessons and sees their completion state update.

---

## Current Implementation Awareness

The following components exist and must be redesigned, not rewritten from scratch where logic can be preserved:

- `components/course-manager.tsx` — renders the course list and new course form. Currently a two-column layout: create card left, plain HTML table right. The data fetching in `app/dashboard/courses/page.tsx` already provides course list with thumbnail URLs and lesson counts.

- `components/course-detail-manager.tsx` — renders all six tabs for a course. Currently one large client component with inline form logic. The tab structure (Overview, Curriculum, Resources, Access, Students, Settings) must be retained. The data loading in `app/dashboard/courses/[courseId]/page.tsx` already fetches modules, lessons, content blocks, media, groups, students, grants, progress, and resources in one parallel query.

- `app/student/courses/page.tsx` — student My Learning page. Currently renders Continue Watching, Library, and Completed sections. The data logic is correct and can be preserved; only the visual layer needs redesigning.

- `app/student/courses/[courseId]/page.tsx` — student course detail. Renders modules and lessons with progress state. Visual redesign only.

- `app/student/courses/[courseId]/lessons/[lessonId]/page.tsx` — lesson player. Renders `ProtectedLessonContent` component. The player and block rendering are already implemented; the page wrapper and navigation need the design treatment.

- `components/course-detail-manager.module.css`, `components/course-manager.module.css`, `app/student/courses/courses.module.css` — all CSS modules to be rewritten to match the approved design.

---

## Scope

**In scope:**
- Visual redesign of `course-manager.tsx` (course card grid, stats row, filter tabs)
- Visual redesign of all six tabs in `course-detail-manager.tsx`
- Visual redesign of `app/student/courses/page.tsx` (My Learning)
- Visual redesign of `app/student/courses/[courseId]/page.tsx` (course detail)
- Visual redesign of `app/student/courses/[courseId]/lessons/[lessonId]/page.tsx` (lesson player wrapper and navigation)
- Rewriting the corresponding CSS modules

**Out of scope:**
- `components/protected-lesson-content.tsx` — the video player, PDF viewer, image, and text block rendering components. These are not changing.
- All API routes (`/api/courses/*`, `/api/lessons/*`, `/api/course-media/*`, `/api/course-progress`)
- Database schema, migrations, RLS policies
- Access control logic (`can_access_course`, `set_course_access`)
- Media session issuance
- The Media Library page (`/dashboard/media`)
- Progress recording logic
- Any other product area

---

## Role and Tenant Boundaries

- Mentor dashboard changes apply only to authenticated mentor sessions. The `trader_id` is always sourced from the authenticated user's `trader_members` record. No cross-tenant data must be exposed.
- Student experience changes apply only to authenticated, verified students. The `trader_id` is always sourced from the student's verified `student_applications` record for the active portal/academy context. A student must never see another academy's content.
- KaiTrades is the acceptance test tenant. All acceptance testing uses KaiTrades, not Traders Confidence or Milkers FX.

---

## Business Rules

These rules must be preserved exactly through the redesign:

1. A course card must only show a course owned by the authenticated mentor's `trader_id`.
2. The Access tab "all verified" / "selected groups or students" / "one-to-one coaching only" labels are display-only translations. The underlying values saved to the database remain `all_verified`, `restricted`, and `one_to_one`.
3. Access changes must save immediately and take effect for future media sessions and content queries without requiring a page reload beyond what the current implementation already handles.
4. The lesson player watermark must display "Academy name · Student full name · Student email" and must remain visible but non-obstructive during video playback.
5. PDFs must open in view-only mode. No download button or browser PDF toolbar download option must be presented. The current `ProtectedLessonContent` implementation already handles this — do not bypass it.
6. Progress must continue to be written at pause, end, and completion events. Do not change the recording interval.
7. Draft and archived courses, modules, and lessons must not appear to students. Publication state filtering is handled by the existing queries — do not change query filters.
8. The Continue Watching section on My Learning must only appear when the student has at least one in-progress, non-completed course. The Completed section must only appear when at least one course is fully completed.

---

## Interaction Patterns

### Curriculum builder — contextual right panel
The right panel must be contextual — it changes based on the mentor's last action and never shows multiple stacked forms simultaneously. The current implementation renders all three forms (Add module, Add lesson, Add content block) in a permanent stack on the right. This must be replaced with the following states:

- **Default / nothing selected:** Empty state prompt.
- **Lesson row clicked:** Show that lesson's content blocks with "+ Add block" button.
- **"+ Add module" button clicked:** Show only the Add module form.
- **"+ Add lesson" clicked under a module:** Show only the Add lesson form, with that module pre-selected as a read-only label. The module dropdown is removed.
- **"+ Add block" clicked:** Show only the Add content block form, adapted to the selected block type (see below).

Panel state is managed via `useState` in the client component. No API call is needed to switch states.

### Content block form — adaptive fields
The Add content block form must show only the fields relevant to the selected block type:
- Video: media picker + inline upload + caption
- Written content: rich text area only
- PDF: media picker + inline upload + caption
- Image: media picker + inline upload + caption
- Image gallery: multi-image picker + caption
- External link: URL field + label field

All other fields must be hidden. Showing all fields at once (current behaviour) is not acceptable.

### Duration — auto-detect, no manual input
The "Duration seconds" field must be removed from the Add lesson form. Mentors do not know their video duration in seconds and should not be asked for it. Duration must be detected automatically from the uploaded video file during media processing and stored on the `course_media` record. The lesson duration display (shown in the curriculum tree and student lesson list) should be derived from the attached video block's media record, not from a manually entered field.

If a lesson has no video block, duration is shown as blank or omitted — not as "Duration not set".

### Inline media upload from curriculum builder
When adding a video, PDF, or image content block, the media picker must include an "Upload new file" option directly in the right panel. The mentor must not be required to navigate to the Media Library, upload, and return. The inline upload must:
- Initiate TUS directly to Supabase Storage (same mechanism as the Media Library)
- Show upload progress inline
- On completion, automatically attach the uploaded media to the new content block
- Add the uploaded asset to the `course_media` table with the correct `trader_id` and lifecycle state

The Media Library remains the place for managing existing assets. Inline upload is additive — it does not replace the Media Library.

### Access mode — conditional display
When "Selected groups or students" is chosen, the groups picker and individual student picker must appear below the access mode options. When "All verified students" or "One-to-one coaching only" is chosen, these pickers must be hidden (they are irrelevant and their presence confuses mentors). The underlying save logic for `groupIds` and `studentIds` is already implemented.

### Filter tabs — course library
Filter tabs on the course library filter cards client-side by status. No additional API call is needed — all courses are already loaded.

### New course flow
The "+ New course" button and the add card at the end of the grid should open the new course form. The exact mechanism (modal, slide-over, or inline) is an Architect decision. The existing `createCourse` form action in `course-manager.tsx` must be preserved.

---

## Phase Boundary

This handoff covers Phase 1 UI only: redesigning the existing implemented screens to match the approved design spec.

Phase 2 UI enhancements (drag-and-drop lesson reordering, inline lesson editing, bulk status changes, learning path visualisation) are not part of this handoff and must not be included in scope.

---

## Edge Cases

- **No courses yet:** The course library must show an empty state (icon + heading + instruction). The add card must always be present.
- **Course with no modules:** The curriculum left panel must show an empty state and a clear "+ Add module" prompt.
- **Module with no lessons:** The module section must show an empty state row and a "+ Add lesson" prompt.
- **No content blocks on selected lesson:** The right panel must show an empty state and a clear "+ Add block" prompt.
- **Student with no enrolled courses:** My Learning must show an empty state — no Continue Watching or Completed sections, just an empty Library section with a helpful message.
- **Student with no in-progress courses:** The Continue Watching section must not render.
- **All courses completed:** Completed section shows all courses. Continue Watching does not render.
- **Lesson with no previous lesson:** Previous lesson button must not render.
- **Lesson with no next lesson:** Next lesson button must not render.

---

## Risks

- `course-detail-manager.tsx` is a large, dense single-component file. Splitting it into tab-specific subcomponents during this redesign would improve maintainability, but is an Architect decision — the Product Owner does not prescribe the component structure.
- The lesson player's `ProtectedLessonContent` component must not be touched. Any styling changes around it (page wrapper, navigation, header) must not affect the player's internal logic.
- The student CSS module (`courses.module.css`) is shared across the student My Learning page, course detail page, and lesson player page. The redesign may require splitting this into separate modules per page — Architect decision.

---

## Acceptance Criteria

Acceptance will be completed by the Product Owner using the KaiTrades academy. A test course with at least two modules, multiple lessons across both modules, mixed content blocks (video, text, PDF), and both group and individual access grants must be created before acceptance begins.

**Mentor — Course library:**
- Course list renders as a visual card grid
- Stats row shows accurate totals
- Filter tabs filter correctly by status
- Empty state renders when no courses exist
- New course flow is accessible from the "+ New course" button and the add card

**Mentor — Course detail:**
- All six tabs navigate without page reload
- Overview KPI cards show accurate live data
- Curriculum right panel is contextual — never shows multiple stacked forms simultaneously
- Clicking a lesson row shows that lesson's content blocks only
- Clicking "+ Add module" shows only the Add module form
- Clicking "+ Add lesson" under a module shows only the Add lesson form, with that module pre-filled as a read-only label
- Clicking "+ Add block" shows only the Add content block form, with fields adapted to the selected block type
- "Duration seconds" field does not appear anywhere in the lesson creation flow
- A mentor can upload a video directly from the curriculum builder without visiting the Media Library
- Upload progress is shown inline
- Access tab shows plain English mode labels with descriptions; selected mode is visually distinct
- Access mode saves immediately; removing a student retains their progress
- Students tab shows visual progress bars with completion badges

**Student — My Learning:**
- Continue Watching renders only when a course is in progress
- Completed section renders only when a course is fully done
- Resume button navigates to the correct in-progress lesson
- Progress bars reflect actual lesson completion ratios

**Student — Course detail:**
- Completed lessons show green checkmarks
- In-progress lesson is highlighted with resume affordance
- Upcoming lessons show lesson number in gray

**Student — Lesson player:**
- Video plays; academy/student watermark is visible during playback
- PDF opens view-only with no download control
- Completion indicator appears when the lesson is marked done
- Previous/Next navigation moves through lessons in curriculum order
- Progress persists on browser refresh (resume position is retained)

---

## Documentation Closeout Required

When Engineering marks this complete, the following documentation must be updated before the Product Owner accepts:

- `docs/COURSES.md` — update the Mentor Experience and Student Learning sections to reflect the redesigned UI
- `docs/PRODUCT_STATUS.md` — update Protected Courses Phase 1 status row to reflect UI acceptance state
- `docs/CHANGELOG.md` — add entry for Courses UI redesign
