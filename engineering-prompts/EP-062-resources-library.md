# EP-062 — Resources Library

**Date:** 2026-07-02
**Status:** Ready for implementation

---

## Objective

Add a standalone **Resources Library** to KaiMentors. Mentors publish individual videos, PDFs, or external links that are not tied to any course. Each item has free-form labels and a per-item access scope (all students, or verified-only). Students browse the library from their portal with label filtering.

This is distinct from:
- **Media Library** — raw asset uploads used as building blocks for courses
- **Course Resources** — supporting material attached to specific lessons inside a course
- **Community Gallery** — social seminar/event content

---

## Scope

| Area | Work |
|---|---|
| DB | New `resource_items` table + RLS |
| API | New upload route; new CRUD route |
| Mentor | `MentorResources` component + `/dashboard/resources` page |
| Student | `ResourcesView` component + `/student/resources` page + `/academy/resources` page |
| Nav | Add "Resources" to student shell; mentor nav item already exists |

---

## 1 — Database Migration

**File:** `supabase/migrations/20260702120000_resource_items.sql`

```sql
-- Resource items: standalone content published by mentors
CREATE TABLE resource_items (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id       UUID        NOT NULL REFERENCES traders(id) ON DELETE CASCADE,
  title           TEXT        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description     TEXT        CHECK (char_length(description) <= 1000),
  type            TEXT        NOT NULL CHECK (type IN ('video', 'pdf', 'link')),
  storage_path    TEXT,       -- set for type = video | pdf
  external_url    TEXT,       -- set for type = link
  thumbnail_path  TEXT,       -- optional cover image path in academy-media bucket
  labels          TEXT[]      NOT NULL DEFAULT '{}',
  access_scope    TEXT        NOT NULL DEFAULT 'all_verified'
                              CHECK (access_scope IN ('all_students', 'all_verified')),
  status          TEXT        NOT NULL DEFAULT 'published'
                              CHECK (status IN ('draft', 'published')),
  sort_order      INT         NOT NULL DEFAULT 0,
  created_by      UUID        NOT NULL REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX resource_items_trader_idx  ON resource_items (trader_id);
CREATE INDEX resource_items_labels_idx  ON resource_items USING GIN (labels);
CREATE INDEX resource_items_created_idx ON resource_items (trader_id, created_at DESC);

ALTER TABLE resource_items ENABLE ROW LEVEL SECURITY;

-- Mentors: full access to their own academy's items
CREATE POLICY "mentors_all_resource_items"
  ON resource_items
  FOR ALL
  USING  (is_trader_member(trader_id))
  WITH CHECK (is_trader_member(trader_id));

-- Students: published items whose scope they satisfy
CREATE POLICY "students_select_resource_items"
  ON resource_items
  FOR SELECT
  USING (
    status = 'published'
    AND (
      (
        access_scope = 'all_students'
        AND EXISTS (
          SELECT 1 FROM student_applications sa
          WHERE sa.trader_id       = resource_items.trader_id
            AND sa.student_user_id = auth.uid()
        )
      )
      OR (
        access_scope = 'all_verified'
        AND EXISTS (
          SELECT 1 FROM student_applications sa
          WHERE sa.trader_id       = resource_items.trader_id
            AND sa.student_user_id = auth.uid()
            AND sa.status          = 'approved'
        )
      )
    )
  );
```

Apply immediately after writing the file:

```bash
# In Supabase MCP or dashboard SQL editor
```

---

## 2 — Upload API

**File:** `app/api/resources/upload/route.ts`

POST — mentor-only. Supports videos **and** PDFs (unlike the community upload route which only accepts image/video).

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMentorWorkspace } from "@/lib/workspace";

const schema = z.object({
  fileName:    z.string().min(1).max(200),
  contentType: z.enum([
    "video/mp4", "video/webm", "video/quicktime",
    "application/pdf",
    "image/jpeg", "image/png", "image/webp",  // thumbnail uploads
  ]),
  subPath: z.enum(["resources", "resources/thumbnails"]).default("resources"),
});

export async function POST(request: Request) {
  const workspace = await getMentorWorkspace();
  if (!workspace) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });

  const { fileName, contentType, subPath } = parsed.data;
  const ext         = fileName.split(".").pop() ?? "bin";
  const uuid        = crypto.randomUUID();
  const storagePath = `${workspace.traderId}/${subPath}/${uuid}.${ext}`;

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Storage not configured." }, { status: 503 });

  const { data, error } = await admin.storage
    .from("academy-media")
    .createSignedUploadUrl(storagePath);

  if (error || !data) return NextResponse.json({ error: "Could not create upload URL." }, { status: 500 });

  return NextResponse.json({ signedUrl: data.signedUrl, storagePath, token: data.token });
}
```

---

## 3 — CRUD API

### 3a — Collection

**File:** `app/api/resources/route.ts`

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { getMentorWorkspace } from "@/lib/workspace";

const createSchema = z.object({
  title:       z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
  type:        z.enum(["video", "pdf", "link"]),
  storagePath: z.string().min(1).optional(),
  externalUrl: z.string().url().optional(),
  thumbnailPath: z.string().optional(),
  labels:      z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  accessScope: z.enum(["all_students", "all_verified"]),
  status:      z.enum(["draft", "published"]).default("published"),
  sortOrder:   z.number().int().min(0).max(100000).default(0),
}).refine(
  (v) => (v.type === "link" ? !!v.externalUrl : !!v.storagePath),
  "Provide a storagePath for uploads or externalUrl for links.",
);

export async function POST(request: Request) {
  const workspace = await getMentorWorkspace();
  if (!workspace) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid resource details." }, { status: 400 });

  const v = parsed.data;
  const { data, error } = await workspace.supabase
    .from("resource_items")
    .insert({
      trader_id:      workspace.traderId,
      title:          v.title,
      description:    v.description ?? null,
      type:           v.type,
      storage_path:   v.storagePath ?? null,
      external_url:   v.externalUrl ?? null,
      thumbnail_path: v.thumbnailPath ?? null,
      labels:         v.labels,
      access_scope:   v.accessScope,
      status:         v.status,
      sort_order:     v.sortOrder,
      created_by:     workspace.user.id,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: "Resource could not be saved." }, { status: 400 });
  return NextResponse.json({ resourceId: data.id }, { status: 201 });
}
```

### 3b — Item (delete + patch)

**File:** `app/api/resources/[id]/route.ts`

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { getMentorWorkspace } from "@/lib/workspace";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  title:       z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  labels:      z.array(z.string().trim().min(1).max(60)).max(10).optional(),
  accessScope: z.enum(["all_students", "all_verified"]).optional(),
  status:      z.enum(["draft", "published"]).optional(),
  sortOrder:   z.number().int().min(0).optional(),
});

export async function DELETE(_: Request, { params }: Params) {
  const { id } = await params;
  const workspace = await getMentorWorkspace();
  if (!workspace) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });

  const { error } = await workspace.supabase
    .from("resource_items")
    .delete()
    .eq("id", id)
    .eq("trader_id", workspace.traderId);

  if (error) return NextResponse.json({ error: "Could not delete resource." }, { status: 400 });
  return new NextResponse(null, { status: 204 });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const workspace = await getMentorWorkspace();
  if (!workspace) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid update." }, { status: 400 });

  const v = parsed.data;
  const patch: Record<string, unknown> = {};
  if (v.title       !== undefined) patch.title        = v.title;
  if (v.description !== undefined) patch.description  = v.description;
  if (v.labels      !== undefined) patch.labels       = v.labels;
  if (v.accessScope !== undefined) patch.access_scope = v.accessScope;
  if (v.status      !== undefined) patch.status       = v.status;
  if (v.sortOrder   !== undefined) patch.sort_order   = v.sortOrder;

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  const { error } = await workspace.supabase
    .from("resource_items")
    .update(patch)
    .eq("id", id)
    .eq("trader_id", workspace.traderId);

  if (error) return NextResponse.json({ error: "Could not update resource." }, { status: 400 });
  return new NextResponse(null, { status: 204 });
}
```

---

## 4 — Mentor Dashboard

### 4a — Component

**File:** `components/mentor-resources.tsx`

`"use client"` component. Props:

```typescript
interface ResourceItem {
  id:            string;
  title:         string;
  description:   string | null;
  type:          "video" | "pdf" | "link";
  storagePath:   string | null;
  externalUrl:   string | null;
  thumbnailUrl:  string | null;   // pre-resolved signed URL from server
  mediaUrl:      string | null;   // pre-resolved signed URL from server (for display)
  labels:        string[];
  accessScope:   "all_students" | "all_verified";
  status:        "draft" | "published";
  createdAt:     string;
}

interface Props {
  traderId:  string;
  resources: ResourceItem[];
}
```

**Create form fields:**
- Type selector: three buttons — "Video", "PDF", "Link"
- If Video or PDF: `<input type="file">` accepting the right MIME type
  - On submit: call `POST /api/resources/upload` → PUT to signedUrl → storagePath saved
  - Video accepts: `video/mp4,video/webm,video/quicktime`
  - PDF accepts: `application/pdf`
- If Link: `<input type="url">` for the external URL
- Title (required text input)
- Description (optional textarea)
- Labels (text input — user types comma-separated tags; split on comma/Enter; render as removable chips below the input)
- Access scope (select): "All Students" / "Verified Students Only"
- Status (select): "Published" / "Draft"
- Submit button — disabled while busy

**Resource list:**
- Grid of cards (`repeat(auto-fill, minmax(260px, 1fr))`)
- Each card shows:
  - Type badge (VIDEO / PDF / LINK) — small pill top-right
  - Thumbnail if available; otherwise a coloured placeholder icon (Film for video, FileText for pdf, ExternalLink for link) using lucide-react
  - Title
  - Labels rendered as small grey chips
  - Access badge: "All Students" or "Verified Only" (small text)
  - Status badge: "published" (green dot) or "draft" (grey dot)
  - Delete button (trash icon) with confirmation — calls `DELETE /api/resources/[id]`
- Optimistic delete: remove from local state immediately on click, revert on error

**Upload helper** (same pattern as `mentor-community.tsx`):

```typescript
async function uploadFile(file: File, subPath: "resources" | "resources/thumbnails"): Promise<string> {
  const res  = await fetch("/api/resources/upload", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ fileName: file.name, contentType: file.type, subPath }),
  });
  const { signedUrl, storagePath } = await res.json();
  await fetch(signedUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  return storagePath;
}
```

### 4b — CSS

**File:** `components/mentor-resources.module.css`

Follow the exact same style conventions as `mentor-community.module.css`:
- Tab-less layout (no tabs needed — single view)
- `.primaryBtn { background: #111314; color: #ffffff; }` — never `var(--accent)`
- `.deleteBtn` hover → `var(--destructive, #e0245e)`
- `.labelChip { background: var(--surface-hover, #f3f4f6); border-radius: 999px; padding: 0.15rem 0.6rem; font-size: 0.72rem; font-weight: 600; }`
- `.typeBadge` small pill: background matches type (neutral for all three is fine — `var(--surface-hover)`)
- `.statusDot` — 6px circle, green for published (`#22c55e`), grey (`var(--text-muted)`) for draft
- Card grid: `repeat(auto-fill, minmax(260px, 1fr))`, gap `1rem`
- Empty state: centred muted text, `padding: 3rem 0`

### 4c — Page

**File:** `app/dashboard/resources/page.tsx`

Server component. Uses `getMentorWorkspace()`.

```typescript
import { redirect }          from "next/navigation";
import { DashboardShell }    from "@/components/dashboard-shell";
import { MentorResources }   from "@/components/mentor-resources";
import { getMentorWorkspace } from "@/lib/workspace";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function ResourcesPage() {
  const workspace = await getMentorWorkspace();
  if (!workspace) redirect("/login");
  const { supabase, traderId, displayName } = workspace;

  const { data: rows } = await supabase
    .from("resource_items")
    .select("id,title,description,type,storage_path,external_url,thumbnail_path,labels,access_scope,status,created_at")
    .eq("trader_id", traderId)
    .order("sort_order")
    .order("created_at", { ascending: false });

  // Resolve signed read URLs server-side (1-hour expiry)
  const admin = createAdminClient();
  const resources = await Promise.all(
    (rows ?? []).map(async (r) => {
      const mediaUrl = r.storage_path && admin
        ? (await admin.storage.from("academy-media").createSignedUrl(r.storage_path, 3600)).data?.signedUrl ?? null
        : null;
      const thumbnailUrl = r.thumbnail_path && admin
        ? (await admin.storage.from("academy-media").createSignedUrl(r.thumbnail_path, 3600)).data?.signedUrl ?? null
        : null;
      return {
        id:           r.id,
        title:        r.title,
        description:  r.description,
        type:         r.type as "video" | "pdf" | "link",
        storagePath:  r.storage_path,
        externalUrl:  r.external_url,
        mediaUrl,
        thumbnailUrl,
        labels:       r.labels ?? [],
        accessScope:  r.access_scope as "all_students" | "all_verified",
        status:       r.status as "draft" | "published",
        createdAt:    r.created_at,
      };
    }),
  );

  return (
    <DashboardShell
      activePath="/dashboard/resources"
      description="Publish videos, PDFs, and links for your students."
      title="Resources"
      userLabel={displayName}
      traderId={traderId}
    >
      <MentorResources resources={resources} traderId={traderId} />
    </DashboardShell>
  );
}
```

---

## 5 — Student View

### 5a — Component

**File:** `components/resources-view.tsx`

`"use client"` component. Props:

```typescript
interface ResourceItem {
  id:           string;
  title:        string;
  description:  string | null;
  type:         "video" | "pdf" | "link";
  mediaUrl:     string | null;   // signed URL for video/pdf
  externalUrl:  string | null;
  thumbnailUrl: string | null;
  labels:       string[];
  accessScope:  "all_students" | "all_verified";
}

interface Props {
  traderId:   string;
  resources:  ResourceItem[];
  isVerified: boolean;
}
```

**Layout:**
- Label filter bar at the top — collect all unique labels from the resource list; render as clickable chips. Clicking a label toggles it as an active filter. Multiple labels can be active (show items that have ANY active label). A "All" chip clears the filter.
- Filtered resource grid: `repeat(auto-fill, minmax(260px, 1fr))`
- If no resources after filtering: centred empty state "No resources yet."

**Resource card behaviour on click:**
- `type === "video"` → open lightbox (same overlay pattern as `community-view.tsx`) with `<video controls>` using the signed `mediaUrl`
- `type === "pdf"` → open `mediaUrl` in a new tab (`window.open(url, "_blank")`)
- `type === "link"` → open `externalUrl` in a new tab

**Card display:**
- Thumbnail image if available; else a placeholder with the appropriate lucide-react icon (Film / FileText / ExternalLink) centered on `var(--surface-hover)` background
- Title
- Description (truncated to 2 lines with `line-clamp`)
- Label chips (same small pill style)
- Type badge (VIDEO / PDF / LINK)

### 5b — CSS

**File:** `components/resources-view.module.css`

Follow the same black/white/grey theme as `community-view.module.css`:
- No `var(--accent)` usage anywhere
- Active label filter chip: `background: #111314; color: #fff;`
- Inactive label chip: `background: var(--surface-hover, #f3f4f6); color: var(--text-muted);`
- `.typeBadge` neutral pill
- Lightbox overlay identical to `community-view.module.css` lightbox styles

### 5c — Student Portal Page

**File:** `app/student/resources/page.tsx`

Open to all students (any application — no verified gate at page level; RLS filters what each student can see).

```typescript
import { redirect }              from "next/navigation";
import { StudentShell }          from "@/components/student-shell";
import { ResourcesView }         from "@/components/resources-view";
import { createClient }          from "@/lib/supabase/server";
import { createAdminClient }     from "@/lib/supabase/admin";
import { getStudentAcademyContext } from "@/lib/student-routing";

export const dynamic = "force-dynamic";

export default async function StudentResourcesPage({
  searchParams,
}: {
  searchParams?: Promise<{ portal?: string }>;
}) {
  const query   = await searchParams;
  const academy = await getStudentAcademyContext(query?.portal);
  const { basePath: base, querySuffix: suffix } = academy;

  const supabase = await createClient();
  if (!supabase) redirect(`${base}/login${suffix}`);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`${base}/login${suffix}`);

  let appQuery = supabase
    .from("student_applications")
    .select("id,trader_id,status,portal_id,portal:portals!inner(portal_name,slug,logo_path)")
    .eq("student_user_id", user.id);
  if (academy.portalId)   appQuery = appQuery.eq("portal_id", academy.portalId);
  if (academy.portalSlug) appQuery = appQuery.eq("portal.slug", academy.portalSlug);
  const { data: app } = await appQuery.order("submitted_at", { ascending: false }).limit(1).maybeSingle();

  if (!app) redirect(`${base}/join-academy${suffix}`);

  const portal      = Array.isArray(app.portal) ? app.portal[0] : app.portal;
  const academyName = base === "/academy" ? (portal?.portal_name ?? "Academy") : "KaiMentors";
  const displayName = user.email?.split("@")[0] ?? "Student";
  const isVerified  = app.status === "approved";

  // Fetch resources — RLS automatically scopes by access_scope + status
  const { data: rows } = await supabase
    .from("resource_items")
    .select("id,title,description,type,storage_path,external_url,thumbnail_path,labels,access_scope")
    .eq("trader_id", app.trader_id)
    .order("sort_order")
    .order("created_at", { ascending: false });

  const admin = createAdminClient();
  const resources = await Promise.all(
    (rows ?? []).map(async (r) => {
      const mediaUrl = r.storage_path && admin
        ? (await admin.storage.from("academy-media").createSignedUrl(r.storage_path, 3600)).data?.signedUrl ?? null
        : null;
      const thumbnailUrl = r.thumbnail_path && admin
        ? (await admin.storage.from("academy-media").createSignedUrl(r.thumbnail_path, 3600)).data?.signedUrl ?? null
        : null;
      return {
        id:           r.id,
        title:        r.title,
        description:  r.description,
        type:         r.type as "video" | "pdf" | "link",
        mediaUrl,
        thumbnailUrl,
        externalUrl:  r.external_url,
        labels:       r.labels ?? [],
        accessScope:  r.access_scope as "all_students" | "all_verified",
      };
    }),
  );

  return (
    <StudentShell
      academyName={academyName}
      basePath={base}
      displayName={displayName}
      isVerified={isVerified}
      logoPath={portal?.logo_path ?? null}
      querySuffix={suffix}
      traderId={app.trader_id}
    >
      <ResourcesView
        isVerified={isVerified}
        resources={resources}
        traderId={app.trader_id}
      />
    </StudentShell>
  );
}
```

### 5d — Custom Domain Mirror

**File:** `app/academy/resources/page.tsx`

Identical to `app/student/resources/page.tsx`. Copy exactly — do not change any logic. This is the same page served under custom domains.

---

## 6 — Navigation Updates

### Student shell — add Resources nav item

**File:** `components/student-shell-client.tsx`

Add import at top:
```typescript
import { BookOpen } from "lucide-react";
```

Add nav item after Community:
```typescript
{
  href:   `${basePath}/resources${querySuffix}`,
  label:  "Resources",
  icon:   BookOpen,
  locked: false,
},
```

The nav item is `locked: false` because unverified students may still see `all_students`-scoped resources. The page is open to all enrolled students.

---

## 7 — Migration: Apply

After writing the migration file, apply it via the Supabase MCP tool (`apply_migration`) against project `jsbpfhfmumjbrnymhtvq`. Then run:

```bash
git add -A
git commit -m "feat: EP-062 resources library — table, upload API, mentor dashboard, student view"
git push origin main && vercel --prod
```

---

## 8 — Acceptance Criteria

Verify all of the following against KaiTrades. Do not use Traders Confidence or Milkers FX as test fixtures.

- [ ] Mentor can create a resource of each type (video upload, PDF upload, external link)
- [ ] Labels entered as comma-separated text are saved and render as chips on the card
- [ ] "All Students" scope: resource visible to an unverified KaiTrades student
- [ ] "Verified Only" scope: resource NOT visible to an unverified student; visible to a verified student
- [ ] Draft resources are not visible to any student
- [ ] Mentor can delete a resource; it disappears immediately (optimistic)
- [ ] Student label filter: clicking a label chip filters the grid; clicking "All" resets it
- [ ] Video resource: clicking the card opens a lightbox with a working video player
- [ ] PDF resource: clicking the card opens the signed URL in a new tab
- [ ] Link resource: clicking the card opens the external URL in a new tab
- [ ] `/academy/resources` custom domain page works identically to `/student/resources`
- [ ] "Resources" nav item appears in the student portal sidebar
- [ ] `/dashboard/resources` mentor page is no longer a dead link
