# EP-059 — Community: schema, storage, and upload API

Foundational work for the Gallery + Trade Board community feature.
No UI in this EP — schema, storage bucket, RLS, and the upload URL endpoint only.

---

## Step 1 — Create storage bucket (Supabase dashboard)

Supabase Storage buckets cannot be created via SQL migration.
Create this bucket manually in the Supabase dashboard → Storage → New bucket:

| Setting | Value |
|---------|-------|
| Name | `academy-media` |
| Public | **No** (private — all access via signed URLs) |
| File size limit | 200 MB |
| Allowed MIME types | `image/jpeg, image/png, image/webp, image/gif, video/mp4, video/webm, video/quicktime` |

---

## Step 2 — Migration: `202607020036_community_schema.sql`

```sql
-- EP-059: Community feature — gallery albums, gallery items, trade posts, likes

-- ─── Enum ────────────────────────────────────────────────────────────────────

CREATE TYPE gallery_item_type AS ENUM ('photo', 'video_upload', 'video_link');

-- ─── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE public.gallery_albums (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id   uuid        NOT NULL REFERENCES public.traders(id) ON DELETE CASCADE,
  title       text        NOT NULL CHECK (char_length(title) BETWEEN 2 AND 120),
  description text        CHECK (char_length(description) <= 500),
  cover_path  text,
  sort_order  int         NOT NULL DEFAULT 0,
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.gallery_items (
  id          uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id   uuid               NOT NULL REFERENCES public.traders(id) ON DELETE CASCADE,
  album_id    uuid               NOT NULL REFERENCES public.gallery_albums(id) ON DELETE CASCADE,
  type        gallery_item_type  NOT NULL,
  file_path   text,
  video_url   text               CHECK (char_length(video_url) <= 500),
  caption     text               CHECK (char_length(caption) <= 300),
  sort_order  int                NOT NULL DEFAULT 0,
  created_by  uuid               REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz        NOT NULL DEFAULT now(),
  CONSTRAINT valid_media CHECK (
    (type = 'video_link'   AND video_url IS NOT NULL AND file_path IS NULL) OR
    (type IN ('photo', 'video_upload') AND file_path IS NOT NULL AND video_url IS NULL)
  )
);

CREATE TABLE public.trade_posts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id   uuid        NOT NULL REFERENCES public.traders(id) ON DELETE CASCADE,
  body        text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  image_path  text,
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.community_likes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trader_id   uuid        NOT NULL REFERENCES public.traders(id) ON DELETE CASCADE,
  target_type text        NOT NULL CHECK (target_type IN ('gallery_item', 'trade_post')),
  target_id   uuid        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_type, target_id)
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX gallery_albums_trader_id     ON public.gallery_albums(trader_id, sort_order);
CREATE INDEX gallery_items_album_id       ON public.gallery_items(album_id, sort_order);
CREATE INDEX gallery_items_trader_id      ON public.gallery_items(trader_id);
CREATE INDEX trade_posts_trader_id        ON public.trade_posts(trader_id, created_at DESC);
CREATE INDEX community_likes_target       ON public.community_likes(target_type, target_id);
CREATE INDEX community_likes_user         ON public.community_likes(user_id, trader_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.gallery_albums   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_posts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_likes  ENABLE ROW LEVEL SECURITY;

-- gallery_albums ──────────────────────────────────────────────────────────────

-- Mentors manage all album operations.
CREATE POLICY "mentors manage gallery albums"
  ON public.gallery_albums FOR ALL
  USING (is_trader_member(trader_id) OR is_super_admin());

-- Any student with an application (any status, including unverified) can view.
CREATE POLICY "academy members view gallery albums"
  ON public.gallery_albums FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.student_applications sa
      WHERE sa.student_user_id = auth.uid()
        AND sa.trader_id = gallery_albums.trader_id
    )
  );

-- gallery_items ───────────────────────────────────────────────────────────────

CREATE POLICY "mentors manage gallery items"
  ON public.gallery_items FOR ALL
  USING (is_trader_member(trader_id) OR is_super_admin());

CREATE POLICY "academy members view gallery items"
  ON public.gallery_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.student_applications sa
      WHERE sa.student_user_id = auth.uid()
        AND sa.trader_id = gallery_items.trader_id
    )
  );

-- trade_posts ─────────────────────────────────────────────────────────────────

CREATE POLICY "mentors manage trade posts"
  ON public.trade_posts FOR ALL
  USING (is_trader_member(trader_id) OR is_super_admin());

CREATE POLICY "academy members view trade posts"
  ON public.trade_posts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.student_applications sa
      WHERE sa.student_user_id = auth.uid()
        AND sa.trader_id = trade_posts.trader_id
    )
  );

-- community_likes ─────────────────────────────────────────────────────────────

-- Anyone in the academy (any status) can see and manage their own likes.
CREATE POLICY "academy members manage own likes"
  ON public.community_likes FOR ALL
  USING (
    user_id = auth.uid()
    AND (
      is_trader_member(trader_id)
      OR EXISTS (
        SELECT 1 FROM public.student_applications sa
        WHERE sa.student_user_id = auth.uid()
          AND sa.trader_id = community_likes.trader_id
      )
    )
  );

-- Mentors can see all likes in their workspace (for like counts on their content).
CREATE POLICY "mentors view workspace likes"
  ON public.community_likes FOR SELECT
  USING (is_trader_member(trader_id) OR is_super_admin());
```

---

## Step 3 — Storage RLS policies (Supabase dashboard → Storage → Policies)

After creating the `academy-media` bucket, add these policies in the dashboard
(Storage → academy-media → Policies tab):

### SELECT (download)
**Policy name:** `Academy members can download media`
```sql
(
  -- Mentor of the workspace (path prefix = trader_id)
  EXISTS (
    SELECT 1 FROM public.trader_members tm
    JOIN public.traders t ON t.id = tm.trader_id
    WHERE tm.user_id = auth.uid()
      AND t.id::text = split_part(name, '/', 1)
  )
)
OR
(
  -- Any student with an application for this workspace
  EXISTS (
    SELECT 1 FROM public.student_applications sa
    JOIN public.traders t ON t.id = sa.trader_id
    WHERE sa.student_user_id = auth.uid()
      AND t.id::text = split_part(name, '/', 1)
  )
)
```

### INSERT (upload)
**Policy name:** `Mentors can upload media`
```sql
EXISTS (
  SELECT 1 FROM public.trader_members tm
  JOIN public.traders t ON t.id = tm.trader_id
  WHERE tm.user_id = auth.uid()
    AND t.id::text = split_part(name, '/', 1)
)
```

### DELETE
**Policy name:** `Mentors can delete media`
```sql
EXISTS (
  SELECT 1 FROM public.trader_members tm
  JOIN public.traders t ON t.id = tm.trader_id
  WHERE tm.user_id = auth.uid()
    AND t.id::text = split_part(name, '/', 1)
)
```

File paths in `academy-media` follow the pattern:
`{trader_id}/{category}/{uuid}.{ext}`
where `category` is `gallery` or `trades`.

---

## Step 4 — New API: `app/api/community/upload/route.ts`

Server-side signed upload URL. Validates that the caller is a mentor, then issues a
signed URL so the client can upload directly to Supabase Storage without proxying the
file through Next.js.

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMentorWorkspace } from "@/lib/workspace";

const schema = z.object({
  fileName:    z.string().min(1).max(200),
  contentType: z.enum([
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "video/mp4", "video/webm", "video/quicktime",
  ]),
  category: z.enum(["gallery", "trades"]),
});

export async function POST(request: Request) {
  const workspace = await getMentorWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }

  const { fileName, contentType, category } = parsed.data;
  const ext = fileName.split(".").pop() ?? "bin";
  const uuid = crypto.randomUUID();
  const storagePath = `${workspace.traderId}/${category}/${uuid}.${ext}`;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Storage not configured." }, { status: 503 });
  }

  const { data, error } = await admin.storage
    .from("academy-media")
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    return NextResponse.json({ error: "Could not create upload URL." }, { status: 500 });
  }

  return NextResponse.json({
    signedUrl:   data.signedUrl,
    storagePath,
    token:       data.token,
  });
}
```

**How the client uses this:**
```ts
// 1. Get signed upload URL from the API
const { signedUrl, storagePath } = await fetch("/api/community/upload", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    fileName:    file.name,
    contentType: file.type,
    category:    "gallery", // or "trades"
  }),
}).then((r) => r.json());

// 2. Upload directly to Supabase Storage
await fetch(signedUrl, { method: "PUT", body: file });

// 3. Use storagePath when creating the gallery_item or trade_post record
```

---

## Step 5 — New API: `app/api/community/signed-url/route.ts`

Generates read signed URLs for displaying stored media (photos, videos).
Used by both the student view and mentor management pages.

```ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });

  // Caller must be authenticated — RLS is enforced at the Storage policy level.
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Storage not configured." }, { status: 503 });

  const { data, error } = await admin.storage
    .from("academy-media")
    .createSignedUrl(path, 3600); // 1-hour expiry

  if (error || !data) {
    return NextResponse.json({ error: "Could not generate URL." }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}
```

---

## Acceptance criteria

- [ ] `gallery_albums`, `gallery_items`, `trade_posts`, `community_likes` tables exist in the
  "Forex" Supabase project with all columns, constraints, and indexes
- [ ] `gallery_item_type` enum exists with values `photo`, `video_upload`, `video_link`
- [ ] `academy-media` bucket exists, private, 200 MB file size limit
- [ ] Storage policies restrict download to academy members, upload/delete to mentors
- [ ] `POST /api/community/upload` returns a signed upload URL for a mentor; returns 401 for
  non-mentors and students
- [ ] `GET /api/community/signed-url?path=...` returns a 1-hour signed read URL for
  authenticated users
- [ ] RLS: unverified students can SELECT from all three content tables; cannot INSERT,
  UPDATE, or DELETE
- [ ] RLS: mentor members can INSERT, UPDATE, DELETE all three content tables for their
  workspace
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] No deploy needed for this EP (schema-only + two API routes — deploy together with EP-060)

## Implementation order

1. Create `academy-media` storage bucket in Supabase dashboard
2. Apply migration `202607020036_community_schema.sql`
3. Set Storage RLS policies in Supabase dashboard
4. Create `app/api/community/upload/route.ts`
5. Create `app/api/community/signed-url/route.ts`
6. Verify: test upload URL generation as mentor; verify 401 as student
