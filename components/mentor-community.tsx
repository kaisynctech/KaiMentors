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
  const { signedUrl, storagePath } = (await res.json()) as { signedUrl: string; storagePath: string };
  const upload = await fetch(signedUrl, { method: "PUT", body: file });
  if (!upload.ok) throw new Error("Upload failed");
  return storagePath;
}

/* ── Component ──────────────────────────────────────────────────────────── */

export function MentorCommunity({
  albums: initialAlbums,
  tradePosts: initialPosts,
  itemsByAlbum: initialItems,
}: MentorCommunityProps) {
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
      body: JSON.stringify({
        title: fd.get("title"),
        description: fd.get("description") || undefined,
      }),
    });
    const json = (await res.json()) as { albumId?: string; error?: string };
    setBusy(false);
    if (!res.ok) { setError(json.error ?? "Failed"); return; }
    setAlbums((prev) => [
      ...prev,
      {
        id: json.albumId!,
        title: String(fd.get("title")),
        description: String(fd.get("description") || ""),
        coverUrl: null,
        itemCount: 0,
      },
    ]);
    setItemsByAlbum((prev) => ({ ...prev, [json.albumId!]: [] }));
    setShowNewAlbum(false);
    (e.target as HTMLFormElement).reset();
  }

  /* Delete album */
  async function deleteAlbum(id: string) {
    if (!confirm("Delete this album and all its items?")) return;
    await fetch("/api/community/albums", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
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
    const payload: Record<string, unknown> = {
      albumId: activeAlbum,
      type: itemType,
      caption: fd.get("caption") || undefined,
    };

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
    const json = (await res.json()) as { itemId?: string; error?: string };
    setBusy(false);
    if (!res.ok) { setError(json.error ?? "Failed"); return; }

    const newItem: GalleryItem = {
      id: json.itemId!,
      type: itemType as GalleryItem["type"],
      mediaUrl: null,
      videoUrl: itemType === "video_link" ? String(fd.get("videoUrl")) : null,
      caption: String(fd.get("caption") || ""),
    };
    setItemsByAlbum((prev) => ({
      ...prev,
      [activeAlbum]: [...(prev[activeAlbum] ?? []), newItem],
    }));
    setAlbums((prev) =>
      prev.map((a) => a.id === activeAlbum ? { ...a, itemCount: a.itemCount + 1 } : a),
    );
    setShowNewItem(false);
    (e.target as HTMLFormElement).reset();
  }

  /* Delete item */
  async function deleteItem(itemId: string, albumId: string) {
    await fetch("/api/community/items", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: itemId }),
    });
    setItemsByAlbum((prev) => ({
      ...prev,
      [albumId]: (prev[albumId] ?? []).filter((i) => i.id !== itemId),
    }));
    setAlbums((prev) =>
      prev.map((a) => a.id === albumId ? { ...a, itemCount: Math.max(0, a.itemCount - 1) } : a),
    );
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
    const json = (await res.json()) as { postId?: string; error?: string };
    setBusy(false);
    if (!res.ok) { setError(json.error ?? "Failed"); return; }
    setPosts((prev) => [
      { id: json.postId!, body: String(fd.get("body")), imageUrl: null, createdAt: new Date().toISOString() },
      ...prev,
    ]);
    setShowNewPost(false);
    (e.target as HTMLFormElement).reset();
  }

  /* Delete trade post */
  async function deletePost(id: string) {
    await fetch("/api/community/trade-posts", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }

  const activeAlbumData = albums.find((a) => a.id === activeAlbum);
  const activeItems = activeAlbum ? (itemsByAlbum[activeAlbum] ?? []) : [];

  return (
    <div className={styles.wrapper}>
      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === "gallery" ? styles.tabActive : ""}`}
          onClick={() => setTab("gallery")}
          type="button"
        >
          <ImageIcon size={15} /> Gallery
        </button>
        <button
          className={`${styles.tab} ${tab === "trades" ? styles.tabActive : ""}`}
          onClick={() => setTab("trades")}
          type="button"
        >
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
              <button
                className={styles.primaryBtn}
                onClick={() => setShowNewAlbum(true)}
                type="button"
              >
                <Plus size={15} /> New album
              </button>
            </div>

            {showNewAlbum ? (
              <form className={styles.form} onSubmit={createAlbum}>
                <label>
                  Album title
                  <input maxLength={120} name="title" placeholder="Cape Town Seminar — June 2025" required />
                </label>
                <label>
                  Description (optional)
                  <textarea maxLength={500} name="description" placeholder="What was this event about?" rows={2} />
                </label>
                <div className={styles.formActions}>
                  <button className={styles.cancelBtn} onClick={() => setShowNewAlbum(false)} type="button">
                    Cancel
                  </button>
                  <button className={styles.primaryBtn} disabled={busy} type="submit">
                    {busy ? <Loader2 className={styles.spin} size={14} /> : null} Create album
                  </button>
                </div>
              </form>
            ) : null}

            {albums.length === 0 ? (
              <p className={styles.empty}>No albums yet. Create one to start uploading.</p>
            ) : (
              <div className={styles.albumGrid}>
                {albums.map((album) => (
                  <div className={styles.albumCard} key={album.id}>
                    <button
                      className={styles.albumCoverBtn}
                      onClick={() => setActiveAlbum(album.id)}
                      type="button"
                    >
                      <div className={styles.albumCover}>
                        {album.coverUrl ? (
                          <Image alt="" fill sizes="200px" src={album.coverUrl} unoptimized />
                        ) : (
                          <ImageIcon size={26} />
                        )}
                      </div>
                      <p className={styles.albumTitle}>{album.title}</p>
                      <p className={styles.albumMeta}>
                        {album.itemCount} item{album.itemCount !== 1 ? "s" : ""}
                      </p>
                    </button>
                    <button
                      aria-label="Delete album"
                      className={styles.deleteBtn}
                      onClick={() => void deleteAlbum(album.id)}
                      type="button"
                    >
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
                <button
                  className={styles.backBtn}
                  onClick={() => setActiveAlbum(null)}
                  type="button"
                >
                  ← Albums
                </button>
                <h2 className={styles.sectionTitle}>{activeAlbumData?.title}</h2>
              </div>
              <button
                className={styles.primaryBtn}
                onClick={() => setShowNewItem(true)}
                type="button"
              >
                <Plus size={15} /> Add media
              </button>
            </div>

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
                <label>
                  Video URL (for link type only)
                  <input name="videoUrl" placeholder="https://youtube.com/watch?v=..." type="url" />
                </label>
                <label>
                  Caption (optional)
                  <input maxLength={300} name="caption" />
                </label>
                <div className={styles.formActions}>
                  <button className={styles.cancelBtn} onClick={() => setShowNewItem(false)} type="button">
                    Cancel
                  </button>
                  <button className={styles.primaryBtn} disabled={busy} type="submit">
                    {busy ? <Loader2 className={styles.spin} size={14} /> : <UploadCloud size={14} />}
                    {busy ? "Uploading…" : "Add"}
                  </button>
                </div>
              </form>
            ) : null}

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
                    <button
                      aria-label="Delete item"
                      className={styles.deleteBtn}
                      onClick={() => void deleteItem(item.id, activeAlbum)}
                      type="button"
                    >
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
            <button
              className={styles.primaryBtn}
              onClick={() => setShowNewPost(true)}
              type="button"
            >
              <Plus size={15} /> Post a trade
            </button>
          </div>

          {showNewPost ? (
            <form className={styles.form} onSubmit={createPost}>
              <label>
                Trade write-up
                <textarea
                  maxLength={2000}
                  name="body"
                  placeholder="GBPUSD — took a long at 1.2740 targeting 1.2820..."
                  required
                  rows={4}
                />
              </label>
              <label>
                Screenshot (optional)
                <input accept="image/*" ref={postFileRef} type="file" />
              </label>
              <div className={styles.formActions}>
                <button className={styles.cancelBtn} onClick={() => setShowNewPost(false)} type="button">
                  Cancel
                </button>
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
                        {new Date(post.createdAt).toLocaleDateString(undefined, {
                          dateStyle: "medium",
                        })}
                      </span>
                      <button
                        aria-label="Delete post"
                        className={styles.deleteBtn}
                        onClick={() => void deletePost(post.id)}
                        type="button"
                      >
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
