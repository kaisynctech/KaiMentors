# Architect Specification — Courses UI Redesign

**Date:** 2026-06-23
**Status:** Approved — ready for Engineering
**Approved design:** `docs/COURSES_DESIGN_SPEC.md`
**Related handoff:** Product Owner Architect Handoff 2026-06-23

---

## 1. Analysis

The current Courses product area has complete, production-deployed business logic, API routes, access control, media sessions, and database schema. The entire concern of this specification is the visual and interaction layer only.

Six surfaces require redesign:

| Surface | File | CSS module |
|---|---|---|
| Mentor course library | `components/course-manager.tsx` | `components/course-manager.module.css` |
| Mentor course detail (all 6 tabs) | `components/course-detail-manager.tsx` | `components/course-detail-manager.module.css` |
| Student My Learning | `app/student/courses/page.tsx` | `app/student/courses/courses.module.css` |
| Student course detail | `app/student/courses/[courseId]/page.tsx` | shared (see below) |
| Student lesson player | `app/student/courses/[courseId]/lessons/[lessonId]/page.tsx` | shared (see below) |

Three server pages require data augmentation to supply the redesigned UI with the fields it needs. All augmentation is computed server-side; no new API routes are required.

---

## 2. Root Cause

There is no defect. This is a planned UI uplift. The current implementation is a developer-scaffolded interface: an always-visible create form alongside an HTML table, raw snake_case access mode names, numeric sort order inputs, and a flat student progress table. The approved design replaces these with a card library, a curriculum tree, plain English access selectors, and visual progress bars. The business logic underneath does not change.

---

## 3. Risks

### R1 — `courses.module.css` is shared across three distinct student pages

`app/student/courses/[courseId]/page.tsx` imports `../courses.module.css`.
`app/student/courses/[courseId]/lessons/[lessonId]/page.tsx` imports `../../../courses.module.css`.
Both resolve to the same file. Redesigning one page's styles will conflict with the other if the module remains shared. This is the primary CSS regression risk.

**Resolution:** Split into three independent CSS modules. Import paths must be updated in both consuming files.

### R2 — `course-detail-manager.tsx` is a dense 42-line monolith

All six tabs and all action handlers live in a single client component. Rewriting the visual layer without restructuring the file risks introducing subtle logic regressions in action handlers (particularly `saveAccess`, which pre-fills non-access fields from parent state, and `saveCurriculum`, which has a 409-confirmation branch).

**Resolution:** Extract tab subcomponents. Action handlers remain in the parent shell or in a shared hook. The shape of every API call body must be preserved exactly.

### R3 — New course modal must preserve the existing `createCourse` action

The current layout uses an always-visible create form on the left. The new layout uses a modal or sheet overlay triggered by the `+ New course` button and the add card. The `createCourse` async function and its `fetch("/api/courses", ...)` call must be preserved. The modal must mount the same form, not a different one.

### R4 — Access tab saves non-access fields alongside access fields

`saveAccess` currently serializes `title`, `description`, `status`, `sortOrder` from parent state into the FormData before sending. The redesigned Access tab renders no course settings fields — only the access mode and pickers. This pre-fill behaviour must be retained or the PATCH to `/api/courses/[courseId]` will overwrite course fields with empty/default values.

### R5 — Lesson player import path after CSS split

The lesson player at `app/student/courses/[courseId]/lessons/[lessonId]/page.tsx` imports styles via `../../../courses.module.css`. After the CSS split this import path must be updated to target the new lesson-specific module. Missing this update will cause a build failure or missing styles.

### R6 — `ProtectedLessonContent` must not be modified

The lesson player page wraps `<ProtectedLessonContent>` with page-level layout and navigation. Only the surrounding wrapper (lesson header, back link, navigation) changes. The `blocks`, `completed`, `lessonId`, `resumeSeconds`, and `watermark` props must remain identical.

### R7 — Student course detail needs `is_started` in progress query

The current student course detail page queries `lesson_progress` as `select("lesson_id,is_completed,position_seconds")` — missing `is_started`. The redesign requires identifying the in-progress lesson (started, not completed) for the "Resume" affordance. This requires adding `is_started` to the select.

### R8 — Academy routing context must be preserved in all student pages

All student page links use `academy.basePath` and `academy.querySuffix` from `getStudentAcademyContext`. Every redesigned student page must preserve these variables in all `href` values. Any hardcoded `/student/courses/...` path is a tenant routing regression.

---

## 4. Recommended Architecture

### 4.1 Component structure

#### `course-manager.tsx`

Remove the two-column always-visible create form layout. Replace with:

- A full-width course library page with header, stats row, filter tabs, and card grid
- A new-course modal (controlled by `useState<boolean>`) containing the existing create form
- The modal opens from both the `+ New course` header button and the add card at the end of the grid
- The `createCourse(formData)` action handler is moved into the modal; its implementation is unchanged
- A `CourseLibraryCard` subcomponent renders each course card
- Filter state is `useState<"all" | "published" | "draft" | "archived">("all")`; courses are filtered client-side from the `courses` prop

The `CourseListItem` interface requires new fields (see §4.3). The server page passes them.

#### `course-detail-manager.tsx`

Split into a parent shell plus tab subcomponents. Recommended structure:

```
components/
  course-detail-manager.tsx        — shell: tab state, shared actions, error/success state
  course-detail-manager.module.css — rewritten
  course-tabs/
    overview-tab.tsx
    curriculum-tab.tsx
    resources-tab.tsx
    access-tab.tsx
    students-tab.tsx
    settings-tab.tsx
```

Each tab subcomponent receives exactly the props it needs as a narrowed subset of the parent shell's props, plus any action callbacks it requires.

The parent shell retains:
- All `useState` declarations (`tab`, `busy`, `message`, `error`, `selectedLesson`)
- All action handlers (`call`, `createModule`, `createLesson`, `addBlock`, `addResource`, `saveCurriculum`, `saveCourse`, `saveAccess`)
- Error and success banners
- The tab bar navigation

**Access tab specifics:** Access tab requires `useState` for the locally selected access mode, initialized from `course.access_mode`. This controls conditional rendering of the groups/students pickers. The `saveAccess` pre-fill of non-access fields (title, description, status, sortOrder) from `course` prop must be preserved exactly.

**Curriculum tab specifics:** The new design shows a collapsible module/lesson tree on the left, selected lesson content blocks on the right. The tree must show items in their current `sort_order`. Status changes (module/lesson) are made via individual calls through the existing `call()` helper targeting the curriculum PATCH endpoint with a single-record payload. The numeric order inputs are removed from the visible UI for Phase 1. `selectedLesson` state is owned by the parent shell and passed to the curriculum tab as a prop with a setter.

**Overview tab specifics:** Requires an `activityFeed` prop (see §4.3). KPI cards replace the current raw access_mode display.

**Students tab specifics:** Progress percentage per student is computed inside the component from `modules.flatMap(m => m.lessons).filter(l => l.is_required && l.status === 'published').length` as the denominator against the `completed` count already in the `progress` prop. No new data required.

#### Student CSS module split

| New file | Used by |
|---|---|
| `app/student/courses/courses.module.css` | My Learning page (keep existing path) |
| `app/student/courses/[courseId]/course-detail.module.css` | Student course detail page |
| `app/student/courses/[courseId]/lessons/[lessonId]/lesson.module.css` | Lesson player page |

The lesson player page import changes from `../../../courses.module.css` to `./lesson.module.css`. The course detail page import changes from `../courses.module.css` to `./course-detail.module.css`.

#### Student course detail — lesson state

Three visual states per lesson, determined from progress data:
- **Completed:** `progress.some(p => p.lesson_id === lesson.id && p.is_completed)`
- **In progress (resume):** `progress.some(p => p.lesson_id === lesson.id && p.is_started && !p.is_completed)`
- **Upcoming:** neither of the above

The "in progress" state requires `is_started` in the progress query (see §4.3).

Only the first in-progress lesson per module receives the "Resume" affordance. If multiple lessons are in-progress, the most recently active one (sorted by `last_activity_at`) should receive the resume treatment.

#### Student lesson player

Page wrapper changes: lesson header section, back link, and previous/next navigation receive the design treatment. `<ProtectedLessonContent>` is rendered exactly as today with the same props. The completion indicator ("You've completed this lesson") is surfaced at the page wrapper level based on `progress?.is_completed`. This is already available from the page query.

### 4.2 New course modal behaviour

- Triggered by: header `+ New course` button, add card click
- Closes on: successful course creation (redirect to course detail), Escape key, backdrop click
- Focus trap must be implemented inside the modal (accessibility)
- Modal must render above all page content (`z-index` consistent with design system)
- The existing `createCourse` form action is preserved; on success `router.push(...)` closes the modal implicitly via navigation

### 4.3 Data augmentation (server pages only — no new API routes)

#### `app/dashboard/courses/page.tsx`

Update the courses query and shape to provide:

```ts
interface CourseListItem {
  id: string;
  title: string;
  description: string | null;
  status: "draft" | "published" | "archived";
  sort_order: number;
  thumbnailUrl: string | null;
  lessonCount: number;           // existing — total lessons
  publishedLessonCount: number;  // NEW — lessons where status='published'
  moduleCount: number;           // NEW — count of modules for this course
  activeLearnerCount: number;    // NEW — distinct students with any lesson_progress row
}

interface CourseStats {
  totalCourses: number;
  published: number;
  totalLessons: number;
  activeLearners: number;        // distinct student_user_ids across all courses
}
```

The `moduleCount` and `publishedLessonCount` can be obtained by extending the existing Supabase select to include module count and filtered lesson count. The `activeLearnerCount` per course and global `activeLearners` stat require a join against `lesson_progress` for this trader_id.

`CourseManager` receives a new `stats: CourseStats` prop alongside the existing `courses` array.

**Query approach:** Add parallel queries for module counts and active learner counts by trader_id. Compute per-course counts in the mapping loop. Compute global stats from the aggregated results. Do not add a separate API route — this is server-component data fetching.

#### `app/dashboard/courses/[courseId]/page.tsx`

Compute and pass an `activityFeed` prop:

```ts
interface ActivityFeedItem {
  studentName: string;
  lessonTitle: string;
  lessonNumber: number;          // lesson's sort_order within the course
  totalLessons: number;          // total published required lessons in course
  action: "completed" | "started";
  lastActivityAt: string;        // ISO timestamp
}
```

Derivation: from `progressRows` (already loaded), join against `lessonRows` (already loaded) to get lesson titles and sort orders. Sort by `last_activity_at` descending. Take the first 10. Pass as `activityFeed: ActivityFeedItem[]` to `CourseDetailManager`.

No new database query required — data is already fetched; only the mapping/shaping changes.

#### `app/student/courses/[courseId]/page.tsx`

Add `is_started` to the lesson_progress select:

```ts
supabase
  .from("lesson_progress")
  .select("lesson_id,is_completed,is_started,position_seconds")  // add is_started
  .eq("course_id", courseId)
  .eq("student_user_id", user.id)
```

No other query changes required.

---

## 5. Implementation Plan

Engineering should implement in this order to allow incremental verification:

1. **CSS module split** (student pages) — lowest risk, no logic changes. Split `courses.module.css` into three files, update import paths, verify build passes.
2. **Student page visual redesigns** — redesign My Learning, course detail, and lesson player against the spec. Verify each in isolation before moving on.
3. **Data augmentation — dashboard courses page** — add module counts, published lesson counts, and active learner counts to the server page. Update `CourseListItem` and `CourseStats` types.
4. **`CourseManager` redesign** — card grid, filter tabs, stats row, new course modal, empty state, add card.
5. **Data augmentation — course detail page** — add activity feed computation.
6. **`CourseDetailManager` split and redesign** — create tab subcomponents, rewrite CSS module, implement each tab design.
7. **Regression and acceptance run** — all tabs, all access modes, all student states, both desktop and mobile, KaiTrades academy.

---

## 6. Engineering Prompt (Copy-Paste Ready)

---

### Task Title

Courses UI Redesign — Phase 1

### Business Objective

Replace the developer-scaffolded Courses UI with a polished, professional interface matching the approved design in `docs/COURSES_DESIGN_SPEC.md`. The mentor sees a visual card library, a tree-based curriculum builder, plain English access controls, and visual progress reporting. The student sees a focused learning environment with clear progress state, resume affordances, and a clean lesson player wrapper. No business logic, API routes, database schema, RLS policies, access control functions, or media session architecture changes.

### Current Problem

The current interface uses an HTML table for the course library, numeric sort-order inputs for curriculum ordering, raw snake_case values for access modes, and plain progress counts for student reporting. The overall visual treatment does not match the standard of a production SaaS product.

### Root Cause Investigation Requirements

Before writing any code, Engineering must:

1. Read `docs/COURSES_DESIGN_SPEC.md` in full — this is the implementation source of truth.
2. Read `docs/COURSES.md` — understand the full data model and access contract.
3. Read `docs/PRODUCT_STATUS.md` — confirm current Protected Courses Phase 1 status.
4. Read `docs/ARCHITECT_SPEC_COURSES_UI_REDESIGN.md` — this document. Follow it exactly.
5. Read every affected file before writing: `components/course-manager.tsx`, `components/course-detail-manager.tsx`, `app/student/courses/page.tsx`, `app/student/courses/[courseId]/page.tsx`, `app/student/courses/[courseId]/lessons/[lessonId]/page.tsx`, all three CSS modules, `app/dashboard/courses/page.tsx`, `app/dashboard/courses/[courseId]/page.tsx`.
6. Confirm `components/protected-lesson-content.tsx` is NOT in scope. Do not open it with intent to edit.

### Existing Architecture to Respect

- All API routes are unchanged: `/api/courses`, `/api/courses/[courseId]`, `/api/courses/[courseId]/modules`, `/api/courses/[courseId]/lessons`, `/api/courses/[courseId]/curriculum`, `/api/lessons/[lessonId]/blocks`, `/api/courses/[courseId]/resources`.
- All action handler logic in `course-detail-manager.tsx` is preserved: `call()`, `createModule`, `createLesson`, `addBlock`, `addResource`, `saveCurriculum` (including the 409-confirmation branch), `saveCourse`, `saveAccess` (including the non-access field pre-fill from course state). Do not change the body shape of any fetch call.
- `createCourse(formData)` in `course-manager.tsx` is preserved exactly — only its presentation context changes (moved into a modal).
- `ProtectedLessonContent` is not touched.
- `getStudentAcademyContext`, `academy.basePath`, `academy.querySuffix` usage in all student pages is preserved in every `href`.
- `lib/academy-routes.ts` is not touched unless a route helper is directly applicable to navigation being added. Do not hardcode `/student/courses/...` paths.
- The six-tab structure (Overview, Curriculum, Resources, Access, Students, Settings) on the course detail page is preserved.
- `docs/COURSES.md` states that the watermark must display `"Academy name · Student full name · Student email"`. The `watermark` prop passed to `ProtectedLessonContent` must not change.

### Implementation Requirements

#### A. CSS Module Split (student pages)

Split `app/student/courses/courses.module.css` into three independent modules:

- `app/student/courses/courses.module.css` — My Learning page only (keep existing path).
- `app/student/courses/[courseId]/course-detail.module.css` — Student course detail page.
- `app/student/courses/[courseId]/lessons/[lessonId]/lesson.module.css` — Lesson player page.

Update import statements in:
- `app/student/courses/[courseId]/page.tsx` — change from `../courses.module.css` to `./course-detail.module.css`.
- `app/student/courses/[courseId]/lessons/[lessonId]/page.tsx` — change from `../../../courses.module.css` to `./lesson.module.css`.

Verify `npm run build` passes after this change before proceeding.

#### B. Server data augmentation — `app/dashboard/courses/page.tsx`

Do not create new API routes. Augment the server component's data fetching.

Add to `CourseListItem`:

```ts
interface CourseListItem {
  id: string;
  title: string;
  description: string | null;
  status: "draft" | "published" | "archived";
  sort_order: number;
  thumbnailUrl: string | null;
  lessonCount: number;
  publishedLessonCount: number;
  moduleCount: number;
  activeLearnerCount: number;
}
```

Add `CourseStats`:

```ts
interface CourseStats {
  totalCourses: number;
  published: number;
  totalLessons: number;
  activeLearners: number;
}
```

Query approach:
- Extend the courses query to include module count: add `course_modules(count)` to the select, filtered by `trader_id` match.
- Extend the lessons select to include `status` so you can count published lessons per course.
- Add a parallel query: `supabase.from("lesson_progress").select("course_id,student_user_id").eq("trader_id", membership.trader_id)` to compute per-course active learner counts and the global active learner stat.
- Compute global stats from the aggregated course list.
- Pass `stats={stats}` as a new prop to `<CourseManager>`.

The `trader_id` must always be sourced from `membership.trader_id`. Never pass a trader_id from query params or form data.

#### C. Server data augmentation — `app/dashboard/courses/[courseId]/page.tsx`

After the existing parallel query resolves, compute `activityFeed`:

```ts
interface ActivityFeedItem {
  studentName: string;
  lessonTitle: string;
  lessonNumber: number;
  totalLessons: number;
  action: "completed" | "started";
  lastActivityAt: string;
}
```

- Source data: `progressRows` (already loaded with `student_user_id`, `is_started`, `is_completed`, `last_activity_at`) and `lessonRows` (already loaded with `id`, `title`, `sort_order`).
- Join on `lesson_id`. For each progress row: if `is_completed`, action = "completed"; else if `is_started`, action = "started"; else skip.
- `lessonNumber` = the lesson's `sort_order`.
- `totalLessons` = `lessonRows.filter(l => l.is_required && l.status === 'published').length`.
- `studentName` = join against `studentList` on `student_user_id`.
- Sort by `last_activity_at` descending, take first 10.
- Pass `activityFeed={activityFeed}` as a new prop to `<CourseDetailManager>`.

No new database query is required. All required data is already loaded.

#### D. Server data augmentation — `app/student/courses/[courseId]/page.tsx`

Add `is_started` to the lesson_progress select:

```ts
supabase
  .from("lesson_progress")
  .select("lesson_id,is_completed,is_started,position_seconds")
  .eq("course_id", courseId)
  .eq("student_user_id", user.id)
```

No other query changes.

#### E. `CourseManager` redesign

Implement against `docs/COURSES_DESIGN_SPEC.md` §"Course Library".

- Add `stats: CourseStats` to props interface.
- Add `filterStatus: "all" | "published" | "draft" | "archived"` state, default `"all"`.
- Add `showNewCourse: boolean` state for modal visibility.
- The `createCourse(formData)` handler is unchanged; place it inside the component as today. The modal mounts the same form; on redirect the modal closes via navigation.
- `filteredCourses` is derived: `filterStatus === "all" ? courses : courses.filter(c => c.status === filterStatus)`.
- Course cards render from `filteredCourses`. Add card is always rendered at the end of the grid regardless of filter.
- Empty state renders when `courses.length === 0` (no courses at all, not filtered empty — if a filter produces zero results, show "No [status] courses" inline text but keep the add card).
- Modal: accessible, focus-trapped, closeable via Escape and backdrop click. Use a `<dialog>` element or a div with appropriate ARIA roles (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`).
- Status badge colours: Published = green, Draft = gray, Archived = amber. Match the token values already established in `course-detail-manager.module.css` (`.published`, `.draft`, `.archived`).
- Progress bar on card: fill = `publishedLessonCount / lessonCount * 100`%; green fill for published ratio. Show `lessonCount` lessons and `moduleCount` modules in the card meta line.
- Active learner display: show `activeLearnerCount` if > 0; show "Not published yet" if course status is not published.
- Rewrite `course-manager.module.css` completely. Keep file at the same path.

#### F. `CourseDetailManager` split and redesign

Split the component into:

- `components/course-detail-manager.tsx` — parent shell
- `components/course-tabs/overview-tab.tsx`
- `components/course-tabs/curriculum-tab.tsx`
- `components/course-tabs/resources-tab.tsx`
- `components/course-tabs/access-tab.tsx`
- `components/course-tabs/students-tab.tsx`
- `components/course-tabs/settings-tab.tsx`

The parent shell:
- Retains all `useState` declarations.
- Retains all action handler functions. The function signatures and API call bodies do not change.
- Passes narrowed prop subsets and action callbacks to each tab subcomponent.
- Renders error/success banners above the active tab.
- Renders the tab bar (Overview | Curriculum | Resources | Access | Students | Settings).
- Adds a `activityFeed: ActivityFeedItem[]` prop to the `Props` interface.

**Overview tab** (`overview-tab.tsx`):
- Props: `modules`, `lessons` (derived in parent), `progress`, `activityFeed`.
- Four KPI cards: Modules count, Lessons count, Active learners (progress.length), Completion rate (percentage of students with completed === totalRequiredLessons).
- Recent learner activity panel: render `activityFeed` rows. Each row: avatar initials circle, student name, action string (e.g. "Completed lesson 3 of 9", "Started lesson 5"), time ago (derive from `lastActivityAt` using `Date.now()` diff — format as "X min ago", "X hours ago", "X days ago"). Empty state if `activityFeed.length === 0`.
- "Time ago" helper: implement a small `timeAgo(iso: string): string` utility in `lib/courses.ts` or inline. Do not import a date library.

**Curriculum tab** (`curriculum-tab.tsx`):
- Props: `course`, `modules`, `lessons` (derived flat list), `readyMedia`, `selectedLesson`, `setSelectedLesson`, `busy`, `createModule`, `createLesson`, `addBlock`, `saveCurriculum`.
- Two-column layout: left panel (module/lesson tree), right panel (selected lesson content blocks and add-block form).
- Left panel:
  - Each module is a collapsible section (controlled collapse state local to this component: `useState<Record<string, boolean>>({})`, default all expanded).
  - Module header: chevron icon (rotates on collapse), module title, status badge (Published/Draft as colored pill), edit control for module status (a `<select>` or inline status picker that fires `saveCurriculum` with only this module's update — `{modules: [{id, sort_order, status: newStatus}], lessons: [], acknowledgeImpact: false}`).
  - When a module has lessons: list each lesson row below. Selected lesson row has light blue background (CSS class).
  - Lesson row: published icon (filled green check) or draft icon (hollow circle), lesson title, duration formatted via `formatDuration(duration_seconds)`.
  - Clicking a lesson row calls `setSelectedLesson(lesson.id)`.
  - `+ Add lesson` ghost row at the bottom of each module's lesson list (opens a small inline form or the right panel switches to the "add lesson" form — Architect decision: use the right panel for add-lesson form when no lesson is selected or when add is triggered, to avoid visual clutter).
  - `+ Add module` ghost button below all modules.
  - Empty state when no modules exist.
- Right panel:
  - When a lesson is selected: show lesson title eyebrow (module name), lesson title, `+ Add block` ghost button. List content blocks in sort order with type icon, title, secondary descriptor. Empty state if no blocks.
  - Drag handle icon is rendered (muted) but is non-functional in Phase 1. Add a comment: `{/* Drag-and-drop: Phase 2 */}`.
  - Add-block form (existing form logic, redesigned visuals).
  - When no lesson is selected (e.g. on initial render if no lessons exist): show instruction panel.
- The batch `saveCurriculum` call is now used only for module/lesson status changes from the inline status pickers. The 409-confirmation branch must be preserved.
- Numeric order inputs are not visible in the tree UI for Phase 1. Sort order is not user-editable in the tree. The values are preserved in state and will be sent unchanged in any batch call.

**Access tab** (`access-tab.tsx`):
- Props: `course`, `groups`, `students`, `selectedGroupIds`, `selectedStudentIds`, `busy`, `saveAccess`.
- Local `useState` for `selectedMode: "all_verified" | "restricted" | "one_to_one"`, initialized from `course.access_mode`.
- Three radio-style option cards with plain English labels and descriptions as per `docs/COURSES_DESIGN_SPEC.md` §"Access tab".
- Selected option: blue border, light blue background.
- When `selectedMode === "restricted"`: render groups picker and individual student picker below the options.
- When `selectedMode !== "restricted"`: do not render pickers (not just hidden — conditionally absent from the DOM).
- Info notice below options: "Changing access takes effect immediately. Students who lose access keep their progress history."
- `saveAccess` pre-fill requirement: the function must still include `title`, `description`, `status`, `sortOrder` from `course` prop in the FormData before sending. Preserve this exactly.
- "Save access settings" button, right-aligned, disabled while `busy`.

**Students tab** (`students-tab.tsx`):
- Props: `progress`, `modules`, `lessons` (derived flat list from parent).
- Compute `totalRequired = lessons.filter(l => l.is_required && l.status === 'published').length` inside the component.
- Stats row: Total learners, Completed, In progress, Avg progress — all derived from `progress` array.
- Learner progress panel: each student row with avatar initials, name, last active time ago, progress bar, badge.
  - Completed: green "Completed" badge. Progress bar 100% green fill.
  - In progress: blue progress bar, "X% · Y/Z lessons".
  - Not started (started===0 && completed===0): gray empty bar.
- "Export" ghost button in panel header — no functionality in Phase 1. Render the button but it performs no action. Add `aria-disabled="true"` and a comment: `{/* Export: future */}`.

**Resources tab** (`resources-tab.tsx`):
- Props: `course`, `resources`, `lessons` (derived), `readyMedia`, `busy`, `addResource`.
- Visual treatment consistent with the panel style in the design spec.
- Resource list on left, add resource form on right.
- Preserve existing add resource form fields and `addResource` call exactly.

**Settings tab** (`settings-tab.tsx`):
- Props: `course`, `busy`, `saveCourse`.
- Fields: title, description, status, sort order. "Save settings" primary button.
- Preserve existing `saveCourse` FormData construction exactly (including `accessMode`, `groupIds`, `studentIds` passthrough from parent state).

**Rewrite `course-detail-manager.module.css` completely.** Keep file at same path.

#### G. Student My Learning page redesign (`app/student/courses/page.tsx`)

Implement against `docs/COURSES_DESIGN_SPEC.md` §"My Learning".

- Nav bar: academy name prominent left, nav links right (My learning active, Messages, Account, Sign out). The current "Access status" link becomes "Account". The href remains `${base}${suffix}`.
- Page hero: eyebrow "Welcome back", heading "My learning", subheading text from spec.
- Continue Watching section: only rendered when `continueCourse` is truthy. Full-width resume card with course thumbnail (left 180px), course name eyebrow, lesson title, module name, progress bar, completion text, "▶ Resume lesson" primary button linking to `${base}/courses/${continueCourse.id}/lessons/${continueCourse.resume!.lesson_id}${suffix}`.
- Library section: always rendered. Card grid. Each card: thumbnail, title, lesson count, progress bar, completion percentage or "Not started".
- Completed section: only rendered when `completed.length > 0`. Green "Completed" badge on cards.
- Empty Library state: when `courses.length === 0`, render empty state icon + message.
- The resume card requires `lessonTitle` of the in-progress lesson. The current data does not include lesson title for the resume lesson. Add a join: include `lesson:lessons(title)` in the `lesson_progress` select for continue watching resolution. Or compute in the courses map: the `resume` field currently contains `{ lesson_id, ... }` — add a lookup of lesson title from `courseRows` (the lessons array already fetched).
  - Preferred approach: the existing `courses` query includes `lessons(id,is_required,status)`. Extend it to include `title` as well: `lessons(id,is_required,status,title)`. Then in the courses map, derive `resumeLesson: { lesson_id, title }` for the continue watching card.
- Rewrite `courses.module.css` for My Learning only.

#### H. Student course detail page redesign (`app/student/courses/[courseId]/page.tsx`)

Implement against `docs/COURSES_DESIGN_SPEC.md` §"Course Detail (student)".

- Back link: "← My learning" linking to `${base}/courses${suffix}`.
- Course hero: thumbnail left, course name eyebrow, "Course curriculum" heading, description, progress bar, completion text.
- Curriculum — modules as bordered cards, lessons with three visual states:
  - Completed: green filled checkmark circle.
  - In progress (resume): numbered circle with blue border + "Resume" label right with play icon.
  - Upcoming: numbered circle gray border.
- Determine lesson state from progress using the `is_started` field now included in the query (per §D).
- In-progress determination: `progress.some(p => p.lesson_id === lesson.id && p.is_started && !p.is_completed)`. If multiple lessons are in progress within a module, show the most recently active one as the resume lesson (sort by `last_activity_at` if available — the progress query does not currently include `last_activity_at`; add it: `select("lesson_id,is_completed,is_started,position_seconds,last_activity_at")`).
- Each lesson links to `${base}/courses/${course.id}/lessons/${lesson.id}${suffix}`.
- Write `app/student/courses/[courseId]/course-detail.module.css`.

#### I. Student lesson player page redesign (`app/student/courses/[courseId]/lessons/[lessonId]/page.tsx`)

Implement against `docs/COURSES_DESIGN_SPEC.md` §"Lesson Player".

- Back link: "← Course curriculum" linking to `${base}/courses/${courseId}${suffix}`.
- Lesson header: eyebrow `${course?.title} · ${lessonModule?.title}`, lesson title (20px weight 500), lesson description (13px muted).
- `<ProtectedLessonContent>` is rendered with exactly the same props as today:
  ```tsx
  <ProtectedLessonContent
    blocks={blocks}
    completed={progress?.is_completed ?? false}
    lessonId={lesson.id}
    resumeSeconds={progress?.position_seconds ?? 0}
    watermark={`${portal?.portal_name ?? "Academy"} · ${app.full_name} · ${app.email}`}
  />
  ```
  Do not add, remove, or rename any prop. Do not wrap `ProtectedLessonContent` in a div that constrains its sizing unless it is a direct replacement for an existing wrapper.
- Completion indicator: "You've completed this lesson" notice rendered below `ProtectedLessonContent` when `progress?.is_completed === true`. This is page-wrapper level, not inside the player component.
- Lesson navigation at the bottom:
  - `prev` exists: render `← Previous lesson` ghost button linking to `${base}/courses/${courseId}/lessons/${prev.id}${suffix}`.
  - `prev` absent: do not render the button (not disabled, absent).
  - `next` exists: render `Next lesson →` primary button.
  - `next` absent: do not render.
- Write `app/student/courses/[courseId]/lessons/[lessonId]/lesson.module.css`.

### Database and Migration Requirements

No database schema changes. No new migrations. No RLS policy changes.

The only data changes are in server component queries (adding fields to selects that were previously omitted). These are read operations under the existing authenticated user context and existing RLS policies.

### RLS and Security Requirements

- All server page data access uses the authenticated Supabase client (`createClient()`). The `trader_id` and `student_user_id` context is always derived from the authenticated session — never from query params, URL segments, or form data.
- The `trader_id` for mentor pages is always sourced from `membership.trader_id` (resolved from `trader_members` by the authenticated user's `user.id`).
- The `trader_id` for student pages is always sourced from `app.trader_id` (resolved from `student_applications` for the verified student).
- No new storage reads, no new signed URLs, no changes to `course-content` bucket access patterns.
- The lesson player page does not change how it sources the `watermark` string. Do not change the data used for watermark composition.

### Multi-Tenant Requirements

- No cross-tenant data must become accessible through the redesign.
- Every course card in the library renders only courses owned by `membership.trader_id` — this is already enforced by the query `.eq("trader_id", membership.trader_id)`. Do not weaken this filter.
- Every student course/lesson link includes the academy routing context (`basePath`, `querySuffix`). Do not hardcode `/student/` paths.
- KaiTrades acceptance testing must not touch Traders Confidence or Milkers FX data.

### Authentication and Authorization Requirements

- No authentication changes.
- The student course detail and lesson pages already gate on verified `student_applications` status. This must not change.
- The course detail manager already gates on `trader_members` membership. This must not change.

### API and Integration Requirements

All existing API endpoints are unchanged:
- `/api/courses` POST — create course
- `/api/courses/[courseId]` PATCH — update course settings and access
- `/api/courses/[courseId]/modules` POST — create module
- `/api/courses/[courseId]/lessons` POST — create lesson
- `/api/courses/[courseId]/curriculum` PATCH — batch update curriculum order/status
- `/api/lessons/[lessonId]/blocks` POST — add content block
- `/api/courses/[courseId]/resources` POST — add resource

The UI calls each endpoint with the same request body structure as today. The only change is how results are displayed.

### UI/UX and Accessibility Requirements

- All interactive elements (buttons, links, inputs, selects, modal) must be keyboard accessible.
- The new course modal must implement a focus trap: focus must cycle within the modal while it is open; Escape closes it; focus returns to the trigger element on close.
- The modal must have `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` pointing to the modal heading.
- Filter tab buttons must have `aria-pressed` indicating the active state.
- Progress bars must have `role="progressbar"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`, and `aria-label` describing what is being measured.
- Status badges are purely decorative — no `role` needed, but ensure sufficient color contrast (AA).
- Avatar initials circles must have `aria-hidden="true"` and be accompanied by the visible student name text.
- The "Export" button in the Students tab must have `aria-disabled="true"` and not respond to click events.
- The completion indicator in the lesson player must be announced to screen readers: add `role="status"` or `aria-live="polite"`.
- Touch targets for mobile: all interactive elements must be at least 44×44px on mobile viewports.
- Responsive breakpoints must match the design spec: the course card grid collapses from `auto-fill minmax(168px)` to single column on small viewports. The curriculum two-column layout stacks to single column on tablet. The student course detail hero stacks on mobile.
- Do not use inline `style` attributes for colors, font sizes, or layout except where CSS variables are appropriate. All new design tokens go into the CSS modules.

### Storage and Audit Requirements

No storage changes. No new audit events. The existing audit coverage for course creation, access changes, and curriculum updates remains unchanged.

### Documentation Requirements

When Engineering marks implementation complete, the following documentation updates are required before the Product Owner acceptance run:

1. **`docs/COURSES.md`** — Update the "Mentor Experience" section to describe the card library, filter tabs, stats row, modal new-course flow, and the split curriculum tree/right-panel design. Update the "Student Learning" section to describe the redesigned My Learning hero, Continue Watching full-width resume card, course detail lesson states (completed/in-progress/upcoming), and lesson player page wrapper with completion indicator and bottom navigation.

2. **`docs/PRODUCT_STATUS.md`** — When browser acceptance passes, update the Protected Courses Phase 1 row to reflect the UI redesign status. Do not change the status to Complete until all acceptance criteria in `docs/COURSES_DESIGN_SPEC.md` have passed.

3. **`docs/CHANGELOG.md`** — Add an entry for the Courses UI Redesign with the implementation commit hash and a summary of what changed.

4. **`docs/ARCHITECTURE_DECISIONS.md`** — Add an entry recording: (a) the decision to split `course-detail-manager.tsx` into tab subcomponents, (b) the decision to split the student `courses.module.css` into three per-page modules, (c) the decision to use a modal for the new course flow.

### Testing and Regression Requirements

Engineering must run and report results for all of the following:

**Automated:**
- `npm test` — must pass with no new failures.
- `npm run typecheck` — must pass with zero errors. All new props, interfaces, and type augmentations must be typed. No `any` escapes.
- `npm run build` — must produce a clean production build. No unused imports, no missing CSS module classes.

**Route testing:**
- `/dashboard/courses` — loads, card grid renders, stats row shows data, filter tabs change visible cards, `+ New course` button opens modal, Escape closes modal, add card opens modal, empty state renders when no courses.
- `/dashboard/courses/[courseId]` — all six tabs navigate without reload; Overview shows KPI cards and activity feed; Curriculum shows tree and right panel; Access shows plain English mode options and conditional pickers; Students shows progress bars; Settings shows the save form.
- `/student/courses` — Continue Watching section present/absent correctly; Completed section present/absent correctly; Resume button goes to correct lesson.
- `/student/courses/[courseId]` — lesson states render correctly (completed/in-progress/upcoming).
- `/student/courses/[courseId]/lessons/[lessonId]` — lesson header renders; ProtectedLessonContent renders; completion indicator appears for a completed lesson; previous/next navigation correct; no previous button on first lesson; no next button on last lesson.

**Authentication testing:**
- Unauthenticated access to all dashboard and student routes redirects to login — unchanged behavior must be confirmed.
- Mentor cannot access student routes; student cannot access dashboard routes — unchanged.

**RLS validation:**
- Mentor can only see their own courses in the card library.
- Student can only see published courses for their verified academy.
- Cross-tenant course IDs return 404 on the student course detail and lesson player.

**Permission validation:**
- `super_admin` can access dashboard routes (no regression).
- `trader` (mentor) can access dashboard/courses routes.
- `student` cannot access dashboard/courses routes.

**Multi-tenant isolation:**
- Confirm KaiTrades course cards do not appear in Traders Confidence or Milkers FX mentor dashboards and vice versa.
- Confirm KaiTrades student progress does not appear in Traders Confidence or Milkers FX student views.

**Desktop and mobile:**
- Test every redesigned page at desktop (1280px+), tablet (~768px), and mobile (~375px) widths.
- Confirm card grid reflows correctly.
- Confirm curriculum two-column stacks on mobile.
- Confirm student lesson states are readable on mobile.
- Confirm modal is usable on mobile (accessible, scrollable if content is tall, backdrop covers full screen).
- Inspect browser console: zero JavaScript errors, zero React warnings.
- Inspect Network tab: no unexpected additional API calls; no credential or signed URL leakage in responses.

**Regression — Protected Courses acceptance run:**
- After UI implementation, re-run the KaiTrades acceptance runner (`npm run accept:courses:production`) from the existing `scripts/accept-protected-courses-production.mjs` to confirm no regression was introduced in access control, media sessions, or progress recording. The group-entitlement failure pre-dates this work and is a separate open blocker — do not attempt to fix it here; report its status honestly.

### Acceptance Criteria

**Mentor — Course library:**
- [ ] Courses render as a visual card grid (not a table)
- [ ] Each card shows thumbnail or icon placeholder, status badge, title, module + lesson count, publication progress bar, active learner count or "Not published yet"
- [ ] Stats row shows Total courses, Published, Total lessons, Active learners — all accurate
- [ ] Filter tabs (All / Published / Draft / Archived) filter the grid client-side; active tab is visually distinct
- [ ] `+ New course` button and add card both open the new course modal
- [ ] Modal can be closed with Escape and backdrop click; focus returns to trigger
- [ ] Creating a course from the modal redirects to the new course's detail page
- [ ] Empty state renders correctly when mentor has no courses

**Mentor — Course detail:**
- [ ] All six tabs navigate without page reload
- [ ] Overview shows four KPI cards (Modules, Lessons, Active learners, Completion rate) with accurate data
- [ ] Overview shows recent learner activity feed (or empty state if none)
- [ ] Curriculum shows module/lesson tree; clicking a lesson selects it and updates the right panel
- [ ] Selected lesson row is visually distinct (light blue background)
- [ ] Module status badge reflects actual module status
- [ ] Lesson published/draft icon reflects actual lesson status
- [ ] Access tab shows three plain English option cards with descriptions
- [ ] Selected access mode has blue border and light blue background
- [ ] When "Selected groups or students" is chosen, the pickers appear; when another mode is chosen, pickers are absent
- [ ] Saving access mode change succeeds and the change takes effect without page reload beyond existing `router.refresh()` behavior
- [ ] Students tab shows stats row and per-student progress bars with completion badges
- [ ] Settings tab saves course title, description, status, sort order correctly

**Student — My Learning:**
- [ ] Continue Watching section appears only when a course has a non-completed resume lesson
- [ ] Continue Watching full-width resume card shows course thumbnail, lesson title, module, progress bar, resume button
- [ ] Resume button navigates to the correct in-progress lesson
- [ ] Completed section appears only when at least one course is fully completed
- [ ] Library grid shows all published courses
- [ ] Progress bars reflect actual lesson completion percentages
- [ ] Empty Library state renders when student has no published courses

**Student — Course detail:**
- [ ] Completed lessons show green filled checkmark circle
- [ ] In-progress lesson shows numbered circle with blue border and "Resume" label
- [ ] Upcoming lessons show gray numbered circle
- [ ] Course progress bar reflects actual completion percentage

**Student — Lesson player:**
- [ ] Lesson header shows course + module eyebrow, lesson title, description
- [ ] `ProtectedLessonContent` renders and video plays (confirmed with KaiTrades fixture)
- [ ] Academy/student watermark is visible during video playback
- [ ] PDF opens view-only (no download button)
- [ ] Completion indicator ("You've completed this lesson") appears after lesson completion
- [ ] Previous/Next navigation links work; previous absent on first lesson; next absent on last lesson
- [ ] Progress survives browser refresh (resume position retained)

**Accessibility:**
- [ ] New course modal is focus-trapped and keyboard-closeable
- [ ] Progress bars have appropriate ARIA attributes
- [ ] All interactive elements are reachable by Tab key
- [ ] Touch targets are ≥44×44px on mobile

### Final Delivery Summary Required from Engineering

Engineering must report:

1. Commit hash of the deployed implementation.
2. Confirmation that `npm test`, `npm run typecheck`, and `npm run build` all pass.
3. Confirmation that `npm run accept:courses:production` was run and report its outcome (pass, or which scenario failed — the pre-existing group-entitlement failure is expected; any new failure is a regression).
4. For each redesigned surface: desktop and mobile screenshot evidence (or screen recording) confirming the approved design is implemented.
5. Browser console status for each surface (zero errors / any warnings with explanation).
6. Confirmation that no `ProtectedLessonContent` props changed.
7. Confirmation that all `saveAccess`, `saveCurriculum`, `createCourse`, and `saveCourse` action handler logic is preserved with identical API call bodies.
8. Confirmation that all `academy.basePath` / `academy.querySuffix` routing is preserved in all student pages.
9. Status of the CSS module split: confirm three separate files exist and import paths are updated.
10. Documentation update confirmation: `docs/COURSES.md`, `docs/PRODUCT_STATUS.md`, `docs/CHANGELOG.md`, `docs/ARCHITECTURE_DECISIONS.md` all updated.
11. Any blockers, deviations from this specification, or acceptance criteria that could not be verified — reported honestly. Do not mark any criterion as passed without direct evidence.
