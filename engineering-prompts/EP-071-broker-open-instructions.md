# EP-071 — Broker: Open Account Instructions (Mentor Upload + Student View)

**Date:** 2026-07-02
**Status:** Ready for implementation

---

## Objective

Mentors need a way to guide students through opening a broker account and applying their partner code. Students come in two situations:

1. **Never had an account** — need step-by-step instructions to open one
2. **Already have an account** — need instructions to apply the partner code to their existing account

Each broker account in the mentor dashboard gets an "Instructions" section with two inner tabs. Mentors write step-by-step text, upload a screenshot/image, and optionally upload a short walkthrough video per tab.

Students get a new "Open Account" page in their portal showing these instructions, with the affiliate link as the primary CTA.

---

## Scope

| Area | File(s) | Change |
|---|---|---|
| Migration | `supabase/migrations/20260702160000_broker_instructions.sql` | 6 new columns + student read policy |
| Upload API | `app/api/brokers/accounts/upload/route.ts` | New — signed URL for instruction images/videos |
| Accounts API | `app/api/brokers/accounts/route.ts` | Extend PATCH to accept 6 instruction fields |
| Mentor UI | `components/broker-instructions-editor.tsx` + `.module.css` | New — tab editor with upload, used inside each account card |
| Mentor UI | `components/broker-accounts-manager.tsx` | Add "Instructions" toggle button + render `BrokerInstructionsEditor` per card |
| Student page | `app/student/broker/page.tsx` | New — fetches active broker accounts with signed URLs |
| Student page | `app/academy/broker/page.tsx` | New — identical, for custom domain route |
| Student component | `components/student-broker-view.tsx` + `.module.css` | New — two-tab layout with image + text + video |
| Student nav | `components/student-shell-client.tsx` | Add "Open Account" nav item |
| Student nav | `components/student-shell.tsx` | Pass `locked: false` (no prop change needed) |

---

## 1 — Migration

**File:** `supabase/migrations/20260702160000_broker_instructions.sql`

```sql
-- ── New instruction columns on trader_broker_accounts ───────────────────────
ALTER TABLE public.trader_broker_accounts
  ADD COLUMN IF NOT EXISTS new_account_instructions    TEXT,
  ADD COLUMN IF NOT EXISTS new_account_image_path      TEXT,
  ADD COLUMN IF NOT EXISTS new_account_video_path      TEXT,
  ADD COLUMN IF NOT EXISTS existing_account_instructions TEXT,
  ADD COLUMN IF NOT EXISTS existing_account_image_path TEXT,
  ADD COLUMN IF NOT EXISTS existing_account_video_path  TEXT;

-- ── Student read policy ─────────────────────────────────────────────────────
-- Students may read active broker accounts whose trader_id matches any portal
-- they have an accepted student application for.
CREATE POLICY "students can read active broker accounts for their portal"
  ON public.trader_broker_accounts
  FOR SELECT
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1
      FROM public.student_applications sa
      JOIN public.portals p ON p.id = sa.portal_id
      WHERE sa.student_user_id = auth.uid()
        AND sa.status IN ('pending', 'verified')
        AND p.trader_id = public.trader_broker_accounts.trader_id
    )
  );
```

---

## 2 — Upload API

**File:** `app/api/brokers/accounts/upload/route.ts` — create new file

Same signed-URL pattern as Resources upload. Client calls this to get a PUT URL, then PUTs the file directly to Supabase Storage.

```typescript
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/gif",
];
const ALLOWED_VIDEO_TYPES = [
  "video/mp4", "video/webm", "video/quicktime",
];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;  // 10 MB
const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500 MB

const schema = z.object({
  accountId: z.string().uuid(),
  tab: z.enum(["new", "existing"]),
  mediaType: z.enum(["image", "video"]),
  mimeType: z.string(),
  fileSize: z.number().int().positive(),
});

async function getWorkspace() {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!membership) return null;
  return { supabase, traderId: membership.trader_id };
}

export async function POST(request: Request) {
  const workspace = await getWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }

  const { accountId, tab, mediaType, mimeType, fileSize } = parsed.data;

  const allowedTypes = mediaType === "image" ? ALLOWED_IMAGE_TYPES : ALLOWED_VIDEO_TYPES;
  const maxBytes = mediaType === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;

  if (!allowedTypes.includes(mimeType)) {
    return NextResponse.json({ error: "File type not allowed." }, { status: 415 });
  }
  if (fileSize > maxBytes) {
    return NextResponse.json({ error: "File too large." }, { status: 413 });
  }

  // Verify the account belongs to this workspace
  const { data: account } = await workspace.supabase
    .from("trader_broker_accounts")
    .select("id")
    .eq("id", accountId)
    .eq("trader_id", workspace.traderId)
    .maybeSingle();

  if (!account) {
    return NextResponse.json({ error: "Broker account not found." }, { status: 404 });
  }

  const ext = mimeType.split("/")[1]?.replace("quicktime", "mov") ?? "bin";
  const storagePath = `broker-instructions/${workspace.traderId}/${accountId}/${tab}-${mediaType}.${ext}`;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Storage not configured." }, { status: 503 });
  }

  const { data: signed, error } = await admin.storage
    .from("academy-media")
    .createSignedUploadUrl(storagePath, { upsert: true });

  if (error || !signed) {
    return NextResponse.json({ error: "Could not create upload URL." }, { status: 500 });
  }

  return NextResponse.json({
    signedUrl: signed.signedUrl,
    storagePath,
    token: signed.token,
  });
}
```

---

## 3 — Extend PATCH endpoint

**File:** `app/api/brokers/accounts/route.ts`

Extend `updateSchema` to include the 6 instruction fields:

```typescript
// BEFORE:
const updateSchema = z.object({
  accountId: z.string().uuid(),
  isActive: z.boolean().optional(),
  verificationInstructions: z.string().max(2000).nullable().optional(),
  affiliateLink: z.string().url().max(1000).nullable().optional(),
  partnerCode: z.string().trim().min(1).max(160).optional(),
});

// AFTER:
const updateSchema = z.object({
  accountId: z.string().uuid(),
  isActive: z.boolean().optional(),
  verificationInstructions: z.string().max(2000).nullable().optional(),
  affiliateLink: z.string().url().max(1000).nullable().optional(),
  partnerCode: z.string().trim().min(1).max(160).optional(),
  newAccountInstructions:       z.string().max(5000).nullable().optional(),
  newAccountImagePath:          z.string().max(500).nullable().optional(),
  newAccountVideoPath:          z.string().max(500).nullable().optional(),
  existingAccountInstructions:  z.string().max(5000).nullable().optional(),
  existingAccountImagePath:     z.string().max(500).nullable().optional(),
  existingAccountVideoPath:     z.string().max(500).nullable().optional(),
});
```

Then extend the `updatePayload` builder in the `PATCH` handler (after the existing `partnerCode` line):

```typescript
if (data.newAccountInstructions !== undefined)
  updatePayload.new_account_instructions = data.newAccountInstructions;
if (data.newAccountImagePath !== undefined)
  updatePayload.new_account_image_path = data.newAccountImagePath;
if (data.newAccountVideoPath !== undefined)
  updatePayload.new_account_video_path = data.newAccountVideoPath;
if (data.existingAccountInstructions !== undefined)
  updatePayload.existing_account_instructions = data.existingAccountInstructions;
if (data.existingAccountImagePath !== undefined)
  updatePayload.existing_account_image_path = data.existingAccountImagePath;
if (data.existingAccountVideoPath !== undefined)
  updatePayload.existing_account_video_path = data.existingAccountVideoPath;
```

---

## 4 — BrokerInstructionsEditor component

**File:** `components/broker-instructions-editor.tsx` — create new file

This is a client component rendered inside each account card when the mentor opens the instructions panel. It handles the two-tab UI, text editing, image upload, and video upload.

```typescript
"use client";

import { useState, useRef } from "react";
import { ImagePlus, Loader2, Save, Trash2, Video } from "lucide-react";
import styles from "./broker-instructions-editor.module.css";

type InstructionTab = "new" | "existing";

interface TabData {
  instructions: string;
  imagePath: string | null;
  imagePreviewUrl: string | null;
  videoPath: string | null;
  videoPreviewUrl: string | null;
}

interface BrokerInstructionsEditorProps {
  accountId: string;
  brokerName: string;
  initialNew: Omit<TabData, "imagePreviewUrl" | "videoPreviewUrl"> & {
    imageUrl: string | null;
    videoUrl: string | null;
  };
  initialExisting: Omit<TabData, "imagePreviewUrl" | "videoPreviewUrl"> & {
    imageUrl: string | null;
    videoUrl: string | null;
  };
  onSaved: () => void;
}

export function BrokerInstructionsEditor({
  accountId,
  brokerName,
  initialNew,
  initialExisting,
  onSaved,
}: BrokerInstructionsEditorProps) {
  const [activeTab, setActiveTab] = useState<InstructionTab>("new");

  const [newTab, setNewTab] = useState<TabData>({
    instructions: initialNew.instructions,
    imagePath: initialNew.imagePath,
    imagePreviewUrl: initialNew.imageUrl,
    videoPath: initialNew.videoPath,
    videoPreviewUrl: initialNew.videoUrl,
  });

  const [existingTab, setExistingTab] = useState<TabData>({
    instructions: initialExisting.instructions,
    imagePath: initialExisting.imagePath,
    imagePreviewUrl: initialExisting.imageUrl,
    videoPath: initialExisting.videoPath,
    videoPreviewUrl: initialExisting.videoUrl,
  });

  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState<InstructionTab | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState<InstructionTab | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const newImageRef = useRef<HTMLInputElement>(null);
  const existingImageRef = useRef<HTMLInputElement>(null);
  const newVideoRef = useRef<HTMLInputElement>(null);
  const existingVideoRef = useRef<HTMLInputElement>(null);

  function getTab(t: InstructionTab) { return t === "new" ? newTab : existingTab; }
  function setTab(t: InstructionTab, update: Partial<TabData>) {
    if (t === "new") setNewTab((s) => ({ ...s, ...update }));
    else setExistingTab((s) => ({ ...s, ...update }));
  }

  async function uploadMedia(
    tab: InstructionTab,
    mediaType: "image" | "video",
    file: File,
  ) {
    const setter = mediaType === "image" ? setUploadingImage : setUploadingVideo;
    setter(tab);
    setError(null);

    const res = await fetch("/api/brokers/accounts/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accountId,
        tab,
        mediaType,
        mimeType: file.type,
        fileSize: file.size,
      }),
    });

    if (!res.ok) {
      const { error: e } = await res.json();
      setError(e ?? "Upload failed.");
      setter(null);
      return;
    }

    const { signedUrl, storagePath } = await res.json();

    const put = await fetch(signedUrl, {
      method: "PUT",
      headers: { "content-type": file.type },
      body: file,
    });

    setter(null);

    if (!put.ok) {
      setError("File upload failed.");
      return;
    }

    const localPreview = URL.createObjectURL(file);
    if (mediaType === "image") {
      setTab(tab, { imagePath: storagePath, imagePreviewUrl: localPreview });
    } else {
      setTab(tab, { videoPath: storagePath, videoPreviewUrl: localPreview });
    }
  }

  async function handleFileChange(
    tab: InstructionTab,
    mediaType: "image" | "video",
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadMedia(tab, mediaType, file);
    e.target.value = "";
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);

    const res = await fetch("/api/brokers/accounts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accountId,
        newAccountInstructions: newTab.instructions || null,
        newAccountImagePath: newTab.imagePath,
        newAccountVideoPath: newTab.videoPath,
        existingAccountInstructions: existingTab.instructions || null,
        existingAccountImagePath: existingTab.imagePath,
        existingAccountVideoPath: existingTab.videoPath,
      }),
    });

    setSaving(false);

    if (!res.ok) {
      const { error: e } = await res.json();
      setError(e ?? "Could not save instructions.");
      return;
    }

    setSaved(true);
    onSaved();
  }

  const tab = getTab(activeTab);
  const tabLabel = activeTab === "new"
    ? `New to ${brokerName}`
    : `Already have an account`;
  const imageUploading = uploadingImage === activeTab;
  const videoUploading = uploadingVideo === activeTab;

  return (
    <div className={styles.editor}>
      {/* Tab switcher */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === "new" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("new")}
          type="button"
        >
          New to {brokerName}
        </button>
        <button
          className={`${styles.tab} ${activeTab === "existing" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("existing")}
          type="button"
        >
          Already have an account
        </button>
      </div>

      <div className={styles.tabContent}>
        {/* Image area */}
        <div className={styles.imageArea}>
          {tab.imagePreviewUrl ? (
            <div className={styles.imagePreviewWrap}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt="Instruction screenshot"
                className={styles.imagePreview}
                src={tab.imagePreviewUrl}
              />
              <button
                className={styles.removeBtn}
                onClick={() =>
                  setTab(activeTab, { imagePath: null, imagePreviewUrl: null })
                }
                title="Remove image"
                type="button"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ) : (
            <button
              className={styles.uploadImageBtn}
              disabled={imageUploading}
              onClick={() =>
                (activeTab === "new" ? newImageRef : existingImageRef).current?.click()
              }
              type="button"
            >
              {imageUploading ? (
                <Loader2 className={styles.spin} size={20} />
              ) : (
                <ImagePlus size={20} />
              )}
              {imageUploading ? "Uploading…" : "Add screenshot"}
            </button>
          )}
          <input
            accept="image/jpeg,image/png,image/webp"
            className={styles.fileInput}
            onChange={(e) => handleFileChange("new", "image", e)}
            ref={newImageRef}
            type="file"
          />
          <input
            accept="image/jpeg,image/png,image/webp"
            className={styles.fileInput}
            onChange={(e) => handleFileChange("existing", "image", e)}
            ref={existingImageRef}
            type="file"
          />
        </div>

        {/* Text instructions */}
        <div className={styles.textArea}>
          <label className={styles.instructionsLabel}>
            Instructions — {tabLabel}
            <textarea
              className={styles.instructionsInput}
              maxLength={5000}
              onChange={(e) =>
                setTab(activeTab, { instructions: e.target.value })
              }
              placeholder={
                activeTab === "new"
                  ? `Step 1: Click the link below to open a ${brokerName} account.\nStep 2: Fill in your details and complete registration.\nStep 3: Enter partner code ${""} when prompted…`
                  : `Step 1: Log into your existing ${brokerName} account.\nStep 2: Go to Account settings → Partners.\nStep 3: Enter our partner code…`
              }
              rows={9}
              value={tab.instructions}
            />
          </label>
        </div>
      </div>

      {/* Video upload */}
      <div className={styles.videoArea}>
        <span className={styles.videoLabel}>
          <Video size={15} />
          Walkthrough video (optional)
        </span>
        {tab.videoPreviewUrl ? (
          <div className={styles.videoPreviewWrap}>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              className={styles.videoPreview}
              controls
              src={tab.videoPreviewUrl}
            />
            <button
              className={styles.removeBtn}
              onClick={() =>
                setTab(activeTab, { videoPath: null, videoPreviewUrl: null })
              }
              title="Remove video"
              type="button"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ) : (
          <button
            className={styles.uploadVideoBtn}
            disabled={videoUploading}
            onClick={() =>
              (activeTab === "new" ? newVideoRef : existingVideoRef).current?.click()
            }
            type="button"
          >
            {videoUploading ? (
              <Loader2 className={styles.spin} size={16} />
            ) : (
              <Video size={16} />
            )}
            {videoUploading ? "Uploading…" : "Upload video"}
          </button>
        )}
        <input
          accept="video/mp4,video/webm,video/quicktime"
          className={styles.fileInput}
          onChange={(e) => handleFileChange("new", "video", e)}
          ref={newVideoRef}
          type="file"
        />
        <input
          accept="video/mp4,video/webm,video/quicktime"
          className={styles.fileInput}
          onChange={(e) => handleFileChange("existing", "video", e)}
          ref={existingVideoRef}
          type="file"
        />
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {saved ? (
        <p className={styles.success}>Instructions saved.</p>
      ) : null}

      <button
        className={styles.saveBtn}
        disabled={saving}
        onClick={save}
        type="button"
      >
        {saving ? <Loader2 className={styles.spin} size={16} /> : <Save size={16} />}
        Save instructions
      </button>
    </div>
  );
}
```

**File:** `components/broker-instructions-editor.module.css` — create new file

```css
.editor {
  padding: 1.25rem 0 0;
  border-top: 1px solid var(--border);
  margin-top: 1rem;
}

/* ── Tabs ───────────────────────────────────────────────── */
.tabs {
  display: flex;
  gap: 0.4rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 1.25rem;
}

.tab {
  padding: 0.45rem 1rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-muted);
  border: none;
  background: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.tab:hover { color: var(--text-primary); }

.tabActive {
  color: var(--text-primary);
  border-bottom-color: #111314;
}

/* ── Tab content: image + text side by side ─────────────── */
.tabContent {
  display: grid;
  grid-template-columns: 1fr 1.6fr;
  gap: 1.25rem;
  align-items: start;
  margin-bottom: 1rem;
}

@media (max-width: 700px) {
  .tabContent { grid-template-columns: 1fr; }
}

/* ── Image area ─────────────────────────────────────────── */
.imageArea { position: relative; }

.uploadImageBtn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  height: 180px;
  border: 2px dashed var(--border);
  border-radius: 12px;
  background: var(--surface-hover, #f9fafb);
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.uploadImageBtn:hover:not(:disabled) {
  border-color: #111314;
  color: var(--text-primary);
}

.imagePreviewWrap { position: relative; }

.imagePreview {
  width: 100%;
  border-radius: 10px;
  object-fit: contain;
  max-height: 220px;
  background: #f3f4f6;
}

/* ── Text area ──────────────────────────────────────────── */
.textArea {}

.instructionsLabel {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-muted);
}

.instructionsInput {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.75rem 1rem;
  font-size: 0.85rem;
  line-height: 1.6;
  resize: vertical;
  font-family: inherit;
}

/* ── Video area ─────────────────────────────────────────── */
.videoArea {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-bottom: 1rem;
}

.videoLabel {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-muted);
}

.uploadVideoBtn {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.5rem 1rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  width: fit-content;
  transition: border-color 0.15s, color 0.15s;
}

.uploadVideoBtn:hover:not(:disabled) {
  border-color: #111314;
  color: var(--text-primary);
}

.videoPreviewWrap { position: relative; }

.videoPreview {
  width: 100%;
  max-height: 240px;
  border-radius: 10px;
  background: #111;
}

/* ── Shared ─────────────────────────────────────────────── */
.removeBtn {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  background: rgba(0,0,0,0.6);
  border: none;
  border-radius: 6px;
  padding: 0.3rem 0.4rem;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.fileInput { display: none; }

.saveBtn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 1.25rem;
  background: #111314;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
}

.saveBtn:disabled { opacity: 0.6; cursor: default; }

.error { font-size: 0.82rem; color: #c0392b; margin: 0.5rem 0; }
.success { font-size: 0.82rem; color: #27ae60; margin: 0.5rem 0; }

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

---

## 5 — Extend BrokerAccountsManager

**File:** `components/broker-accounts-manager.tsx`

### 5a — Extend `BrokerAccount` interface

```typescript
// BEFORE:
interface BrokerAccount {
  id: string;
  partner_code: string;
  affiliate_link: string | null;
  verification_method: VerificationMethod;
  verification_instructions: string | null;
  is_active: boolean;
  broker: { name: string } | null;
}

// AFTER:
interface BrokerAccount {
  id: string;
  partner_code: string;
  affiliate_link: string | null;
  verification_method: VerificationMethod;
  verification_instructions: string | null;
  is_active: boolean;
  broker: { name: string } | null;
  new_account_instructions: string | null;
  new_account_image_path: string | null;
  new_account_image_url: string | null;   // signed URL — passed from server page
  new_account_video_path: string | null;
  new_account_video_url: string | null;   // signed URL — passed from server page
  existing_account_instructions: string | null;
  existing_account_image_path: string | null;
  existing_account_image_url: string | null;
  existing_account_video_path: string | null;
  existing_account_video_url: string | null;
}
```

### 5b — Add import

```typescript
import { BrokerInstructionsEditor } from "@/components/broker-instructions-editor";
```

### 5c — Add instructions state

Inside the `BrokerAccountsManager` function, after the existing state declarations, add:

```typescript
const [instructionsId, setInstructionsId] = useState<string | null>(null);
```

### 5d — Add "Instructions" button and `BrokerInstructionsEditor` inside each account card

Inside the `accounts.map(...)` render, after the `{isEditing ? ... }` block and **before** `<div className={styles.accountActions}>`, add:

```tsx
{/* Instructions editor */}
{instructionsId === account.id ? (
  <BrokerInstructionsEditor
    accountId={account.id}
    brokerName={account.broker?.name ?? "Broker"}
    initialNew={{
      instructions: account.new_account_instructions ?? "",
      imagePath: account.new_account_image_path,
      imageUrl: account.new_account_image_url,
      videoPath: account.new_account_video_path,
      videoUrl: account.new_account_video_url,
    }}
    initialExisting={{
      instructions: account.existing_account_instructions ?? "",
      imagePath: account.existing_account_image_path,
      imageUrl: account.existing_account_image_url,
      videoPath: account.existing_account_video_path,
      videoUrl: account.existing_account_video_url,
    }}
    onSaved={() => router.refresh()}
  />
) : null}
```

### 5e — Add "Instructions" button to `accountActions`

Add a third button to the `<div className={styles.accountActions}>`:

```tsx
<button
  className={styles.editBtn}
  onClick={() =>
    setInstructionsId(instructionsId === account.id ? null : account.id)
  }
  type="button"
>
  <FileText size={14} />
  {instructionsId === account.id ? "Close" : "Instructions"}
</button>
```

Add `FileText` to the lucide-react import at the top of the file.

---

## 6 — Settings page: fetch signed URLs

**File:** `app/dashboard/settings/page.tsx` — brokers tab section

The brokers query currently uses `select(...)` without the new columns. Update the select string and sign image/video URLs:

```typescript
// In the "brokers" tab branch:
const { data } = await supabase
  .from("trader_broker_accounts")
  .select(
    "id,partner_code,affiliate_link,verification_method,verification_instructions,is_active,broker:brokers(name),new_account_instructions,new_account_image_path,new_account_video_path,existing_account_instructions,existing_account_image_path,existing_account_video_path",
  )
  .eq("trader_id", traderId)
  .order("created_at", { ascending: false });

// After fetching data, sign the media URLs:
const accounts = await Promise.all(
  (data ?? []).map(async (account) => {
    async function signPath(path: string | null): Promise<string | null> {
      if (!path) return null;
      const { data: signed } = await supabase.storage
        .from("academy-media")
        .createSignedUrl(path, 3600);
      return signed?.signedUrl ?? null;
    }

    const [
      newImageUrl, newVideoUrl,
      existingImageUrl, existingVideoUrl,
    ] = await Promise.all([
      signPath(account.new_account_image_path),
      signPath(account.new_account_video_path),
      signPath(account.existing_account_image_path),
      signPath(account.existing_account_video_path),
    ]);

    return {
      ...account,
      verification_method: account.verification_method as VerificationMethod,
      verification_instructions:
        (account as { verification_instructions?: string | null })
          .verification_instructions ?? null,
      broker: Array.isArray(account.broker)
        ? account.broker[0] ?? null
        : account.broker,
      new_account_image_url: newImageUrl,
      new_account_video_url: newVideoUrl,
      existing_account_image_url: existingImageUrl,
      existing_account_video_url: existingVideoUrl,
    };
  }),
);
```

---

## 7 — Student component

**File:** `components/student-broker-view.tsx` — create new file

```typescript
"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import styles from "./student-broker-view.module.css";

interface BrokerInstruction {
  id: string;
  brokerName: string;
  affiliateLink: string | null;
  newAccountInstructions: string | null;
  newAccountImageUrl: string | null;
  newAccountVideoUrl: string | null;
  existingAccountInstructions: string | null;
  existingAccountImageUrl: string | null;
  existingAccountVideoUrl: string | null;
}

interface StudentBrokerViewProps {
  brokers: BrokerInstruction[];
}

type InstructionTab = "new" | "existing";

export function StudentBrokerView({ brokers }: StudentBrokerViewProps) {
  const [activeTabs, setActiveTabs] = useState<Record<string, InstructionTab>>(
    Object.fromEntries(brokers.map((b) => [b.id, "new"])),
  );

  if (brokers.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No broker accounts are currently available. Check back soon.</p>
      </div>
    );
  }

  return (
    <div className={styles.brokerList}>
      {brokers.map((broker) => {
        const tab = activeTabs[broker.id] ?? "new";
        const image =
          tab === "new" ? broker.newAccountImageUrl : broker.existingAccountImageUrl;
        const video =
          tab === "new" ? broker.newAccountVideoUrl : broker.existingAccountVideoUrl;
        const instructions =
          tab === "new"
            ? broker.newAccountInstructions
            : broker.existingAccountInstructions;

        return (
          <article className={styles.card} key={broker.id}>
            {/* Card header */}
            <div className={styles.cardHeader}>
              <div className={styles.brokerInitial}>
                {broker.brokerName.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <h2 className={styles.brokerName}>{broker.brokerName}</h2>
                <p className={styles.brokerSub}>Partner account</p>
              </div>
              {broker.affiliateLink ? (
                <a
                  className={styles.openBtn}
                  href={broker.affiliateLink}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open account <ExternalLink size={14} />
                </a>
              ) : null}
            </div>

            {/* Tab switcher */}
            <div className={styles.tabs}>
              <button
                className={`${styles.tab} ${tab === "new" ? styles.tabActive : ""}`}
                onClick={() =>
                  setActiveTabs((s) => ({ ...s, [broker.id]: "new" }))
                }
                type="button"
              >
                I&apos;m new to {broker.brokerName}
              </button>
              <button
                className={`${styles.tab} ${tab === "existing" ? styles.tabActive : ""}`}
                onClick={() =>
                  setActiveTabs((s) => ({ ...s, [broker.id]: "existing" }))
                }
                type="button"
              >
                I already have an account
              </button>
            </div>

            {/* Content: image left, instructions right */}
            {image || instructions ? (
              <div className={styles.content}>
                {image ? (
                  <div className={styles.imageCol}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt={`${broker.brokerName} instructions`}
                      className={styles.instructionImage}
                      src={image}
                    />
                  </div>
                ) : null}
                {instructions ? (
                  <div className={styles.instructionCol}>
                    <pre className={styles.instructionText}>{instructions}</pre>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className={styles.empty}>No instructions added for this tab yet.</p>
            )}

            {/* Video */}
            {video ? (
              <div className={styles.videoWrap}>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video
                  className={styles.video}
                  controls
                  preload="metadata"
                  src={video}
                />
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
```

**File:** `components/student-broker-view.module.css` — create new file

```css
.brokerList {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.card {
  background: var(--surface, #fff);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 1.5rem;
}

/* ── Card header ────────────────────────────────────────── */
.cardHeader {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.brokerInitial {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: #111314;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  font-weight: 800;
  flex-shrink: 0;
}

.brokerName {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 800;
  letter-spacing: -0.03em;
}

.brokerSub {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.openBtn {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 1.1rem;
  background: #111314;
  color: #fff;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 700;
  text-decoration: none;
  transition: opacity 0.15s;
  white-space: nowrap;
}

.openBtn:hover { opacity: 0.8; }

/* ── Tabs ───────────────────────────────────────────────── */
.tabs {
  display: flex;
  gap: 0.4rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 1.25rem;
}

.tab {
  padding: 0.45rem 1rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-muted);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.tab:hover { color: var(--text-primary); }

.tabActive {
  color: var(--text-primary);
  border-bottom-color: #111314;
}

/* ── Content: image + instructions ──────────────────────── */
.content {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 1.5rem;
  align-items: start;
  margin-bottom: 1.25rem;
}

@media (max-width: 640px) {
  .content { grid-template-columns: 1fr; }
}

.imageCol {}

.instructionImage {
  width: 100%;
  border-radius: 10px;
  border: 1px solid var(--border);
  object-fit: contain;
  background: #f3f4f6;
}

.instructionCol {}

.instructionText {
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 0.88rem;
  line-height: 1.75;
  color: var(--text-primary);
  margin: 0;
}

/* ── Video ──────────────────────────────────────────────── */
.videoWrap {
  margin-top: 1rem;
}

.video {
  width: 100%;
  border-radius: 10px;
  background: #111;
  max-height: 360px;
}

/* ── Empty ──────────────────────────────────────────────── */
.empty {
  font-size: 0.85rem;
  color: var(--text-muted);
  padding: 1rem 0;
}
```

---

## 8 — Student pages

**File:** `app/student/broker/page.tsx` — create new file

```typescript
import { redirect }            from "next/navigation";
import { StudentShell }        from "@/components/student-shell";
import { StudentBrokerView }   from "@/components/student-broker-view";
import { getStudentAcademyContext } from "@/lib/academy-entry";

export const dynamic = "force-dynamic";

export default async function StudentBrokerPage({
  searchParams,
}: {
  searchParams?: Promise<{ portal?: string }>;
}) {
  const ctx = await getStudentAcademyContext(await searchParams);
  if (!ctx) redirect("/login");

  const { supabase, app, portal, base, suffix, user } = ctx;
  const traderId = portal.trader_id;

  // Fetch active broker accounts visible to this student
  const { data: raw } = await supabase
    .from("trader_broker_accounts")
    .select(
      "id,affiliate_link,new_account_instructions,new_account_image_path,new_account_video_path,existing_account_instructions,existing_account_image_path,existing_account_video_path,broker:brokers(name)",
    )
    .eq("trader_id", traderId)
    .eq("is_active", true)
    .order("created_at");

  // Sign media URLs
  const brokers = await Promise.all(
    (raw ?? []).map(async (item) => {
      async function signPath(path: string | null): Promise<string | null> {
        if (!path) return null;
        const { data: signed } = await supabase.storage
          .from("academy-media")
          .createSignedUrl(path, 3600);
        return signed?.signedUrl ?? null;
      }

      const brokerObj = Array.isArray(item.broker)
        ? item.broker[0]
        : item.broker;

      const [newImageUrl, newVideoUrl, existingImageUrl, existingVideoUrl] =
        await Promise.all([
          signPath(item.new_account_image_path),
          signPath(item.new_account_video_path),
          signPath(item.existing_account_image_path),
          signPath(item.existing_account_video_path),
        ]);

      return {
        id: item.id,
        brokerName: brokerObj?.name ?? "Broker",
        affiliateLink: item.affiliate_link,
        newAccountInstructions: item.new_account_instructions,
        newAccountImageUrl: newImageUrl,
        newAccountVideoUrl: newVideoUrl,
        existingAccountInstructions: item.existing_account_instructions,
        existingAccountImageUrl: existingImageUrl,
        existingAccountVideoUrl: existingVideoUrl,
      };
    }),
  );

  const portalRow = Array.isArray(app.portal) ? app.portal[0] : app.portal;
  const academyName = portalRow?.portal_name ?? "Academy";
  const logoUrl     = null; // resolved by shell
  const isVerified  = app.status === "verified";
  const displayName = user.email?.split("@")[0] ?? "Student";

  return (
    <StudentShell
      academyName={academyName}
      basePath={base}
      displayName={displayName}
      isVerified={isVerified}
      logoUrl={logoUrl}
      portalSlug={portalRow?.slug}
      querySuffix={suffix}
      traderId={portal.trader_id}
    >
      <div style={{ padding: "1.5rem 2rem" }}>
        <p className="eyebrow">Getting started</p>
        <h1 style={{ margin: "0 0 0.35rem", fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.04em" }}>
          Open a broker account
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "2rem" }}>
          Follow the steps below to open your trading account and apply the partner code.
        </p>
        <StudentBrokerView brokers={brokers} />
      </div>
    </StudentShell>
  );
}
```

**File:** `app/academy/broker/page.tsx` — create new file

Identical to `app/student/broker/page.tsx` — copy verbatim and change the import if there's an academy-specific context function; otherwise `getStudentAcademyContext` handles both routes via the `base` variable.

---

## 9 — Student nav: add "Open Account"

**File:** `components/student-shell-client.tsx`

Add a nav item for the broker page. Import `TrendingUp` from lucide-react (or `Landmark`), then add to the `navItems` array after Resources:

```typescript
// Add to imports:
import { ..., Landmark } from "lucide-react";

// Add to navItems array (after Resources):
{
  href: `${basePath}/broker${querySuffix}`,
  label: "Open Account",
  icon: Landmark,
  locked: false,
},
```

---

## 10 — Commit and deploy

```bash
git add -A
git commit -m "feat: EP-071 broker open account instructions — mentor uploads, student two-tab view"
git push origin main && vercel --prod
```

Apply the migration:

```bash
npx supabase db push
```

---

## 11 — Acceptance Criteria

Test with KaiTrades tenant.

**Mentor side:**
- [ ] Each broker account card in Settings → Broker Accounts shows an "Instructions" button
- [ ] Clicking "Instructions" expands the `BrokerInstructionsEditor` with two tabs: "New to [BrokerName]" and "Already have an account"
- [ ] Mentor can type instructions in each tab's text area
- [ ] Mentor can upload a screenshot — image preview appears on the left
- [ ] Mentor can remove an uploaded image
- [ ] Mentor can upload a walkthrough video — video preview appears with controls
- [ ] Clicking "Save instructions" calls `PATCH /api/brokers/accounts` and shows "Instructions saved."
- [ ] Switching tabs preserves each tab's content independently

**Student side:**
- [ ] "Open Account" nav item appears in student sidebar (not locked)
- [ ] Navigating to `/student/broker?portal=kaitrades` (main domain) loads the page
- [ ] Page shows broker card(s) with name, "Open account" button, and two tabs
- [ ] Clicking "I'm new to [Broker]" shows new-account instructions + image + video (if uploaded)
- [ ] Clicking "I already have an account" switches to existing-account content
- [ ] "Open account" button links to the affiliate link in a new tab
- [ ] If no instructions uploaded for a tab, shows graceful empty message
- [ ] TypeScript compiles clean
