# EP-061 — Mentor community management: Gallery + Trade Board

Mentor-facing UI to create gallery albums, upload media, post trades, and delete content.
Depends on EP-059 (schema + upload API) and EP-060 (like API, shared types).

---

## New files

```
app/dashboard/community/page.tsx
components/mentor-community.tsx
components/mentor-community.module.css
app/api/community/albums/route.ts
app/api/community/items/route.ts
app/api/community/trade-posts/route.ts
```

---

## Step 1 — New API: `app/api/community/albums/route.ts`

Create and delete gallery albums.

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getMentorWorkspace } from "@/lib/workspace";

const createSchema = z.object({
  title:       z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  const workspace = await getMentorWorkspace();
  if (!workspace) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { supabase, traderId, user } = workspace;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { data, error } = await supabase.from("gallery_albums").insert({
    trader_id:   traderId,
    title:       parsed.data.title,
    description: parsed.data.description ?? null,
    created_by:  user.id,
  }).select("id").single();

  if (error) return NextResponse.json({ error: "Could not create album." }, { status: 500 });
  return NextResponse.json({ albumId: data.id }, { status: 201 });
}

export async function DELETE(request: Request) {
  const workspace = await getMentorWorkspace();
  if (!workspace) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { supabase, traderId } = workspace;

  const { id } = await request.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await supabase.from("gallery_albums")
    .delete()
    .eq("id", id)
    .eq("trader_id", traderId);

  return NextResponse.json({ ok: true });
}
```

---

## Step 2 — New API: `app/api/community/items/route.ts`

Create and delete gallery items (photos, video uploads, video links).

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getMentorWorkspace } from "@/lib/workspace";

const createSchema = z.discriminatedUnion("type", [
  z.object({
    type:      z.literal("photo"),
    albumId:   z.string().uuid(),
    filePath:  z.string().min(1),
    caption:   z.string().max(300).optional(),
  }),
  z.object({
    type:      z.literal("video_upload"),
    albumId:   z.string().uuid(),
    filePath:  z.string().min(1),
    caption:   z.string().max(300).optional(),
  }),
  z.object({
    type:      z.literal("video_link"),
    albumId:   z.string().uuid(),
    videoUrl:  z.string().url().max(500),
    caption:   z.string().max(300).optional(),
  }),
]);

export async function POST(request: Request) {
  const workspace = await getMentorWorkspace();
  if (!workspace) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { supabase, traderId, user } = workspace;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const d = parsed.data;
  const { data, error } = await supabase.from("gallery_items").insert({
    trader_id:  traderId,
    album_id:   d.albumId,
    type:       d.type,
    file_path:  d.type !== "video_link" ? d.filePath : null,
    video_url:  d.type === "video_link"  ? d.videoUrl : null,
    caption:    d.caption ?? null,
    created_by: user.id,
  }).select("id").single();

  if (error) return NextResponse.json({ error: "Could not save item." }, { status: 500 });
  return NextResponse.json({ itemId: data.id }, { status: 201 });
}

export async function DELETE(request: Request) {
  const workspace = await getMentorWorkspace();
  if (!workspace) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { supabase, traderId } = workspace;

  const { id } = await request.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await supabase.from("gallery_items")
    .delete()
    .eq("id", id)
    .eq("trader_id", traderId);

  return NextResponse.json({ ok: true });
}
```

---

## Step 3 — New API: `app/api/community/trade-posts/route.ts`

Create and delete trade posts.

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getMentorWorkspace } from "@/lib/workspace";

const createSchema = z.object({
  body:      z.string().trim().min(1).max(2000),
  imagePath: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const workspace = await getMentorWorkspace();
  if (!workspace) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { supabase, traderId, user } = workspace;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { data, error } = await supabase.from("trade_posts").insert({
    trader_id:  traderId,
    body:       parsed.data.body,
    image_path: parsed.data.imagePath ?? null,
    created_by: user.id,
  }).select("id").single();

  if (error) return NextResponse.json({ error: "Could not save post." }, { status: 500 });
  return NextResponse.json({ postId: data.id }, { status: 201 });
}

export async function DELETE(request: Request) {
  const workspace = await getMentorWorkspace();
  if (!workspace) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { supabase, traderId } = workspace;

  const { id } = await request.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await supabase.from("trade_posts")
    .delete()
    .eq("id", id)
    .eq("trader_id", traderId);

  return NextResponse.json({ ok: true });
}
```

---

## Step 4 — New component: `components/mentor-community.tsx`

Client component. Two tabs — Gallery management and Trade Board. Handles file upload
(via EP-059's `/api/community/upload` endpoint) and form submissions.

```tsx
"use client";

import Image from "next/image";
import { type FormEvent, useRef, useState } from "react";
import { ImageIcon, Loader2, Plus, Sparkles, Trash2, TrendingUp, UploadCloud } from "lucide-react";
import styles from "./mentor-community.module.css";

/* ── Types ──────────────────────────────────────────────────────────────── */

interface Album {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  itemCount: number;
}

interface GalleryItem {
  id: string;
  type: "photo" | "video_upload" | "video_link";
  mediaUrl: string | null;
  videoUrl: string | null;
  caption: string | null;
}

interface TradePost {
  id: string;
  body: string;
  imageUrl: string | null;
  createdAt: string;
}

interface MentorCommunityProps {
  albums: Album[];
  tradePosts: TradePost[];
  itemsByAlbum: Record<string, GalleryItem[]>;
}

/* ── Upload helper ──────────────────────────────────────────────────────── */

async function uploadFile(file: File, category: "gallery" | "trades"): Promise<string> {
  const res = await fetch("/api/community/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fileName: file.name, contentType: file.type, category }),
  });
  if (!res.ok) throw new Error("Upload URL failed");
  const { signedUrl, storagePath } = await res.json();
  const upload = await fetch(signedUrl, { method: "PUT", body: file });
  if (!upload.ok) throw new Error("Upload failed");
  return storagePath as string;
}

/* ── Component ──────────────────────────────────────────────────────────── */

export function MentorCommunity({ albums: initialAlbums, tradePosts: initialPosts, itemsByAlbum: initialItems }: MentorCommunityProps) {
  const [tab, setTab] = useState<"gallery" | "trades">("gallery");
  const [albums, setAlbums] = useState(initialAlbums);
  const [itemsByAlbum, setItemsByAlbum] = useState(initialItems);
  const [posts, setPosts] = useState(initialPosts);
  const [activeAlbum, setActiveAlbum] = useState<string | null>(null);
  const [showNewAlbum, setShowNewAlbum] = useState(false);
  const [showNewItem, setShowNewItem] = useState(false);
  const [showNewPost, setShowNewPost] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const postFileRef = useRef<HTMLInputElement>(null);

  /* Create album */
  async function createAlbum(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError("");
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/community/albums", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: fd.get("title"), description: fd.get("description") || undefined }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setError(json.error ?? "Failed"); return; }
    setAlbums((prev) => [...prev, { id: json.albumId, title: String(fd.get("title")), description: String(fd.get("description") || ""), coverUrl: null, itemCount: 0 }]);
    setItemsByAlbum((prev) => ({ ...prev, [json.albumId]: [] }));
    setShowNewAlbum(false);
  }

  /* Delete album */
  async function deleteAlbum(id: string) {
    if (!confirm("Delete this album and all its items?")) return;
    await fetch("/api/community/albums", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    setAlbums((prev) => prev.filter((a) => a.id !== id));
    if (activeAlbum === id) setActiveAlbum(null);
  }

  /* Add item to album */
  async function addItem(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!activeAlbum) return;
    setBusy(true); setError("");
    const fd = new FormData(e.currentTarget);
    const itemType = String(fd.get("itemType"));
    let payload: Record<string, unknown> = { albumId: activeAlbum, type: itemType, caption: fd.get("caption") || undefined };

    if (itemType === "video_link") {
      payload.videoUrl = fd.get("videoUrl");
    } else {
      const file = fileRef.current?.files?.[0];
      if (!file) { setError("Please select a file."); setBusy(false); return; }
      try {
        payload.filePath = await uploadFile(file, "gallery");
      } catch {
        setError("Upload failed. Try again."); setBusy(false); return;
      }
    }

    const res = await fetch("/api/community/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setError(json.error ?? "Failed"); return; }
    const newItem: GalleryItem = {
      id: json.itemId,
      type: itemType as GalleryItem["type"],
      mediaUrl: null, // will show on refresh — signed URL not available client-side
      videoUrl: itemType === "video_link" ? String(fd.get("videoUrl")) : null,
      caption: String(fd.get("caption") || ""),
    };
    setItemsByAlbum((prev) => ({ ...prev, [activeAlbum]: [...(prev[activeAlbum] ?? []), newItem] }));
    setAlbums((prev) => prev.map((a) => a.id === activeAlbum ? { ...a, itemCount: a.itemCount + 1 } : a));
    setShowNewItem(false);
    e.currentTarget.reset();
  }

  /* Delete item */
  async function deleteItem(itemId: string, albumId: string) {
    await fetch("/api/community/items", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: itemId }) });
    setItemsByAlbum((prev) => ({ ...prev, [albumId]: (prev[albumId] ?? []).filter((i) => i.id !== itemId) }));
    setAlbums((prev) => prev.map((a) => a.id === albumId ? { ...a, itemCount: Math.max(0, a.itemCount - 1) } : a));
  }

  /* Create trade post */
  async function createPost(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError("");
    const fd = new FormData(e.currentTarget);
    let imagePath: string | undefined;
    const file = postFileRef.current?.files?.[0];
    if (file) {
      try { imagePath = await uploadFile(file, "trades"); }
      catch { setError("Image upload failed."); setBusy(false); return; }
    }
    const res = await fetch("/api/community/trade-posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: fd.get("body"), imagePath }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setError(json.error ?? "Failed"); return; }
    setPosts((prev) => [{ id: json.postId, body: String(fd.get("body")), imageUrl: null, createdAt: new Date().toISOString() }, ...prev]);
    setShowNewPost(false);
    e.currentTarget.reset();
  }

  /* Delete trade post */
  async function deletePost(id: string) {
    await fetch("/api/community/trade-posts", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }

  const activeAlbumData = albums.find((a) => a.id === activeAlbum);
  const activeItems = activeAlbum ? (itemsByAlbum[activeAlbum] ?? []) : [];

  return (
    <div className={styles.wrapper}>
      {/* Tabs */}
      <div className={styles.tabs}>
        <button className={`${styles.tab} ${tab === "gallery" ? styles.tabActive : ""}`} onClick={() => setTab("gallery")} type="button">
          <ImageIcon size={15} /> Gallery
        </button>
        <button className={`${styles.tab} ${tab === "trades" ? styles.tabActive : ""}`} onClick={() => setTab("trades")} type="button">
          <TrendingUp size={15} /> Trade Board
        </button>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {/* ── Gallery tab ── */}
      {tab === "gallery" ? (
        !activeAlbum ? (
          <div>
            <div className={styles.actionRow}>
              <h2 className={styles.sectionTitle}>Albums</h2>
              <button className={styles.primaryBtn} onClick={() => setShowNewAlbum(true)} type="button">
                <Plus size={15} /> New album
              </button>
            </div>

            {/* New album form */}
            {showNewAlbum ? (
              <form className={styles.form} onSubmit={createAlbum}>
                <label>Album title <input maxLength={120} name="title" placeholder="Cape Town Seminar — June 2025" required /></label>
                <label>Description (optional) <textarea maxLength={500} name="description" placeholder="What was this event about?" rows={2} /></label>
                <div className={styles.formActions}>
                  <button className={styles.cancelBtn} onClick={() => setShowNewAlbum(false)} type="button">Cancel</button>
                  <button className={styles.primaryBtn} disabled={busy} type="submit">
                    {busy ? <Loader2 className={styles.spin} size={14} /> : null} Create album
                  </button>
                </div>
              </form>
            ) : null}

            {/* Album list */}
            {albums.length === 0 ? (
              <p className={styles.empty}>No albums yet. Create one to start uploading.</p>
            ) : (
              <div className={styles.albumGrid}>
                {albums.map((album) => (
                  <div className={styles.albumCard} key={album.id}>
                    <button className={styles.albumCoverBtn} onClick={() => setActiveAlbum(album.id)} type="button">
                      <div className={styles.albumCover}>
                        {album.coverUrl ? (
                          <Image alt="" fill sizes="200px" src={album.coverUrl} unoptimized />
                        ) : (
                          <ImageIcon size={26} />
                        )}
                      </div>
                      <p className={styles.albumTitle}>{album.title}</p>
                      <p className={styles.albumMeta}>{album.itemCount} item{album.itemCount !== 1 ? "s" : ""}</p>
                    </button>
                    <button aria-label="Delete album" className={styles.deleteBtn} onClick={() => void deleteAlbum(album.id)} type="button">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className={styles.actionRow}>
              <div>
                <button className={styles.backBtn} onClick={() => setActiveAlbum(null)} type="button">← Albums</button>
                <h2 className={styles.sectionTitle}>{activeAlbumData?.title}</h2>
              </div>
              <button className={styles.primaryBtn} onClick={() => setShowNewItem(true)} type="button">
                <Plus size={15} /> Add media
              </button>
            </div>

            {/* New item form */}
            {showNewItem ? (
              <form className={styles.form} onSubmit={addItem}>
                <label>
                  Type
                  <select name="itemType">
                    <option value="photo">Photo (upload)</option>
                    <option value="video_upload">Video (upload)</option>
                    <option value="video_link">Video (YouTube / Vimeo link)</option>
                  </select>
                </label>
                <label>
                  File
                  <input accept="image/*,video/*" ref={fileRef} type="file" />
                  <small>For video links, paste the URL below instead.</small>
                </label>
                <label>Video URL (for link type only) <input name="videoUrl" placeholder="https://youtube.com/watch?v=..." type="url" /></label>
                <label>Caption (optional) <input maxLength={300} name="caption" /></label>
                <div className={styles.formActions}>
                  <button className={styles.cancelBtn} onClick={() => setShowNewItem(false)} type="button">Cancel</button>
                  <button className={styles.primaryBtn} disabled={busy} type="submit">
                    {busy ? <Loader2 className={styles.spin} size={14} /> : <UploadCloud size={14} />}
                    {busy ? "Uploading…" : "Add"}
                  </button>
                </div>
              </form>
            ) : null}

            {/* Item grid */}
            {activeItems.length === 0 ? (
              <p className={styles.empty}>No items yet. Add a photo or video.</p>
            ) : (
              <div className={styles.itemGrid}>
                {activeItems.map((item) => (
                  <div className={styles.itemCard} key={item.id}>
                    <div className={styles.itemThumb}>
                      {item.mediaUrl ? (
                        item.type === "photo" ? (
                          <Image alt="" fill sizes="200px" src={item.mediaUrl} unoptimized />
                        ) : (
                          <video muted playsInline src={item.mediaUrl} />
                        )
                      ) : item.type === "video_link" ? (
                        <div className={styles.videoLinkBadge}>▶ Link</div>
                      ) : (
                        <div className={styles.videoLinkBadge}>✓ Uploaded</div>
                      )}
                    </div>
                    {item.caption ? <p className={styles.itemCaption}>{item.caption}</p> : null}
                    <button aria-label="Delete item" className={styles.deleteBtn} onClick={() => void deleteItem(item.id, activeAlbum)} type="button">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      ) : null}

      {/* ── Trade Board tab ── */}
      {tab === "trades" ? (
        <div>
          <div className={styles.actionRow}>
            <h2 className={styles.sectionTitle}>Trade posts</h2>
            <button className={styles.primaryBtn} onClick={() => setShowNewPost(true)} type="button">
              <Plus size={15} /> Post a trade
            </button>
          </div>

          {showNewPost ? (
            <form className={styles.form} onSubmit={createPost}>
              <label>
                Trade write-up
                <textarea maxLength={2000} name="body" placeholder="GBPUSD — took a long at 1.2740 targeting 1.2820..." required rows={4} />
              </label>
              <label>
                Screenshot (optional)
                <input accept="image/*" ref={postFileRef} type="file" />
              </label>
              <div className={styles.formActions}>
                <button className={styles.cancelBtn} onClick={() => setShowNewPost(false)} type="button">Cancel</button>
                <button className={styles.primaryBtn} disabled={busy} type="submit">
                  {busy ? <Loader2 className={styles.spin} size={14} /> : <Sparkles size={14} />}
                  {busy ? "Posting…" : "Post trade"}
                </button>
              </div>
            </form>
          ) : null}

          {posts.length === 0 ? (
            <p className={styles.empty}>No trade posts yet.</p>
          ) : (
            <div className={styles.postList}>
              {posts.map((post) => (
                <div className={styles.postCard} key={post.id}>
                  {post.imageUrl ? (
                    <div className={styles.postImage}>
                      <Image alt="" fill sizes="600px" src={post.imageUrl} unoptimized />
                    </div>
                  ) : null}
                  <div className={styles.postBody}>
                    <p className={styles.postText}>{post.body}</p>
                    <div className={styles.postFooter}>
                      <span className={styles.postMeta}>
                        {new Date(post.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                      </span>
                      <button aria-label="Delete post" className={styles.deleteBtn} onClick={() => void deletePost(post.id)} type="button">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
```

---

## Step 5 — New CSS: `components/mentor-community.module.css`

```css
.wrapper { width: 100%; }

.tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid var(--border);
}
.tab {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 1.1rem;
  border: none;
  background: none;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
}
.tabActive { color: var(--text-primary); border-bottom-color: var(--accent); }

.actionRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
}
.sectionTitle { margin: 0; font-size: 1.1rem; font-weight: 800; letter-spacing: -0.03em; }
.backBtn {
  display: block;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--accent);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  margin-bottom: 0.25rem;
}

.primaryBtn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 1rem;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-foreground, #fff);
  font-size: 0.82rem;
  font-weight: 700;
  border: none;
  cursor: pointer;
}
.primaryBtn:disabled { opacity: 0.6; cursor: not-allowed; }
.cancelBtn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.5rem 1rem;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  color: var(--text-muted);
}
.deleteBtn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  padding: 0.3rem;
  border-radius: 6px;
}
.deleteBtn:hover { color: var(--destructive, #e0245e); background: var(--surface-hover, #f3f4f6); }

.form {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 0.75rem);
  padding: 1.25rem;
  margin-bottom: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}
.form label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-primary);
}
.form input,
.form textarea,
.form select {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.5rem 0.75rem;
  font-size: 0.88rem;
  color: var(--text-primary);
  background: var(--background, #fff);
  outline: none;
}
.form input[type="file"] {
  padding: 0.35rem 0;
  border: none;
  background: none;
}
.form small { color: var(--text-muted); font-size: 0.75rem; font-weight: 400; }
.formActions { display: flex; gap: 0.5rem; justify-content: flex-end; }

.albumGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1rem;
}
.albumCard { position: relative; }
.albumCard .deleteBtn { position: absolute; top: 0.5rem; right: 0.5rem; background: rgba(255,255,255,0.85); }
.albumCoverBtn {
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 0.75rem);
  cursor: pointer;
  overflow: hidden;
  text-align: left;
  padding: 0;
}
.albumCover {
  position: relative;
  width: 100%;
  aspect-ratio: 4/3;
  background: var(--surface-hover, #f3f4f6);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}
.albumCover img { object-fit: cover; }
.albumTitle { font-size: 0.85rem; font-weight: 700; padding: 0.6rem 0.75rem 0.2rem; margin: 0; }
.albumMeta { font-size: 0.75rem; color: var(--text-muted); padding: 0 0.75rem 0.6rem; margin: 0; }

.itemGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1rem;
}
.itemCard {
  position: relative;
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 0.75rem);
  overflow: hidden;
  background: var(--surface);
}
.itemCard .deleteBtn { position: absolute; top: 0.4rem; right: 0.4rem; background: rgba(255,255,255,0.85); }
.itemThumb {
  position: relative;
  width: 100%;
  aspect-ratio: 4/3;
  background: var(--surface-hover, #f3f4f6);
  display: flex;
  align-items: center;
  justify-content: center;
}
.itemThumb img, .itemThumb video { object-fit: cover; width: 100%; height: 100%; }
.videoLinkBadge { font-size: 0.8rem; font-weight: 700; color: var(--text-muted); }
.itemCaption { font-size: 0.75rem; color: var(--text-muted); padding: 0.4rem 0.6rem; margin: 0; }

.postList { display: flex; flex-direction: column; gap: 1rem; }
.postCard {
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 0.75rem);
  overflow: hidden;
  background: var(--surface);
}
.postImage { position: relative; width: 100%; aspect-ratio: 16/9; }
.postImage img { object-fit: cover; }
.postBody { padding: 1rem 1.25rem; }
.postText { font-size: 0.9rem; line-height: 1.65; white-space: pre-wrap; margin: 0 0 0.75rem; }
.postFooter { display: flex; align-items: center; justify-content: space-between; }
.postMeta { font-size: 0.75rem; color: var(--text-muted); }

.error { color: var(--destructive, #c0392b); font-size: 0.82rem; margin-bottom: 0.75rem; }
.empty { color: var(--text-muted); font-size: 0.88rem; padding: 2rem 0; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
```

---

## Step 6 — New page: `app/dashboard/community/page.tsx`

```tsx
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardShell } from "@/components/dashboard-shell";
import { MentorCommunity } from "@/components/mentor-community";
import { getMentorWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function DashboardCommunityPage() {
  const workspace = await getMentorWorkspace();
  if (!workspace) redirect("/login");
  const { supabase, traderId, displayName } = workspace;

  const [albumsResult, itemsResult, postsResult] = await Promise.all([
    supabase
      .from("gallery_albums")
      .select("id,title,description,cover_path")
      .eq("trader_id", traderId)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("gallery_items")
      .select("id,album_id,type,file_path,video_url,caption")
      .eq("trader_id", traderId)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("trade_posts")
      .select("id,body,image_path,created_at")
      .eq("trader_id", traderId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const admin = createAdminClient();
  async function signedUrl(path: string | null): Promise<string | null> {
    if (!path || !admin) return null;
    const { data } = await admin.storage.from("academy-media").createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  }

  const rawAlbums = albumsResult.data ?? [];
  const rawItems = itemsResult.data ?? [];
  const rawPosts = postsResult.data ?? [];

  const itemCountByAlbum: Record<string, number> = {};
  for (const item of rawItems) {
    itemCountByAlbum[item.album_id] = (itemCountByAlbum[item.album_id] ?? 0) + 1;
  }

  const albums = await Promise.all(
    rawAlbums.map(async (a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      coverUrl: await signedUrl(a.cover_path),
      itemCount: itemCountByAlbum[a.id] ?? 0,
    })),
  );

  const itemsByAlbum: Record<string, Array<{ id: string; type: string; mediaUrl: string | null; videoUrl: string | null; caption: string | null }>> = {};
  for (const item of rawItems) {
    const mediaUrl = item.file_path ? await signedUrl(item.file_path) : null;
    if (!itemsByAlbum[item.album_id]) itemsByAlbum[item.album_id] = [];
    itemsByAlbum[item.album_id].push({
      id: item.id,
      type: item.type,
      mediaUrl,
      videoUrl: item.video_url,
      caption: item.caption,
    });
  }

  const tradePosts = await Promise.all(
    rawPosts.map(async (post) => ({
      id: post.id,
      body: post.body,
      imageUrl: post.image_path ? await signedUrl(post.image_path) : null,
      createdAt: post.created_at,
    })),
  );

  return (
    <DashboardShell
      activePath="/dashboard/community"
      description="Upload gallery albums and post your daily trades."
      title="Community"
      traderId={traderId}
      userLabel={displayName}
    >
      <MentorCommunity
        albums={albums}
        itemsByAlbum={itemsByAlbum}
        tradePosts={tradePosts}
      />
    </DashboardShell>
  );
}
```

---

## Step 7 — Edit: `components/dashboard-shell.tsx`

Add "Community" to the mentor navigation list. Follow the existing pattern for adding
a nav item with an icon.

Add `Sparkles` to the lucide-react import. Add the route to the `navigation` array:

```ts
["/dashboard/community", "Community", Sparkles],
```

Place it after "Messages" or wherever fits naturally in the nav order.

---

## Acceptance criteria

- [ ] Mentor can create a gallery album with title and optional description
- [ ] Mentor can upload photos (JPG/PNG/WebP) into an album — file goes to `academy-media`
  bucket; item record saved to `gallery_items`
- [ ] Mentor can upload a short video (MP4/WebM) into an album
- [ ] Mentor can add a YouTube or Vimeo link with caption — no file upload required
- [ ] Mentor can delete any album (confirms before delete; cascades to items)
- [ ] Mentor can delete any individual gallery item
- [ ] Mentor can post a trade: text body (required) + optional screenshot
- [ ] Mentor can delete any trade post
- [ ] Upload progress/spinner shows while file is transferring
- [ ] Errors (upload failure, network error) surface inline without crashing
- [ ] "Community" appears in the mentor dashboard nav sidebar
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] Deploy with `vercel --prod`

## Implementation order

1. Create `app/api/community/albums/route.ts`
2. Create `app/api/community/items/route.ts`
3. Create `app/api/community/trade-posts/route.ts`
4. Create `components/mentor-community.tsx` + `mentor-community.module.css`
5. Create `app/dashboard/community/page.tsx`
6. Edit `components/dashboard-shell.tsx` — add Community nav item
7. Build, commit, deploy
