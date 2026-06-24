# Courses UI Design Spec

Last updated: 2026-06-23
Status: **Approved by founder — updated with Curriculum UX refinements**

This document captures the approved visual and interaction design for the Courses product area — both the mentor dashboard and the student learning experience. It is the source of truth for UI implementation and acceptance.

---

## Design Principles

- Clean, flat, minimal. No gradients, heavy shadows, or decorative noise.
- Mentor experience feels like a professional product, not a database tool.
- Student experience feels like a focused learning environment that belongs to the academy brand.
- Numbers, statuses, and actions use plain English — never raw system values like `all_verified` or `one_to_one`.
- Progress is always visualised as a bar, never just a number.

---

## Mentor Side

### 1. Course Library (`/dashboard/courses`)

**Layout:** Full-width page inside the dashboard shell.

**Page header:**
- Eyebrow: "Learning library"
- Heading: "Courses"
- Right-aligned primary action button: "+ New course"

**Stats row (below header):**
Four equal stat cards in a horizontal row:
- Total courses
- Published
- Total lessons
- Active learners

**Filter row (below stats):**
Pill-style toggle buttons: All | Published | Draft | Archived
Default selection: All

**Course grid (below filters):**
Responsive card grid (`auto-fill, minmax ~168px`). Each card contains:
- Thumbnail area (96px tall): shows cover image if set, otherwise a contextual icon on a coloured background
- Status badge (top of card body): Published = green, Draft = gray, Archived = amber
- Course title (13px, weight 500)
- Lesson count and module count (12px, muted)
- Progress bar (3px) showing lesson publication fill — green for published, blue for in-progress
- Active learner count or "Not published yet" label

**Add card:** A dashed-border card at the end of the grid with a "+" icon and "New course" label. Same grid cell size as course cards.

**Empty state:** Large icon, "No courses yet", clear instruction to create the first course.

---

### 2. Course Detail — Overview tab (`/dashboard/courses/[courseId]`)

**Course header (below back link):**
- Back link: "← All courses"
- Course title (17px, weight 500)
- Status badge (Published / Draft / Archived)
- "Settings" ghost button (right-aligned)

**Tab bar:** Overview | Curriculum | Resources | Access | Students | Settings

**Overview content:**
- KPI grid (4 equal cards): Modules, Lessons, Active learners, Completion rate
- "Recent learner activity" panel: each row shows student avatar (initials), name, action ("completed lesson 8 of 9", "started lesson 5"), and time ago

---

### 3. Course Detail — Curriculum tab

**Layout:** Two equal columns.

**Left panel — Modules and lessons:**
- Panel header: "Modules and lessons" + small "+ Add module" ghost button (right)
- Modules listed in order, each as a collapsible section:
  - Module header: chevron, module title, status badge (Published / Draft)
  - Lessons listed below: icon (green check if published, hollow circle if draft), lesson title, duration (clock icon + formatted time)
  - The selected lesson is highlighted (light blue background)
  - "+ Add lesson" row at the bottom of each module
- "+ Add module" full-width ghost button below all modules

**Right panel — contextual, changes based on what was last clicked:**

The right panel is never static. It responds to the mentor's last action. It never shows multiple stacked forms at once.

**State 1 — No action taken yet (default):**
Empty state with a prompt: "Select a lesson to view its content, or use the buttons above to add a module."

**State 2 — Lesson selected (click any lesson row):**
- Panel header: module name (small eyebrow) + lesson title + "+ Add block" ghost button (right)
- Content blocks listed in order, each as a row:
  - Block type icon (play for video, file-text for written, file for PDF, photo for image, link for external link)
  - Block title and secondary descriptor (e.g. "Video · 3 min 24 sec · Protected")
  - Drag handle icon (right, muted)
- Empty state if no blocks yet: "No content yet. Add a video, text, PDF, or image."

**State 3 — "+ Add module" clicked (top-right of left panel, or bottom of module list):**
Right panel shows only the Add module form:
- Title (required)
- Description (optional)
- Status: Draft | Published (default: Draft)
- Required toggle (default: on)
- "Create module" primary button
- No sort order input — modules are ordered by creation and can be reordered later

**State 4 — "+ Add lesson" clicked (under a specific module):**
Right panel shows only the Add lesson form. The module is pre-selected and shown as a read-only label — the mentor does not pick it from a dropdown.
- Module: shown as a read-only label (e.g. "Adding to: Module 1 — Introduction to trading")
- Title (required)
- Description (optional)
- Status: Draft | Published (default: Draft)
- Required toggle (default: on)
- No sort order input — lessons are ordered by creation within the module
- No "Duration seconds" field — duration is detected automatically from the uploaded video
- "Create lesson" primary button

**State 5 — "+ Add block" clicked (inside a selected lesson):**
Right panel shows only the Add content block form. The form adapts based on the selected block type — only the relevant fields are shown.
- Block type selector (prominent, shown first):
  - Video → shows media picker (from Media Library) + inline upload option
  - Written content → shows rich text area only
  - PDF → shows media picker + inline upload option
  - Image → shows media picker + inline upload option
  - Image gallery → shows multi-image picker
  - External link → shows URL field + Label field
- Caption field (shown for video, PDF, image, gallery — hidden for written content and link)
- Required toggle
- "Add block" primary button

**Inline upload:**
For video, PDF, and image block types, the media picker includes an "Upload new file" option directly in the panel. The mentor does not have to leave the curriculum builder to go to the Media Library to upload a file first. The upload initiates TUS directly. Once processing completes, the block is created with that media attached. The Media Library continues to exist for managing previously uploaded assets.

---

### 4. Course Detail — Resources tab

Consistent with current implementation. Visual treatment matches the panel style above.

---

### 5. Course Detail — Access tab

**Layout:** Single column, full panel width.

**Eyebrow:** "Who can access this course?"

**Access mode selector (three options, radio style):**

1. **All verified students**
   Description: "Anyone who joins your academy and is verified gets access automatically. No manual selection needed."

2. **Selected groups or students**
   Description: "Choose specific student groups or individual students. Good for premium tiers or invite-only content."

3. **One-to-one coaching only**
   Description: "Exactly one student. For private sessions or personalised coaching programmes."

Selected option has a blue border and light blue background. Custom radio dot (filled circle inside ring when selected).

**Info notice (below options):**
Icon + text: "Changing access takes effect immediately. Students who lose access keep their progress history."

**Primary action:** "Save access settings" button, right-aligned.

When "Selected groups or students" is chosen, a groups picker and individual student picker appear below the options.

---

### 6. Course Detail — Students tab

**Stats row (top):** Total learners | Completed | In progress | Avg progress

**Learner progress panel:**
- Panel header: "Learner progress" + "Export" ghost button
- Each student row: avatar (initials circle), name, timestamp ("Last active X ago"), progress bar + completion label or percentage with lesson count
- Completed students show a green "Completed" badge
- In-progress students show blue progress bar and "X% · Y/Z lessons"
- Not-started students show a gray empty bar

---

### 7. Course Detail — Settings tab

Consistent with current implementation. Fields: title, description, status, sort order. "Save settings" primary button.

---

## Student Side

### 1. My Learning (`/student/courses` or `/academy/courses`)

**Nav bar:**
- Left: Academy name (prominent) with academy type label
- Right: My learning (active) | Messages | Account | Sign out

**Page hero:**
- Eyebrow: "Welcome back"
- Heading: "My learning"
- Subheading: "Resume your lessons, track your progress, and revisit completed courses."

**Section 1 — Continue Watching** (only shown if a course is in progress):
- Eyebrow: "Continue watching"
- Section heading: "Pick up where you left off"
- Full-width resume card:
  - Left side (180px): course thumbnail or coloured icon area
  - Right side: eyebrow (course name), lesson title (16px, weight 500), module name, progress bar, "X% complete · Y of Z required lessons done", primary "▶ Resume lesson" button

**Section 2 — Library:**
- Eyebrow: "Library"
- Section heading: "All courses"
- Responsive card grid: thumbnail, title, lesson count, progress bar, completion percentage or "Not started"

**Section 3 — Completed** (only shown if at least one course is completed):
- Eyebrow: "Completed"
- Section heading: "Finished courses"
- Card grid: same as Library but with green "Completed" badge and 100% progress bar

---

### 2. Course Detail (`/student/courses/[courseId]`)

**Back link:** "← My learning"

**Course hero section:**
- Cover thumbnail (140×100px, rounded) or icon area on coloured background (left)
- Eyebrow: "Course name" (right)
- Heading: "Course curriculum"
- Description text
- Progress bar (4px)
- "X% complete · Y of Z required lessons done"

**Curriculum — modules listed in order:**
Each module is a bordered card with:
- Module header: module title, lesson count (muted, right)
- Lessons listed below:
  - Completed lessons: green filled checkmark circle
  - Current in-progress lesson: numbered circle with blue border + "Resume" label (right, with play icon)
  - Upcoming lessons: numbered circle (gray border)
  - Each lesson shows: title (bold), description (12px muted), duration (right, clock icon)

---

### 3. Lesson Player (`/student/courses/[courseId]/lessons/[lessonId]`)

**Back link:** "← Course curriculum"

**Lesson header:**
- Eyebrow: "Course name · Module name"
- Lesson title (20px, weight 500)
- Lesson description (13px, muted)

**Video player card:**
- Dark (near-black) player area, 16:9 aspect ratio
- Centred play button (translucent white circle)
- Watermark bottom-right: "Academy name · Student name · Student email" (low-opacity, monospace) — deters casual screen recording sharing
- Progress bar strip below player (track + fill + timestamp right)

**Content blocks (below player):**
Rendered in order. Each block type:
- **Video:** Handled by player above
- **Written content:** Inline text block with file-text icon
- **PDF:** Row with file icon, title, "Protected · X MB", eye icon (view only — no download button)
- **Image:** Rendered inline
- **External link:** Row with link icon, label, external-link icon

**Completion indicator:**
When the lesson is marked complete, a green "You've completed this lesson" notice appears below the blocks.

**Lesson navigation (bottom):**
- Left: "← Previous lesson" ghost button (hidden on first lesson)
- Right: "Next lesson →" primary button (hidden on last lesson)

---

## What This Design Does Not Change

- Data model, API routes, access control logic, media session issuance — unchanged.
- The tab structure on the course detail page (Overview, Curriculum, Resources, Access, Students, Settings) — unchanged.
- Publishing lifecycle and draft/published/archived states — unchanged.
- Tenant isolation and security rules — unchanged.
- The media library (`/dashboard/media`) — addressed separately.

---

## Acceptance Criteria

**Mentor — Course library:**
- [ ] Course list renders as a card grid, not a table
- [ ] Stats row shows accurate counts
- [ ] Filter tabs correctly filter by status
- [ ] Add card opens new course flow
- [ ] Empty state renders correctly

**Mentor — Course detail:**
- [ ] All six tabs navigate correctly
- [ ] Overview KPI cards show accurate data
- [ ] Curriculum shows module/lesson tree with status indicators
- [ ] Selecting a lesson in the left panel updates the right panel with its content blocks
- [ ] Access tab uses plain English labels with descriptions
- [ ] Access change saves and takes effect immediately
- [ ] Students tab shows progress bars and completion badges

**Student — My learning:**
- [ ] Continue Watching section only appears when a course is in progress
- [ ] Completed section only appears when at least one course is done
- [ ] Resume button goes to the correct lesson
- [ ] Progress bars reflect actual lesson completion

**Student — Course detail:**
- [ ] Completed lessons show green checkmarks
- [ ] In-progress lesson is highlighted with Resume indicator
- [ ] Progress bar reflects actual completion

**Student — Lesson player:**
- [ ] Video plays with academy/student watermark visible
- [ ] PDF opens in view-only mode, no download button
- [ ] Completion indicator appears when lesson is marked done
- [ ] Previous/Next navigation moves through lessons in curriculum order
- [ ] Progress is saved on pause, end, and completion events
