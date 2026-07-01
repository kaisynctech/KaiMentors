# EP-042 — Delete Student / Delete Group

**Status:** Ready for Engineering  
**Architect:** KaiMentors Enterprise Architect  
**Date:** 2026-06-29  
**Scope:** 2 new API route files + 2 modified components  
**Migration required:** No  
**API changes:** Yes — new DELETE endpoints  
**Package install required:** No

---

## Objective

Give mentors the ability to permanently delete a student application and to permanently delete a custom student group, both with a confirmation step before committing the action.

---

## Change 1 — New API route: DELETE student application

**New file:** `app/api/students/[applicationId]/route.ts`

The `[applicationId]` directory already exists (it has a `proof` subdirectory). Create `route.ts` inside it.

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({ applicationId: z.string().uuid() });

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid application ID." }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  // Resolve trader_id for this mentor
  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 403 });
  }
  const tid = membership.trader_id;
  const appId = params.data.applicationId;

  // Confirm the application belongs to this trader and get student_user_id
  const { data: application } = await supabase
    .from("student_applications")
    .select("id,student_user_id")
    .eq("id", appId)
    .eq("trader_id", tid)
    .maybeSingle();
  if (!application) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  // 1. Remove from all group memberships (references application_id)
  await supabase
    .from("student_group_members")
    .delete()
    .eq("application_id", appId);

  // 2. Revoke individual content access grants for this student under this trader
  if (application.student_user_id) {
    await supabase
      .from("content_access_grants")
      .delete()
      .eq("trader_id", tid)
      .eq("student_user_id", application.student_user_id);
  }

  // 3. Delete the application record itself
  const { error: deleteError } = await supabase
    .from("student_applications")
    .delete()
    .eq("id", appId)
    .eq("trader_id", tid);

  if (deleteError) {
    return NextResponse.json(
      { error: "The student could not be deleted." },
      { status: 500 },
    );
  }

  return NextResponse.json({ deleted: appId });
}
```

**Notes:**
- `lesson_progress` rows are intentionally kept as an audit trail.
- All three delete steps use the authenticated client, so RLS applies throughout.
- The `student_user_id` guard on step 2 is defensive — applications with no linked auth user have no grants to revoke.

---

## Change 2 — New API route: DELETE student group

**New file:** `app/api/groups/[groupId]/route.ts`

The `[groupId]` directory already exists (it has a `members` subdirectory). Create `route.ts` inside it.

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({ groupId: z.string().uuid() });

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid group ID." }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 403 });
  }
  const tid = membership.trader_id;
  const groupId = params.data.groupId;

  // Confirm the group belongs to this trader and is not a system group
  const { data: group } = await supabase
    .from("student_groups")
    .select("id,system_key")
    .eq("id", groupId)
    .eq("trader_id", tid)
    .maybeSingle();
  if (!group) {
    return NextResponse.json({ error: "Group not found." }, { status: 404 });
  }
  if (group.system_key !== null) {
    return NextResponse.json(
      { error: "System groups cannot be deleted." },
      { status: 409 },
    );
  }

  // 1. Remove all group memberships
  await supabase
    .from("student_group_members")
    .delete()
    .eq("group_id", groupId);

  // 2. Revoke any course access grants assigned to this group
  await supabase
    .from("content_access_grants")
    .delete()
    .eq("trader_id", tid)
    .eq("group_id", groupId);

  // 3. Delete the group record
  const { error: deleteError } = await supabase
    .from("student_groups")
    .delete()
    .eq("id", groupId)
    .eq("trader_id", tid);

  if (deleteError) {
    return NextResponse.json(
      { error: "The group could not be deleted." },
      { status: 500 },
    );
  }

  return NextResponse.json({ deleted: groupId });
}
```

---

## Change 3 — UI: Delete student in `StudentReviewList`

**File:** `components/student-review-list.tsx`

### 3a — Add `Trash2` to the lucide-react import

Current import line (line 2–14):
```typescript
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  Filter,
  Loader2,
  MessageSquareMore,
  Search,
  X,
} from "lucide-react";
```

Add `Trash2` to the list:
```typescript
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  Filter,
  Loader2,
  MessageSquareMore,
  Search,
  Trash2,
  X,
} from "lucide-react";
```

### 3b — Add `deleteConfirm` state and `handleDelete` function

Find the existing state declarations block (around line 111, near `const [dialog, setDialog]`). Add immediately after the `dialog` / `setDialog` line:

```typescript
const [deleteConfirm, setDeleteConfirm] = useState<StudentApplicationRow | null>(null);
const [deleting, setDeleting] = useState(false);
const [deleteError, setDeleteError] = useState("");
```

Then add `handleDelete` immediately after the existing `handleReview` function:

```typescript
async function handleDelete() {
  if (!deleteConfirm) return;
  setDeleting(true);
  setDeleteError("");
  try {
    const response = await fetch(`/api/students/${deleteConfirm.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setDeleteError(body.error ?? "The student could not be deleted.");
      return;
    }
    setDeleteConfirm(null);
    router.refresh();
  } catch {
    setDeleteError("Something went wrong. Please try again.");
  } finally {
    setDeleting(false);
  }
}
```

### 3c — Add the Trash2 icon button in each row's `rowActions`

Find the `<div className={styles.rowActions}>` block inside the table body (around line 493). It currently contains the `Eye` button and conditionally the review buttons. Add the `Trash2` button **after** the `Eye` button and **before** the `{reviewable ? ...}` block:

```tsx
<button
  aria-label={`Delete ${application.studentName}`}
  className={styles.deleteIcon}
  onClick={(e) => {
    e.stopPropagation();
    setDeleteConfirm(application);
    setDeleteError("");
  }}
  title="Delete student"
  type="button"
>
  <Trash2 size={16} />
</button>
```

### 3d — Add the confirmation dialog

Find the `{dialog ? (` confirmation dialog block (near the bottom of the return, around line 600). Add the delete confirmation dialog **alongside** it (after the closing brace of the existing dialog block, before the closing `</section>` of the component):

```tsx
{deleteConfirm ? (
  <div className={styles.modalOverlay}>
    <div className={styles.modal} role="dialog" aria-modal="true">
      <header>
        <h3>Delete student</h3>
        <button
          aria-label="Close"
          onClick={() => setDeleteConfirm(null)}
          type="button"
        >
          <X size={18} />
        </button>
      </header>
      <div className={styles.modalBody}>
        <p>
          Permanently delete <strong>{deleteConfirm.studentName}</strong>? This
          will remove their application record and revoke all course access.
          Lesson progress history is retained.
        </p>
        <p style={{ color: "#d93025", fontSize: 13, marginTop: 8 }}>
          This action cannot be undone.
        </p>
        {deleteError ? (
          <p className={styles.error} style={{ marginTop: 8 }}>
            {deleteError}
          </p>
        ) : null}
      </div>
      <footer className={styles.modalFooter}>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            disabled={deleting}
            onClick={() => setDeleteConfirm(null)}
            type="button"
          >
            Cancel
          </button>
          <button
            className={styles.deleteConfirmButton}
            disabled={deleting}
            onClick={handleDelete}
            type="button"
          >
            {deleting ? <Loader2 className={styles.spin} size={15} /> : null}
            Delete student
          </button>
        </div>
      </footer>
    </div>
  </div>
) : null}
```

### 3e — Add CSS to `student-review-list.module.css`

Append to the end of the file:

```css
.deleteIcon {
  color: #9aa0a6;
  transition: color 150ms;
}
.deleteIcon:hover {
  color: #d93025;
}
.deleteConfirmButton {
  background: #d93025 !important;
  color: #fff !important;
  border-color: #d93025 !important;
}
.deleteConfirmButton:hover:not(:disabled) {
  background: #b3261e !important;
}
```

---

## Change 4 — UI: Delete group in `StudentGroupManager`

**File:** `components/student-group-manager.tsx`

### 4a — Add `Trash2` to the lucide-react import

Current import (line 2–15) includes `ArrowLeft, Check, ChevronRight, Loader2, LockKeyhole, MessageCircle, Plus, Search, UserMinus, UsersRound, X`. Add `Trash2`:

```typescript
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Loader2,
  LockKeyhole,
  MessageCircle,
  Plus,
  Search,
  Trash2,
  UserMinus,
  UsersRound,
  X,
} from "lucide-react";
```

### 4b — Extend `MemberDialogMode` and add delete state

Current type (line 25):
```typescript
type MemberDialogMode = "create" | "manage" | null;
```

Replace with:
```typescript
type MemberDialogMode = "create" | "manage" | "delete" | null;
```

Add two new state variables alongside the existing state declarations (near `const [saving, setSaving]`):

```typescript
const [groupDeleting, setGroupDeleting] = useState(false);
const [groupDeleteError, setGroupDeleteError] = useState("");
```

### 4c — Add `handleDeleteGroup` function

Add after the `openManageMembers` function:

```typescript
async function handleDeleteGroup() {
  if (!selectedGroup || selectedGroup.isSystem) return;
  setGroupDeleting(true);
  setGroupDeleteError("");
  try {
    const response = await fetch(`/api/groups/${selectedGroup.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setGroupDeleteError(body.error ?? "The group could not be deleted.");
      return;
    }
    setDialogMode(null);
    setSelectedGroupId("");
    router.refresh();
  } catch {
    setGroupDeleteError("Something went wrong. Please try again.");
  } finally {
    setGroupDeleting(false);
  }
}
```

### 4d — Add "Delete group" button in `detailActions`

Find the `<div className={styles.detailActions}>` block (around line 330). It currently contains a conditional `<Link>` for the conversation and a conditional `<button>` for "Add or remove students". Add a delete button **after** the "Add or remove students" button (still inside `detailActions`):

```tsx
{!selectedGroup.isSystem ? (
  <button
    className={styles.deleteGroupButton}
    onClick={() => {
      resetFeedback();
      setGroupDeleteError("");
      setDialogMode("delete");
    }}
    type="button"
  >
    <Trash2 size={16} /> Delete group
  </button>
) : null}
```

### 4e — Add the delete confirmation inside the existing modal block

Find the existing `{dialogMode ? (` block (around line 438). The modal content currently has two branches (`dialogMode === "create"` and `"manage"`). Add a third branch for `"delete"`.

Inside `<div className={styles.modal}>`, after the `<header>` section but wrapping the body and footer, add the delete branch alongside the existing `{dialogMode === "create" ? ... : ...}` structure.

The simplest approach: replace the modal body + footer pattern to include the delete case:

```tsx
{dialogMode === "delete" ? (
  <>
    <div className={styles.modalBody}>
      <p>
        Permanently delete <strong>{selectedGroup?.name}</strong>? All{" "}
        {selectedGroup?.memberIds.length ?? 0} member
        {(selectedGroup?.memberIds.length ?? 0) === 1 ? "" : "s"} will be
        unlinked and any course access granted to this group will be revoked.
      </p>
      <p style={{ color: "#d93025", fontSize: 13, marginTop: 8 }}>
        This action cannot be undone.
      </p>
      {groupDeleteError ? (
        <p className={styles.error} style={{ marginTop: 8 }}>
          {groupDeleteError}
        </p>
      ) : null}
    </div>
    <footer className={styles.modalFooter}>
      <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
        <button
          disabled={groupDeleting}
          onClick={() => setDialogMode(null)}
          type="button"
        >
          Cancel
        </button>
        <button
          className={styles.deleteConfirmButton}
          disabled={groupDeleting}
          onClick={handleDeleteGroup}
          type="button"
        >
          {groupDeleting ? (
            <Loader2 className={styles.spin} size={16} />
          ) : null}
          Delete group
        </button>
      </div>
    </footer>
  </>
) : (
  // existing form block (create / manage) — unchanged
  <form onSubmit={handleSubmit}>
    {/* ... all existing form content unchanged ... */}
  </form>
)}
```

> **Important:** Do not modify the existing `<form onSubmit={handleSubmit}>` block at all — just wrap it in the `else` branch of the ternary above. The `<header>` (with its title and X close button) stays outside this ternary and remains common to all three modes. Update the header title to handle the delete case:

Find the `<h3>` inside the modal header. It currently reads something like:
```tsx
<h3>{dialogMode === "create" ? "Create group" : "Manage members"}</h3>
```

Replace with:
```tsx
<h3>
  {dialogMode === "create"
    ? "Create group"
    : dialogMode === "delete"
      ? "Delete group"
      : "Manage members"}
</h3>
```

### 4f — Add CSS to `student-group-manager.module.css`

Append to the end of the file:

```css
.deleteGroupButton {
  color: #d93025 !important;
  border-color: #fce8e6 !important;
  background: #fce8e6 !important;
}
.deleteGroupButton:hover:not(:disabled) {
  background: #f5c6c2 !important;
}
.deleteConfirmButton {
  background: #d93025 !important;
  color: #fff !important;
  border-color: #d93025 !important;
}
.deleteConfirmButton:hover:not(:disabled) {
  background: #b3261e !important;
}
```

---

## Commit and deploy

```bash
npx tsc --noEmit
git add -A
git commit -m "EP-042: delete student + delete group"
git push origin main
```

---

## Acceptance criteria

Test against KaiTrades only.

**Delete student:**
1. Open Students → any tab — every row has a red-on-hover trash icon in the Actions column
2. Click the trash icon → confirmation modal appears with the student's name and a warning that it cannot be undone
3. Click Cancel → modal closes, no change
4. Click "Delete student" → spinner shows, modal closes, list refreshes — student no longer appears
5. Attempt to fetch `DELETE /api/students/<id>` for a student belonging to another trader → 404
6. The student's lesson progress rows still exist in Supabase (verify directly) — progress is NOT deleted

**Delete group:**
1. Open Groups → select any custom group → detail panel shows a red "Delete group" button
2. System group (Automatic badge) → detail panel does NOT show a delete button
3. Click "Delete group" → modal opens with member count and course-access warning
4. Click Cancel → modal closes, no change
5. Click "Delete group" confirm → spinner, modal closes, group list refreshes — group gone
6. Attempt `DELETE /api/groups/<system_group_id>` directly → 409 "System groups cannot be deleted"
7. Any course that had this group in its access settings no longer shows the group in the Access tab picker
