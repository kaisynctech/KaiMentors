# EP-026 — TipTap Rich Text Editor

**Status:** Ready for Engineering  
**Architect:** KaiMentors Enterprise Architect  
**Date:** 2026-06-26  
**Scope:** 2 new files + 6 modified files  
**Migration required:** No  
**API changes:** No  
**Package install required:** Yes (3 packages)

---

## Objective

Replace the plain `<textarea>` used for rich_text content blocks with a proper WYSIWYG editor (TipTap). Mentors get bold, italic, underline, H2/H3, bullet lists, and numbered lists. The stored content format (`{ html: string }`) does not change — TipTap outputs HTML, exactly what the API already expects. The student renderer in `ProtectedLessonContent` is updated to render this HTML correctly instead of the current newline-split paragraph approach.

---

## Pre-investigation

Read these files before starting:

- `components/course-tabs/add-lesson-panel.tsx` — find the rich_text textarea block
- `components/course-tabs/edit-lesson-panel.tsx` — find the rich_text textarea block
- `components/protected-lesson-content.tsx` — find the rich_text renderer (line ~55)
- `components/protected-lesson-content.module.css` — confirm `.text` class exists
- `lib/courses.ts` — confirm `LessonBlockInput` interface

Confirm:
- `LessonBlockInput` has a `text?: string` field used for rich_text blocks
- The rich_text textarea in both panels uses `value={block.text ?? ""}` (controlled)
- The student renderer does `String(value.html ?? "").split("\n").map((line, index) => <p key={index}>{line}</p>)`
- `protected-lesson-content.module.css` has a `.text` class

---

## Step 1 — Package installation

Run in the project root:

```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-underline
```

Verify they appear in `package.json` under `dependencies`. Do not use `--save-dev`.

---

## Step 2 — Extend `LessonBlockInput` in `lib/courses.ts`

Add an optional `_clientKey` field used exclusively for React key management. This field is never sent to the API (Zod strips unknown fields on the backend).

**Before:**
```typescript
export interface LessonBlockInput {
  blockType: "rich_text" | "video" | "pdf" | "image" | "gallery" | "link";
  sortOrder: number;
  mediaId?: string | null;
  galleryMediaIds?: string[];
  text?: string;
  url?: string;
  label?: string;
  caption?: string;
  isRequired?: boolean;
}
```

**After:**
```typescript
export interface LessonBlockInput {
  blockType: "rich_text" | "video" | "pdf" | "image" | "gallery" | "link";
  sortOrder: number;
  mediaId?: string | null;
  galleryMediaIds?: string[];
  text?: string;
  url?: string;
  label?: string;
  caption?: string;
  isRequired?: boolean;
  _clientKey?: string; // React key only — never sent to the API
}
```

---

## Step 3 — New `RichTextEditor` component

### `components/rich-text-editor.tsx` *(new file)*

```typescript
"use client";

import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import styles from "./rich-text-editor.module.css";

interface RichTextEditorProps {
  defaultContent?: string;
  onChange: (html: string) => void;
}

export function RichTextEditor({ defaultContent = "", onChange }: RichTextEditorProps) {
  // Keep the latest onChange in a ref to avoid stale closure in TipTap's onUpdate
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: defaultContent,
    immediatelyRender: false, // prevents SSR hydration mismatch
    onUpdate: ({ editor }) => {
      onChangeRef.current(editor.getHTML());
    },
  });

  if (!editor) return null;

  return (
    <div className={styles.editor}>
      <div className={styles.toolbar} onMouseDown={(e) => e.preventDefault()}>
        <button
          type="button"
          className={`${styles.toolbarBtn} ${editor.isActive("bold") ? styles.active : ""}`}
          onClick={() => editor.chain().focus().toggleBold().run()}
          aria-label="Bold"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          className={`${styles.toolbarBtn} ${editor.isActive("italic") ? styles.active : ""}`}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          aria-label="Italic"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          className={`${styles.toolbarBtn} ${editor.isActive("underline") ? styles.active : ""}`}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          aria-label="Underline"
        >
          <u>U</u>
        </button>
        <span className={styles.sep} />
        <button
          type="button"
          className={`${styles.toolbarBtn} ${editor.isActive("heading", { level: 2 }) ? styles.active : ""}`}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          aria-label="Heading 2"
        >
          H2
        </button>
        <button
          type="button"
          className={`${styles.toolbarBtn} ${editor.isActive("heading", { level: 3 }) ? styles.active : ""}`}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          aria-label="Heading 3"
        >
          H3
        </button>
        <span className={styles.sep} />
        <button
          type="button"
          className={`${styles.toolbarBtn} ${editor.isActive("bulletList") ? styles.active : ""}`}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          aria-label="Bullet list"
        >
          ≡
        </button>
        <button
          type="button"
          className={`${styles.toolbarBtn} ${editor.isActive("orderedList") ? styles.active : ""}`}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          aria-label="Numbered list"
        >
          №
        </button>
      </div>
      <EditorContent editor={editor} className={styles.editorContent} />
    </div>
  );
}
```

**Important:** `onMouseDown={(e) => e.preventDefault()}` on the toolbar prevents the editor from losing focus when toolbar buttons are clicked.

---

## Step 4 — New `RichTextEditor` CSS module

### `components/rich-text-editor.module.css` *(new file)*

```css
.editor {
  border: 1px solid #dfe3e5;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 8px;
  border-bottom: 1px solid #e9edef;
  background: #f8f9fa;
}

.toolbarBtn {
  display: grid;
  place-items: center;
  min-width: 28px;
  height: 26px;
  padding: 0 6px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: #3b4248;
  font-size: 12px;
  cursor: pointer;
  user-select: none;
}

.toolbarBtn:hover {
  background: #e9edef;
}

.active {
  background: #e0e8fc !important;
  color: #1d6ef9;
}

.sep {
  display: block;
  width: 1px;
  height: 16px;
  margin: 0 4px;
  background: #dfe3e5;
  flex-shrink: 0;
}

/* ProseMirror editable area */
.editorContent :global(.ProseMirror) {
  min-height: 120px;
  padding: 12px 14px;
  outline: none;
  font-size: 13px;
  line-height: 1.75;
  color: #111315;
}

.editorContent :global(.ProseMirror p) {
  margin: 0 0 10px;
}

.editorContent :global(.ProseMirror p:last-child) {
  margin-bottom: 0;
}

.editorContent :global(.ProseMirror h2) {
  margin: 14px 0 6px;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.editorContent :global(.ProseMirror h3) {
  margin: 12px 0 4px;
  font-size: 14px;
  font-weight: 750;
  letter-spacing: -0.01em;
}

.editorContent :global(.ProseMirror ul),
.editorContent :global(.ProseMirror ol) {
  margin: 0 0 10px;
  padding-left: 22px;
}

.editorContent :global(.ProseMirror li) {
  margin-bottom: 4px;
}

.editorContent :global(.ProseMirror li p) {
  margin: 0;
}

/* Empty state — shown when editor has no content */
.editorContent :global(.ProseMirror.is-editor-empty::before) {
  content: "Write content…";
  position: absolute;
  pointer-events: none;
  color: #a0a8ae;
  font-style: italic;
}

.editorContent :global(.ProseMirror.is-editor-empty) {
  position: relative;
}
```

---

## Step 5 — Update `AddLessonPanel`

### `components/course-tabs/add-lesson-panel.tsx`

**A — Import `RichTextEditor`**

Add to imports:
```typescript
import { RichTextEditor } from "@/components/rich-text-editor";
```

**B — Update `appendBlock` to generate `_clientKey`**

**Before:**
```typescript
function appendBlock(blockType: LessonBlockInput["blockType"]) {
  setBlocks((prev) => [...prev, { blockType, sortOrder: prev.length }]);
}
```

**After:**
```typescript
function appendBlock(blockType: LessonBlockInput["blockType"]) {
  setBlocks((prev) => [
    ...prev,
    { blockType, sortOrder: prev.length, _clientKey: crypto.randomUUID() },
  ]);
}
```

**C — Change block map key from `index` to `_clientKey`**

Find:
```tsx
{blocks.map((block, index) => (
  <div className={styles.blockCard} key={index}>
```

Replace with:
```tsx
{blocks.map((block, index) => (
  <div className={styles.blockCard} key={block._clientKey ?? index}>
```

**D — Replace the rich_text textarea with `RichTextEditor`**

**Before:**
```tsx
{block.blockType === "rich_text" && (
  <label>
    Content
    <textarea
      onChange={(e) => updateBlock(index, { text: e.target.value })}
      placeholder="Enter written content…"
      value={block.text ?? ""}
    />
  </label>
)}
```

**After:**
```tsx
{block.blockType === "rich_text" && (
  <label>
    Content
    <RichTextEditor
      defaultContent={block.text ?? ""}
      onChange={(html) => updateBlock(index, { text: html })}
    />
  </label>
)}
```

---

## Step 6 — Update `EditLessonPanel`

### `components/course-tabs/edit-lesson-panel.tsx`

**A — Import `RichTextEditor`**

Add to imports:
```typescript
import { RichTextEditor } from "@/components/rich-text-editor";
```

**B — Populate `_clientKey` when loading initial blocks from the API**

In the `useEffect` that calls `fetch(...)`, after `setBlocks(data.blocks)`:

**Before:**
```typescript
setInitialData(data);
setBlocks(data.blocks);
```

**After:**
```typescript
setInitialData(data);
setBlocks(
  data.blocks.map((b: LessonBlockInput) => ({
    ...b,
    _clientKey: crypto.randomUUID(),
  })),
);
```

**C — Update `appendBlock` to generate `_clientKey`**

**Before:**
```typescript
function appendBlock(blockType: LessonBlockInput["blockType"]) {
  setBlocks((prev) => [...prev, { blockType, sortOrder: prev.length }]);
}
```

**After:**
```typescript
function appendBlock(blockType: LessonBlockInput["blockType"]) {
  setBlocks((prev) => [
    ...prev,
    { blockType, sortOrder: prev.length, _clientKey: crypto.randomUUID() },
  ]);
}
```

**D — Change block map key from `index` to `_clientKey`**

```tsx
{blocks.map((block, index) => (
  <div className={styles.blockCard} key={block._clientKey ?? index}>
```

**E — Replace the rich_text textarea with `RichTextEditor`**

Same replacement as in `AddLessonPanel` (Step 5D above — identical JSX).

---

## Step 7 — Update student renderer in `ProtectedLessonContent`

### `components/protected-lesson-content.tsx`

Find the rich_text block renderer:

**Before:**
```tsx
if (block.block_type === "rich_text") return <section className={styles.text} key={block.id}>{String(value.html ?? "").split("\n").map((line, index) => <p key={index}>{line}</p>)}</section>;
```

**After:**
```tsx
if (block.block_type === "rich_text") return (
  <section
    className={styles.text}
    key={block.id}
    // Content is authored by verified mentors — dangerouslySetInnerHTML is intentional.
    // eslint-disable-next-line react/no-danger
    dangerouslySetInnerHTML={{ __html: String(value.html ?? "") }}
  />
);
```

Note: no sanitization library is needed here because rich_text content is authored exclusively by authenticated, verified mentors — not end users. If untrusted user input is ever rendered via this path in the future, sanitization must be added at that point.

---

## Step 8 — Add prose styles to student CSS

### `components/protected-lesson-content.module.css`

Append at the end of the file (the file is currently minified on one line per rule — continue that format, or add readable multiline rules at the bottom — either is fine):

```css
.text h2 { margin: 16px 0 6px; font-size: 17px; font-weight: 800; letter-spacing: -0.02em; color: #111315; }
.text h3 { margin: 12px 0 4px; font-size: 14px; font-weight: 750; letter-spacing: -0.01em; color: #111315; }
.text ul, .text ol { margin: 0 0 12px; padding-left: 22px; }
.text li { margin-bottom: 4px; line-height: 1.75; }
.text li p { margin: 0; }
.text strong { font-weight: 800; }
.text em { font-style: italic; }
.text u { text-decoration: underline; }
.text p:last-child { margin-bottom: 0; }
```

---

## Verification

1. `pnpm typecheck` — must exit 0. Expected issues to watch for:
   - TipTap types might require `@types/...` — if missing, add `@tiptap/react` types are bundled; no separate `@types` package needed for TipTap v2
   - `crypto.randomUUID()` is available in modern browsers and Node 15+ — no polyfill needed for Next.js 15

2. `pnpm build` — must pass clean. If TipTap causes a build error related to `window` or `document` during SSR:
   - Confirm `immediatelyRender: false` is set in `useEditor`
   - If the error persists, wrap the `RichTextEditor` import with `dynamic(() => import("@/components/rich-text-editor"), { ssr: false })` in `add-lesson-panel.tsx` and `edit-lesson-panel.tsx`

3. Manual verification in KaiTrades workspace:
   - Add a new lesson → add a "Written text" block → toolbar appears with B/I/U/H2/H3/•/№ buttons
   - Type text, apply bold, add a heading, add a bullet list → save → student curriculum shows the lesson
   - Open the lesson as a student → rich_text block renders with correct formatting (heading is larger, list has bullets, bold is bold)
   - Edit the lesson → open the rich_text block → existing HTML content is pre-loaded in the editor correctly
   - Remove one rich_text block and add another → new block starts empty (no stale content from previous block)
   - Verify the "Mark lesson complete" button still renders below all blocks (regression)

4. Test suite — `pnpm test` — must pass with same count as before (TipTap has no test dependencies)

---

## What this does NOT change

- The content storage format: `{ html: string }` in `lesson_content_blocks.content` — unchanged
- The API endpoints — no changes to POST or PATCH lesson routes
- PDF, image, video, gallery, link block types — unchanged
- `formatDuration`, `LessonWithBlocksInput` — unchanged (except `LessonBlockInput` which gains `_clientKey`)
- No database migration
