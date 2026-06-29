# Architect Handoff — EP-020: Curriculum UX Redesign
**Status:** Ready for Engineering  
**Date:** 2026-06-25  
**Product Owner:** KaiMentors Product Owner  
**Depends on:** Protected Courses Phase 1 (migrations 025/026 deployed)

---

## Objective

The current Curriculum tab shows **both the Add Module form and the Add Lesson form simultaneously** as large cards in the right panel, making the page overwhelming and difficult to use. Additionally, creating a lesson is a two-step process (create lesson → then add content blocks one by one), which is disjointed.

This EP has two goals:

1. **Contextual panel** — the right panel shows exactly one form at a time, triggered by a specific user action. Nothing is shown by default.

2. **Comprehensive Add Lesson form** — when a mentor clicks "+ Add lesson", the right panel shows a single form where they can set the lesson title, description, status, and add all content (video, PDF, images, written text, links) before submitting. No second step required.

---

## UX State Machine

The right panel is controlled by a single `activePanel` state variable. There are five states:

| `activePanel` value | Right panel shows |
|---|---|
| `null` (default, no lesson selected) | Empty — soft hint text |
| `"add_module"` | Add Module form only |
| `"add_lesson"` | Add Lesson form (comprehensive — see below) |
| `"add_block"` | Add Block form (existing — only when editing existing lesson) |
| `null` (lesson selected in tree) | Lesson blocks view (existing behaviour) |

**Transitions:**
- Click "+ Add module" (header button or bottom row) → `activePanel = "add_module"`, `selectedLesson = null`
- Click "+ Add lesson" (inline under a module) → `activePanel = "add_lesson"`, `pendingModuleId = module.id`, `selectedLesson = null`
- Click any lesson row in the tree → `activePanel = null`, `selectedLesson = lesson.id`
- Click "+ Add block" inside lesson blocks view → `activePanel = "add_block"`
- Form submitted successfully → `activePanel = null`
- Press Escape or click Cancel (optional) → `activePanel = null`

---

## Scope of Changes

### 1. `components/course-tabs/curriculum-tab.tsx` — State management

Replace `addingLesson: boolean` with two new state variables:

```typescript
const [activePanel, setActivePanel] = useState<"add_module" | "add_lesson" | "add_block" | null>(null);
const [pendingModuleId, setPendingModuleId] = useState<string | null>(null);
```

Remove `addingLesson` everywhere. Update `selectedLesson` setter so that clicking a lesson also clears `activePanel`:

```typescript
function selectLesson(id: string | null) {
  setSelectedLesson(id);
  setActivePanel(null);
}
```

---

### 2. Left panel — trigger wiring

**"+ Add module" header button:**
```typescript
// BEFORE
onClick={() => setAddingLesson(false)}

// AFTER
onClick={() => {
  setActivePanel("add_module");
  setSelectedLesson(null);
}}
```

**Bottom "+ Add module" row** — same handler as above.

**Inline "+ Add lesson" row under each module:**
```typescript
// BEFORE
onClick={() => {
  setAddingLesson(true);
  setSelectedLesson(null);
}}

// AFTER
onClick={() => {
  setActivePanel("add_lesson");
  setPendingModuleId(module.id);
  setSelectedLesson(null);
}}
```

**Lesson row click:**
```typescript
// BEFORE
onClick={() => setSelectedLesson(lesson.id)}

// AFTER
onClick={() => selectLesson(lesson.id)}
```

---

### 3. Right panel — render logic

Replace the current `selectedLessonData && !addingLesson` ternary with a clean switch on `activePanel` and `selectedLesson`:

```tsx
{/* Right panel */}
<div className={styles.formStack}>

  {/* Default empty state */}
  {activePanel === null && !selectedLesson && (
    <div className={styles.panelEmpty}>
      <p>Select a lesson to edit, or use <strong>+ Add module</strong> to begin.</p>
    </div>
  )}

  {/* Add Module form — shown exclusively */}
  {activePanel === "add_module" && (
    <form onSubmit={handleCreateModule} className={styles.panel}>
      {/* existing Add Module form fields — no change */}
    </form>
  )}

  {/* Add Lesson form — comprehensive, shown exclusively */}
  {activePanel === "add_lesson" && (
    <AddLessonPanel
      modules={modules}
      defaultModuleId={pendingModuleId}
      readyMedia={readyMedia}
      busy={busy}
      onSubmit={handleCreateLessonWithBlocks}
    />
  )}

  {/* Lesson blocks view (existing behaviour) */}
  {activePanel !== "add_module" && activePanel !== "add_lesson" && selectedLesson && selectedLessonData && (
    <>
      <div className={styles.blocksPanel}>
        {/* existing blocks panel — no change */}
        <button onClick={() => setActivePanel("add_block")}>+ Add block</button>
      </div>
      {activePanel === "add_block" && (
        <form onSubmit={handleAddBlock} className={styles.panel}>
          {/* existing Add Block form — no change */}
        </form>
      )}
    </>
  )}

</div>
```

---

### 4. New component: `AddLessonPanel`

Extract the comprehensive Add Lesson form into its own component at `components/course-tabs/add-lesson-panel.tsx`.

**Props:**
```typescript
interface AddLessonPanelProps {
  modules: Module[];
  defaultModuleId: string | null;
  readyMedia: Media[];
  busy: boolean;
  onSubmit: (lesson: LessonWithBlocksInput) => Promise<void>;
}
```

**Form sections:**

**Section 1 — Lesson info:**
- Module selector (`<select name="moduleId">`) — pre-selected to `defaultModuleId`
- Title (`<input name="title" required>`)
- Description (`<textarea name="description">`)
- Status (`<select name="status">` — Draft / Published)
- Order (`<input name="sortOrder" type="number" defaultValue={0}>`)
- Duration in minutes (`<input name="durationMinutes" type="number">`) — converted to seconds on submit
- Required checkbox (`<input name="isRequired" type="checkbox" defaultChecked>`)

**Section 2 — Content (inline block builder):**

Mentor can add zero or more content blocks before submitting. Each block is built client-side as a list in local component state — nothing is sent to the API until the main "Create lesson" button is clicked.

Content block types with their fields:

| Type | Fields |
|---|---|
| Written text | `<textarea>` for content body |
| Video | Upload area (file input, accept mp4/webm) + optional Media Library picker (`<select>` from `readyMedia` filtered to `media_type="video"`) |
| PDF | Upload area (file input, accept pdf) + optional Media Library picker |
| Image | Upload area (file input, accept png/jpeg/webp) + optional Media Library picker |
| Image gallery | Multi-select from Media Library images |
| Link | URL input + Label input |

**Block management UI:**
- A row of chips: `+ Written text`, `+ Video`, `+ PDF`, `+ Image`, `+ Gallery`, `+ Link`
- Each chip appends a new block card to the list
- Each block card has a "Remove" button
- Blocks are reorderable in Phase 2 (defer drag-and-drop — keep sort_order as append-only for now, assigned 0, 1, 2, … in order)

**Submit handler:**

Blocks that reference an uploaded file must be uploaded to Media Library first (using the existing TUS upload flow), then the block is sent with the resulting `media_id`. For simplicity in Phase 1:
- Blocks using Media Library picker send `media_id` directly
- Blocks using file upload: Engineering may choose to either (a) upload the file first via the existing media upload flow and then reference the media_id, or (b) defer file upload to after lesson creation. **Recommended approach: use Media Library picker for Phase 1; file-upload-at-lesson-creation can be Phase 2.**
- Written text and Link blocks have no media_id requirement.

---

### 5. `app/api/courses/[courseId]/lessons/route.ts` — extend to accept initial blocks

Extend the POST endpoint (or create a new variant) to accept an optional `blocks` array alongside the lesson fields.

**Request body:**
```typescript
interface CreateLessonRequest {
  moduleId: string;
  title: string;
  description?: string;
  status: "draft" | "published";
  sortOrder: number;
  durationSeconds?: number;
  isRequired: boolean;
  blocks?: Array<{
    blockType: "rich_text" | "video" | "pdf" | "image" | "gallery" | "link";
    sortOrder: number;
    mediaId?: string | null;
    galleryMediaIds?: string[];
    text?: string;
    url?: string;
    label?: string;
    caption?: string;
    isRequired?: boolean;
  }>;
}
```

**Server logic:**
1. Validate tenant ownership of the course (existing check)
2. Insert `lessons` row (existing logic)
3. If `blocks` array is non-empty, insert each block into `lesson_content_blocks` with the new lesson's ID. For gallery blocks, insert each media ID into `lesson_content_block_media`. All inserts in the same transaction (or sequential inserts with rollback on error).
4. Return the new lesson ID and the created block IDs.

**Tenant isolation rule:** All `mediaId` values in `blocks` must belong to the same `trader_id` as the course. Validate before inserting. Reject the entire request (400) if any media_id references a different tenant.

---

### 6. Form submission reset

The current code passes server actions as `action={createModule}` / `action={createLesson}`. To reset `activePanel` after success, convert the form `onSubmit` to a client-side handler that calls the prop and then resets state:

```typescript
async function handleCreateModule(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  await createModule(fd);
  setActivePanel(null);
  e.currentTarget.reset();
}

async function handleCreateLessonWithBlocks(lesson: LessonWithBlocksInput) {
  // call extended lessons API
  await createLessonWithBlocks(lesson);
  setActivePanel(null);
  setPendingModuleId(null);
}

async function handleAddBlock(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  await addBlock(fd);
  setActivePanel(null);
  e.currentTarget.reset();
}
```

---

### 7. CSS — `course-detail-manager.module.css`

Add a `panelEmpty` class for the default empty state:
```css
.panelEmpty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  color: var(--color-text-tertiary);
  font-size: 13px;
  text-align: center;
}
```

No other CSS changes are required. The existing `panel` and `formStack` classes are reused as-is.

---

## What Is NOT Changing

- The existing lesson blocks view (click a lesson in the tree → see its blocks) — no change.
- The Add Block form fields — no change.
- The `patchCurriculum` status-change selects on module/lesson rows — no change.
- Module collapse/expand behaviour — no change.
- All API endpoints except the lesson POST (which is extended, not replaced).
- RLS, tenant isolation, `can_access_course` — no change.
- Student-side learning views — no change.

---

## Acceptance Criteria

1. Opening the Curriculum tab shows the left panel with modules and lessons, and the right panel is empty (no forms visible).
2. Clicking "+ Add module" (header or bottom) shows ONLY the Add Module form in the right panel. No other form is visible.
3. Submitting the Add Module form creates the module and returns the right panel to the empty state.
4. The new module appears in the left tree with an inline "+ Add lesson" row beneath it.
5. Clicking "+ Add lesson" under a module shows ONLY the comprehensive Add Lesson form in the right panel, with that module pre-selected in the Module dropdown.
6. The Add Lesson form includes: title, description, status, order, duration, required toggle, and a content section with "+ Written text", "+ Video", "+ PDF", "+ Image", "+ Gallery", "+ Link" chips.
7. Adding a content chip appends a block card to the form. Clicking "Remove" on a block card removes it.
8. Submitting the Add Lesson form creates the lesson and all added blocks in one operation. The right panel returns to empty. The new lesson appears in the tree under its module.
9. Clicking a lesson in the tree shows the lesson blocks view (unchanged). The Add Module and Add Lesson forms are not visible.
10. Clicking "+ Add block" inside the lesson blocks view shows ONLY the Add Block form (unchanged from current).
11. At no point are two forms visible simultaneously in the right panel.
12. `npm run typecheck` and `npm run build` pass with no new errors.
13. Existing acceptance runner passes without modification (no DB schema changes).

---

## Final Delivery Summary from Engineering

Engineering must confirm:

- `activePanel` / `pendingModuleId` state added to `CurriculumTab`; `addingLesson` removed
- Left panel triggers wired correctly (add module, add lesson, lesson row click)
- `AddLessonPanel` component created with info section + inline content block builder
- Right panel render logic: one form at a time, clean empty state
- Lesson POST API extended to accept and insert initial `blocks` array with tenant validation
- Form submission handlers reset `activePanel` on success
- `panelEmpty` CSS class added
- Acceptance criteria 1–13 verified in KaiTrades browser session
- Commit hash and files changed
