# EP-039 — Course Thumbnail Upload

**Status:** Ready for Engineering  
**Architect:** KaiMentors Enterprise Architect  
**Date:** 2026-06-29  
**Scope:** Settings tab UI + server page query + one small API addition  
**Migration required:** No  
**API changes:** Yes — one new field on existing PATCH handler  
**Package install required:** No

---

## Objective

Let mentors upload and remove a course cover image from the Settings tab. The PATCH API already handles thumbnail uploads — this EP wires up the UI and adds removal support.

---

## Change 1 — API: add `removeThumbnail` support

**File:** `app/api/courses/[courseId]/route.ts`

Insert this block immediately before the existing `const thumbnail = formData.get("thumbnail")` line (line 114):

```typescript
const removeThumbnail = formData.get("removeThumbnail") === "true";
if (removeThumbnail && coverPath) {
  await supabase.storage.from("course-content").remove([coverPath]);
  coverPath = null;
}
```

No other API changes — the existing thumbnail upload, upsert, and old-file cleanup logic is untouched.

---

## Change 2 — Server page: fetch `cover_path` and generate signed URL

**File:** `app/dashboard/courses/[courseId]/page.tsx`

**2a.** Add `cover_path` to the courses query:

```typescript
// Before
.select("id,title,description,status,sort_order,access_mode")

// After
.select("id,title,description,status,sort_order,access_mode,cover_path")
```

**2b.** Import `createAdminClient`:

```typescript
import { createAdminClient } from "@/lib/supabase/admin";
```

**2c.** After `if (!course) notFound();`, generate the signed URL:

```typescript
let thumbnailUrl: string | null = null;
const admin = createAdminClient();
if (course.cover_path && admin) {
  const { data: signed } = await admin.storage
    .from("course-content")
    .createSignedUrl(course.cover_path, 3600);
  thumbnailUrl = signed?.signedUrl ?? null;
}
```

**2d.** Pass `thumbnailUrl` to `CourseDetailManager`:

```tsx
<CourseDetailManager
  course={{ ...course, thumbnailUrl }}
  {/* ...all other props unchanged */}
/>
```

---

## Change 3 — `CourseDetailManager`: thread `thumbnailUrl` through to `SettingsTab`

**File:** `components/course-detail-manager.tsx`

**3a.** Add `thumbnailUrl` to the `Course` interface (around line 21):

```typescript
interface Course {
  id: string;
  title: string;
  description: string | null;
  status: Status;
  sort_order: number;
  access_mode: AccessMode;
  thumbnailUrl: string | null;   // ← add
}
```

**3b.** Pass it to `SettingsTab` in the render:

```tsx
{tab === "Settings" && (
  <SettingsTab
    course={course}
    busy={busy}
    saveCourse={saveCourse}
    thumbnailUrl={course.thumbnailUrl}   // ← add
  />
)}
```

---

## Change 4 — `SettingsTab`: thumbnail upload section

**File:** `components/course-tabs/settings-tab.tsx`

**Full replacement** — the file needs `"use client"` for the `removeThumb` state, and `thumbnailUrl` as a new prop:

```tsx
"use client";

import { useState } from "react";
import { ImagePlus, X } from "lucide-react";
import Image from "next/image";
import styles from "../course-detail-manager.module.css";

type Status = "draft" | "published" | "archived";
type AccessMode = "all_verified" | "restricted" | "one_to_one";

interface Props {
  course: {
    id: string;
    title: string;
    description: string | null;
    status: Status;
    sort_order: number;
    access_mode: AccessMode;
  };
  thumbnailUrl: string | null;
  busy: boolean;
  saveCourse: (fd: FormData) => Promise<void>;
}

export function SettingsTab({ course, thumbnailUrl, busy, saveCourse }: Props) {
  const [removeThumb, setRemoveThumb] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setRemoveThumb(false);
      setPreview(URL.createObjectURL(file));
    }
  }

  const displayUrl = removeThumb ? null : (preview ?? thumbnailUrl);

  return (
    <div className={styles.panel}>
      <header>
        <div>
          <p className="eyebrow">Course lifecycle</p>
          <h2>Settings</h2>
          <p>Publishing, archiving, and reordering active curriculum requires confirmation.</p>
        </div>
      </header>

      <form action={saveCourse} className={styles.settingsForm}>
        <label>
          Title
          <input defaultValue={course.title} name="title" required />
        </label>
        <label>
          Description
          <textarea defaultValue={course.description ?? ""} name="description" />
        </label>

        {/* ── Thumbnail ─────────────────────────────── */}
        <div className={styles.thumbnailField}>
          <span className={styles.fieldLabel}>Cover image</span>
          {displayUrl ? (
            <div className={styles.thumbnailPreview}>
              <Image
                alt="Course cover"
                fill
                sizes="160px"
                src={displayUrl}
                style={{ objectFit: "cover" }}
                unoptimized
              />
              <button
                aria-label="Remove thumbnail"
                className={styles.thumbnailRemoveBtn}
                onClick={() => { setRemoveThumb(true); setPreview(null); }}
                type="button"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <label className={styles.thumbnailUploadArea} htmlFor="thumbnail-input">
              <ImagePlus size={20} />
              <span>Upload cover image</span>
              <span className={styles.thumbnailHint}>PNG, JPG or WebP · max 5 MB</span>
            </label>
          )}
          <input
            accept="image/png,image/jpeg,image/webp"
            className={styles.thumbnailInput}
            id="thumbnail-input"
            name="thumbnail"
            onChange={handleFileChange}
            type="file"
          />
          <input name="removeThumbnail" type="hidden" value={removeThumb ? "true" : "false"} />
        </div>
        {/* ── End thumbnail ─────────────────────────── */}

        <div className={styles.columns}>
          <label>
            Status
            <select defaultValue={course.status} name="status">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label>
            Order
            <input defaultValue={course.sort_order} min="0" name="sortOrder" type="number" />
          </label>
        </div>
        <input name="acknowledgeImpact" type="hidden" value="false" />
        <div className={styles.settingsActions}>
          <button disabled={busy} type="submit">
            Save settings
          </button>
        </div>
      </form>
    </div>
  );
}
```

---

## Change 5 — CSS additions

**File:** `components/course-detail-manager.module.css`

```css
/* ── Thumbnail field ─────────────────────────────────────────── */
.thumbnailField {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fieldLabel {
  font-size: 13px;
  font-weight: 600;
  color: var(--foreground, #111);
}

.thumbnailPreview {
  position: relative;
  width: 160px;
  height: 100px;
  border-radius: 8px;
  overflow: hidden;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
}

.thumbnailRemoveBtn {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(0,0,0,0.55);
  border: none;
  color: #fff;
  cursor: pointer;
}

.thumbnailRemoveBtn:hover {
  background: rgba(0,0,0,0.75);
}

.thumbnailUploadArea {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 160px;
  height: 100px;
  border-radius: 8px;
  border: 1.5px dashed #d1d5db;
  background: #fafafa;
  cursor: pointer;
  font-size: 12px;
  color: #6b7280;
  transition: border-color 0.15s, background 0.15s;
}

.thumbnailUploadArea:hover {
  border-color: #9ca3af;
  background: #f3f4f6;
}

.thumbnailHint {
  font-size: 10px;
  color: #9ca3af;
}

.thumbnailInput {
  /* visually hidden but still functional via the label */
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
```

---

## Acceptance criteria

Test against KaiTrades only.

1. Open any course → Settings tab — thumbnail section appears below Description
2. If no thumbnail exists: dashed upload area is shown with "Upload cover image"
3. Click the upload area → file picker opens filtered to PNG/JPG/WebP
4. Select a valid image → preview appears immediately (local object URL, no server round-trip yet)
5. Click "Save settings" → thumbnail uploads, page refreshes, preview persists using signed URL
6. With a thumbnail present: ✕ button is visible on hover
7. Click ✕ → preview clears, upload area reappears
8. Click "Save settings" → thumbnail is removed; course library card no longer shows the image
9. Uploading a file > 5 MB → API returns a 400 with "Use a PNG, JPG, or WebP thumbnail smaller than 5 MB." — surface this error via the existing `setError` mechanism in `CourseDetailManager` (the form's `saveCourse` handler already calls `setError` on non-ok responses)
10. Thumbnail appears on the course library card (already wired up in `course-manager.tsx`)
