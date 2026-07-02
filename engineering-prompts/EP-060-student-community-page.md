# EP-060 — Student community page: Gallery + Trade Board

Student-facing community feature. Two tabs — Gallery and Trade Board — both visible to
all students including unverified. Mentor content only; students can like items.

Depends on EP-059 (tables, storage bucket, upload API must exist first).

---

## New files

```
app/student/community/page.tsx
app/student/community/community.module.css
app/academy/community/page.tsx          ← custom domain mirror
components/community-view.tsx
components/community-view.module.css
app/api/community/like/route.ts
```

---

## Step 1 — New API: `app/api/community/like/route.ts`

Toggle like on/off (insert or delete from `community_likes`).

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  traderId:   z.string().uuid(),
  targetType: z.enum(["gallery_item", "trade_post"]),
  targetId:   z.string().uuid(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { traderId, targetType, targetId } = parsed.data;

  // Check: caller has a student_application OR is a trader_member for this workspace.
  const { data: membership } = await supabase
    .from("student_applications")
    .select("id")
    .eq("student_user_id", user.id)
    .eq("trader_id", traderId)
    .limit(1)
    .maybeSingle();

  const { data: mentorMembership } = await supabase
    .from("trader_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("trader_id", traderId)
    .maybeSingle();

  if (!membership && !mentorMembership) {
    return NextResponse.json({ error: "Not a member of this academy." }, { status: 403 });
  }

  // Toggle: try delete first, insert if not found.
  const { data: existing } = await supabase
    .from("community_likes")
    .select("id")
    .eq("user_id", user.id)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("community_likes")
      .delete()
      .eq("id", existing.id);
    return NextResponse.json({ liked: false });
  }

  await supabase.from("community_likes").insert({
    user_id:     user.id,
    trader_id:   traderId,
    target_type: targetType,
    target_id:   targetId,
  });

  return NextResponse.json({ liked: true });
}
```

---

## Step 2 — New component: `components/community-view.tsx`

Client component. Receives pre-fetched albums, gallery items, trade posts, and like state.
Handles tab switching and like toggling client-side.

```tsx
"use client";

import Image from "next/image";
import { useState } from "react";
import { Heart, Image as ImageIcon, TrendingUp, X } from "lucide-react";
import styles from "./community-view.module.css";

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface GalleryAlbum {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  itemCount: number;
}

export interface GalleryItem {
  id: string;
  albumId: string;
  albumTitle: string;
  type: "photo" | "video_upload" | "video_link";
  mediaUrl: string | null;   // signed URL (photo / video_upload)
  videoUrl: string | null;   // external URL (video_link)
  caption: string | null;
  likeCount: number;
  likedByMe: boolean;
}

export interface TradePost {
  id: string;
  body: string;
  imageUrl: string | null;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  authorName: string;
}

interface CommunityViewProps {
  traderId: string;
  albums: GalleryAlbum[];
  items: GalleryItem[];
  tradePosts: TradePost[];
  initialTab?: "gallery" | "trades";
}

/* ── Component ──────────────────────────────────────────────────────────── */

export function CommunityView({
  traderId,
  albums,
  items,
  tradePosts,
  initialTab = "gallery",
}: CommunityViewProps) {
  const [tab, setTab] = useState<"gallery" | "trades">(initialTab);
  const [activeAlbum, setActiveAlbum] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<GalleryItem | null>(null);

  // Local like state — keyed by "gallery_item:{id}" or "trade_post:{id}"
  const [likeState, setLikeState] = useState<Record<string, { count: number; liked: boolean }>>(
    () => {
      const state: Record<string, { count: number; liked: boolean }> = {};
      for (const item of items) {
        state[`gallery_item:${item.id}`] = { count: item.likeCount, liked: item.likedByMe };
      }
      for (const post of tradePosts) {
        state[`trade_post:${post.id}`] = { count: post.likeCount, liked: post.likedByMe };
      }
      return state;
    },
  );

  async function toggleLike(targetType: "gallery_item" | "trade_post", targetId: string) {
    const key = `${targetType}:${targetId}`;
    const current = likeState[key] ?? { count: 0, liked: false };
    // Optimistic update
    setLikeState((prev) => ({
      ...prev,
      [key]: { count: current.liked ? current.count - 1 : current.count + 1, liked: !current.liked },
    }));
    try {
      await fetch("/api/community/like", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ traderId, targetType, targetId }),
      });
    } catch {
      // Revert on error
      setLikeState((prev) => ({ ...prev, [key]: current }));
    }
  }

  const visibleItems = activeAlbum ? items.filter((i) => i.albumId === activeAlbum) : items;
  const activeAlbumTitle = albums.find((a) => a.id === activeAlbum)?.title ?? null;

  return (
    <div className={styles.wrapper}>
      {/* Tab bar */}
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

      {/* ── Gallery tab ── */}
      {tab === "gallery" ? (
        <div>
          {/* Album selector */}
          {!activeAlbum ? (
            albums.length === 0 ? (
              <p className={styles.empty}>No gallery albums yet.</p>
            ) : (
              <div className={styles.albumGrid}>
                {albums.map((album) => (
                  <button
                    className={styles.albumCard}
                    key={album.id}
                    onClick={() => setActiveAlbum(album.id)}
                    type="button"
                  >
                    <div className={styles.albumCover}>
                      {album.coverUrl ? (
                        <Image alt="" fill sizes="220px" src={album.coverUrl} unoptimized />
                      ) : (
                        <ImageIcon size={28} />
                      )}
                    </div>
                    <p className={styles.albumTitle}>{album.title}</p>
                    <p className={styles.albumMeta}>{album.itemCount} item{album.itemCount !== 1 ? "s" : ""}</p>
                  </button>
                ))}
              </div>
            )
          ) : (
            <>
              {/* Back + album title */}
              <div className={styles.albumHeader}>
                <button
                  className={styles.backBtn}
                  onClick={() => setActiveAlbum(null)}
                  type="button"
                >
                  ← Albums
                </button>
                <h2 className={styles.albumHeading}>{activeAlbumTitle}</h2>
              </div>

              {visibleItems.length === 0 ? (
                <p className={styles.empty}>No items in this album yet.</p>
              ) : (
                <div className={styles.itemGrid}>
                  {visibleItems.map((item) => {
                    const like = likeState[`gallery_item:${item.id}`] ?? { count: item.likeCount, liked: item.likedByMe };
                    return (
                      <div className={styles.itemCard} key={item.id}>
                        {/* Media */}
                        <button
                          className={styles.mediaThumbnail}
                          onClick={() => setLightbox(item)}
                          type="button"
                        >
                          {item.type === "photo" && item.mediaUrl ? (
                            <Image alt={item.caption ?? ""} fill sizes="280px" src={item.mediaUrl} unoptimized />
                          ) : item.type === "video_upload" && item.mediaUrl ? (
                            <video muted playsInline src={item.mediaUrl} />
                          ) : item.type === "video_link" && item.videoUrl ? (
                            <div className={styles.videoLinkThumb}>▶ Video</div>
                          ) : (
                            <ImageIcon size={28} />
                          )}
                        </button>
                        {/* Caption + like */}
                        <div className={styles.itemMeta}>
                          {item.caption ? <p className={styles.caption}>{item.caption}</p> : null}
                          <button
                            className={`${styles.likeBtn} ${like.liked ? styles.likeBtnActive : ""}`}
                            onClick={() => void toggleLike("gallery_item", item.id)}
                            type="button"
                          >
                            <Heart size={14} />
                            {like.count > 0 ? like.count : null}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      ) : null}

      {/* ── Trade Board tab ── */}
      {tab === "trades" ? (
        <div className={styles.feed}>
          {tradePosts.length === 0 ? (
            <p className={styles.empty}>No trade posts yet.</p>
          ) : (
            tradePosts.map((post) => {
              const like = likeState[`trade_post:${post.id}`] ?? { count: post.likeCount, liked: post.likedByMe };
              return (
                <article className={styles.postCard} key={post.id}>
                  {post.imageUrl ? (
                    <div className={styles.postImage}>
                      <Image alt="" fill sizes="600px" src={post.imageUrl} unoptimized />
                    </div>
                  ) : null}
                  <div className={styles.postBody}>
                    <p className={styles.postText}>{post.body}</p>
                    <div className={styles.postFooter}>
                      <span className={styles.postMeta}>
                        {post.authorName} · {new Date(post.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                      </span>
                      <button
                        className={`${styles.likeBtn} ${like.liked ? styles.likeBtnActive : ""}`}
                        onClick={() => void toggleLike("trade_post", post.id)}
                        type="button"
                      >
                        <Heart size={14} />
                        {like.count > 0 ? like.count : null}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      ) : null}

      {/* ── Lightbox ── */}
      {lightbox ? (
        <div className={styles.lightboxOverlay} onClick={() => setLightbox(null)}>
          <button
            aria-label="Close"
            className={styles.lightboxClose}
            onClick={() => setLightbox(null)}
            type="button"
          >
            <X size={22} />
          </button>
          <div className={styles.lightboxContent} onClick={(e) => e.stopPropagation()}>
            {lightbox.type === "photo" && lightbox.mediaUrl ? (
              <div className={styles.lightboxImage}>
                <Image alt={lightbox.caption ?? ""} fill sizes="90vw" src={lightbox.mediaUrl} unoptimized />
              </div>
            ) : lightbox.type === "video_upload" && lightbox.mediaUrl ? (
              <video autoPlay className={styles.lightboxVideo} controls src={lightbox.mediaUrl} />
            ) : lightbox.type === "video_link" && lightbox.videoUrl ? (
              <iframe
                allow="autoplay; fullscreen"
                allowFullScreen
                className={styles.lightboxVideo}
                src={lightbox.videoUrl.replace("watch?v=", "embed/")}
                title={lightbox.caption ?? "Video"}
              />
            ) : null}
            {lightbox.caption ? (
              <p className={styles.lightboxCaption}>{lightbox.caption}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

---

## Step 3 — New CSS: `components/community-view.module.css`

```css
.wrapper { width: 100%; }

/* Tabs */
.tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0;
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
  transition: color 0.15s, border-color 0.15s;
}
.tab:hover { color: var(--text-primary); }
.tabActive { color: var(--text-primary); border-bottom-color: var(--accent); }

/* Album grid */
.albumGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1rem;
}
.albumCard {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 0.75rem);
  padding: 0;
  cursor: pointer;
  text-align: left;
  overflow: hidden;
  transition: box-shadow 0.15s;
}
.albumCard:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
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
.albumTitle {
  font-size: 0.85rem;
  font-weight: 700;
  padding: 0.6rem 0.75rem 0.2rem;
  margin: 0;
  color: var(--text-primary);
}
.albumMeta {
  font-size: 0.75rem;
  color: var(--text-muted);
  padding: 0 0.75rem 0.6rem;
  margin: 0;
}

/* Album detail */
.albumHeader {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.25rem;
}
.backBtn {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--accent);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}
.albumHeading {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 800;
  letter-spacing: -0.03em;
}

/* Item grid */
.itemGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem;
}
.itemCard {
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 0.75rem);
  overflow: hidden;
  background: var(--surface);
}
.mediaThumbnail {
  position: relative;
  width: 100%;
  aspect-ratio: 4/3;
  background: var(--surface-hover, #f3f4f6);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  padding: 0;
  overflow: hidden;
}
.mediaThumbnail img,
.mediaThumbnail video { object-fit: cover; width: 100%; height: 100%; }
.videoLinkThumb {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-muted);
}
.itemMeta {
  padding: 0.6rem 0.75rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.caption {
  font-size: 0.78rem;
  color: var(--text-secondary, var(--text-muted));
  margin: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Trade feed */
.feed { display: flex; flex-direction: column; gap: 1rem; }
.postCard {
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 0.75rem);
  overflow: hidden;
  background: var(--surface);
}
.postImage {
  position: relative;
  width: 100%;
  aspect-ratio: 16/9;
  background: var(--surface-hover, #f3f4f6);
}
.postImage img { object-fit: cover; }
.postBody { padding: 1rem 1.25rem; }
.postText {
  font-size: 0.9rem;
  line-height: 1.6;
  margin: 0 0 0.75rem;
  white-space: pre-wrap;
}
.postFooter {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.postMeta {
  font-size: 0.75rem;
  color: var(--text-muted);
}

/* Like button */
.likeBtn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  border: none;
  background: none;
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: 999px;
  transition: color 0.15s, background 0.15s;
}
.likeBtn:hover { background: var(--surface-hover, #f3f4f6); color: #e0245e; }
.likeBtnActive { color: #e0245e; }

/* Empty state */
.empty {
  color: var(--text-muted);
  font-size: 0.88rem;
  padding: 2rem 0;
  text-align: center;
}

/* Lightbox */
.lightboxOverlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.85);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}
.lightboxClose {
  position: absolute;
  top: 1.25rem;
  right: 1.25rem;
  background: rgba(255,255,255,0.12);
  border: none;
  color: #fff;
  border-radius: 999px;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  cursor: pointer;
}
.lightboxContent {
  max-width: min(90vw, 900px);
  width: 100%;
}
.lightboxImage {
  position: relative;
  width: 100%;
  aspect-ratio: 16/9;
}
.lightboxImage img { object-fit: contain; }
.lightboxVideo {
  width: 100%;
  aspect-ratio: 16/9;
  background: #000;
}
.lightboxCaption {
  color: #e5e7eb;
  font-size: 0.85rem;
  margin-top: 0.75rem;
  text-align: center;
}
```

---

## Step 4 — New page: `app/student/community/page.tsx`

Server component. Fetches albums, items, trade posts, and like state, then resolves
signed URLs for all stored media via the admin client.

```tsx
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { StudentShell } from "@/components/student-shell";
import { CommunityView } from "@/components/community-view";
import type { GalleryAlbum, GalleryItem, TradePost } from "@/components/community-view";
import { createClient } from "@/lib/supabase/server";
import { getStudentAcademyContext } from "@/lib/student-routing";
import styles from "./community.module.css";

export const dynamic = "force-dynamic";

export default async function StudentCommunityPage({
  searchParams,
}: {
  searchParams?: Promise<{ portal?: string }>;
}) {
  const query = await searchParams;
  const academy = await getStudentAcademyContext(query?.portal);
  const { basePath, querySuffix } = academy;

  const supabase = await createClient();
  if (!supabase) redirect(`${basePath}/login${querySuffix}`);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`${basePath}/login${querySuffix}`);

  // Fetch application (any status — community is open to all)
  let appQuery = supabase
    .from("student_applications")
    .select("id,trader_id,status,portal_id,portal:portals!inner(portal_name,slug,logo_path)")
    .eq("student_user_id", user.id);
  if (academy.portalId) appQuery = appQuery.eq("portal_id", academy.portalId);
  if (academy.portalSlug) appQuery = appQuery.eq("portal.slug", academy.portalSlug);

  const { data: application } = await appQuery
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!application) redirect(`${basePath}/join-academy${querySuffix}`);

  const portal = Array.isArray(application.portal) ? application.portal[0] : application.portal;
  const academyName = basePath === "/academy" ? (portal?.portal_name ?? "Academy") : "KaiMentors";
  const displayName = user.email?.split("@")[0] ?? "Student";
  const isVerified = application.status === "verified";
  const traderId = application.trader_id;

  // Fetch albums, items, trade posts and likes in parallel
  const [albumsResult, itemsResult, postsResult, likesResult] = await Promise.all([
    supabase
      .from("gallery_albums")
      .select("id,title,description,cover_path")
      .eq("trader_id", traderId)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("gallery_items")
      .select("id,album_id,type,file_path,video_url,caption,sort_order")
      .eq("trader_id", traderId)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("trade_posts")
      .select("id,body,image_path,created_at,created_by,profiles!created_by(full_name)")
      .eq("trader_id", traderId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("community_likes")
      .select("target_type,target_id")
      .eq("user_id", user.id)
      .eq("trader_id", traderId),
  ]);

  const rawAlbums = albumsResult.data ?? [];
  const rawItems = itemsResult.data ?? [];
  const rawPosts = postsResult.data ?? [];
  const myLikes = new Set(
    (likesResult.data ?? []).map((l) => `${l.target_type}:${l.target_id}`),
  );

  // Count likes for all items + posts
  const allTargetIds = [
    ...rawItems.map((i) => i.id),
    ...rawPosts.map((p) => p.id),
  ];
  const { data: likeCounts } = allTargetIds.length > 0
    ? await supabase
        .from("community_likes")
        .select("target_id")
        .in("target_id", allTargetIds)
    : { data: [] };

  const countMap: Record<string, number> = {};
  for (const row of (likeCounts ?? [])) {
    countMap[row.target_id] = (countMap[row.target_id] ?? 0) + 1;
  }

  // Resolve signed URLs for stored media
  const admin = createAdminClient();
  async function signedUrl(path: string | null): Promise<string | null> {
    if (!path || !admin) return null;
    const { data } = await admin.storage
      .from("academy-media")
      .createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  }

  // Albums — resolve cover signed URLs and count items
  const itemCountByAlbum: Record<string, number> = {};
  for (const item of rawItems) {
    itemCountByAlbum[item.album_id] = (itemCountByAlbum[item.album_id] ?? 0) + 1;
  }

  const albums: GalleryAlbum[] = await Promise.all(
    rawAlbums.map(async (a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      coverUrl: await signedUrl(a.cover_path),
      itemCount: itemCountByAlbum[a.id] ?? 0,
    })),
  );

  // Gallery items — resolve media signed URLs
  const items: GalleryItem[] = await Promise.all(
    rawItems.map(async (item) => ({
      id: item.id,
      albumId: item.album_id,
      albumTitle: rawAlbums.find((a) => a.id === item.album_id)?.title ?? "",
      type: item.type as GalleryItem["type"],
      mediaUrl: item.file_path ? await signedUrl(item.file_path) : null,
      videoUrl: item.video_url ?? null,
      caption: item.caption,
      likeCount: countMap[item.id] ?? 0,
      likedByMe: myLikes.has(`gallery_item:${item.id}`),
    })),
  );

  // Trade posts — resolve image signed URLs
  const tradePosts: TradePost[] = await Promise.all(
    rawPosts.map(async (post) => {
      const profileData = Array.isArray(post.profiles) ? post.profiles[0] : post.profiles;
      return {
        id: post.id,
        body: post.body,
        imageUrl: post.image_path ? await signedUrl(post.image_path) : null,
        createdAt: post.created_at,
        likeCount: countMap[post.id] ?? 0,
        likedByMe: myLikes.has(`trade_post:${post.id}`),
        authorName: (profileData as { full_name?: string } | null)?.full_name ?? "Mentor",
      };
    }),
  );

  return (
    <StudentShell
      academyName={academyName}
      basePath={basePath}
      displayName={displayName}
      isVerified={isVerified}
      logoPath={portal?.logo_path ?? null}
      querySuffix={querySuffix}
      traderId={traderId}
    >
      <div className={styles.page}>
        <div className={styles.header}>
          <p className="eyebrow">{portal?.portal_name ?? "Mentor academy"}</p>
          <h1>Community</h1>
          <p>Gallery highlights and daily trade posts from your mentor.</p>
        </div>
        <CommunityView
          albums={albums}
          items={items}
          tradePosts={tradePosts}
          traderId={traderId}
        />
      </div>
    </StudentShell>
  );
}
```

---

## Step 5 — New CSS: `app/student/community/community.module.css`

```css
.page {
  padding: 36px 40px 60px;
  max-width: 900px;
}

.header {
  margin-bottom: 28px;
}

.header h1 {
  font-size: 30px;
  letter-spacing: -0.04em;
  margin: 4px 0 8px;
}

.header p {
  color: var(--text-muted);
  margin: 0;
}

@media (max-width: 640px) {
  .page { padding: 20px 18px 40px; }
}
```

---

## Step 6 — New page: `app/academy/community/page.tsx`

Custom domain mirror — identical logic, passes `customDomain` flag to the routing context.

```tsx
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { StudentShell } from "@/components/student-shell";
import { CommunityView } from "@/components/community-view";
import type { GalleryAlbum, GalleryItem, TradePost } from "@/components/community-view";
import { createClient } from "@/lib/supabase/server";
import { getStudentAcademyContext } from "@/lib/student-routing";
import styles from "../../student/community/community.module.css";

export const dynamic = "force-dynamic";

export default async function AcademyCommunityPage({
  searchParams,
}: {
  searchParams?: Promise<{ portal?: string }>;
}) {
  // Identical to app/student/community/page.tsx — replace basePath check:
  // The getStudentAcademyContext will resolve correctly via the hostname context.
  // Copy the full implementation from app/student/community/page.tsx verbatim.
  // Only difference: this file lives under app/academy/ for custom domain routing.
}
```

> **Note to Engineering:** `app/academy/community/page.tsx` is a verbatim copy of
> `app/student/community/page.tsx`. The `getStudentAcademyContext` function already handles
> both `/student/` and `/academy/` base paths correctly — no code changes needed.

---

## Step 7 — Edit: `components/student-shell-client.tsx`

Add "Community" to the nav items list. No lock — open to all students.

In the `navItems` array, add after the "My Courses" entry (or wherever feels natural —
placing it after "Groups" keeps community features grouped):

```tsx
{
  href: `${basePath}/community${querySuffix}`,
  label: "Community",
  icon: Sparkles,        // import Sparkles from "lucide-react"
  locked: false,         // ← always unlocked
},
```

Add `Sparkles` to the lucide-react import at the top:
```ts
import {
  BookOpen,
  CalendarCheck,
  CalendarClock,
  LayoutDashboard,
  LogOut,
  LockKeyhole,
  Menu,
  MessageSquare,
  Sparkles,     // ← add
  Users,
  Video,
  X,
} from "lucide-react";
```

---

## Acceptance criteria

- [ ] `/student/community` loads for verified and unverified students — no lock, no gate
- [ ] Gallery tab shows album grid; clicking an album shows its items in a grid
- [ ] Clicking a photo or video opens a lightbox; lightbox closes on overlay click or X button
- [ ] External video links (YouTube/Vimeo) embed inside the lightbox via iframe
- [ ] Trade Board tab shows reverse-chronological mentor posts with optional image
- [ ] Like button toggles optimistically; server confirms; count updates correctly
- [ ] Double-liking is prevented (UNIQUE constraint returns existing like, toggle removes it)
- [ ] Community nav item appears in the student shell without a lock icon
- [ ] Custom domain (`/academy/community`) renders identically
- [ ] Signed URLs expire after 1 hour — private bucket, no direct public access
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] Deploy with `vercel --prod` (together with EP-059 API routes)

## Implementation order

1. Confirm EP-059 is deployed (tables, storage bucket, upload + signed-url APIs)
2. Create `app/api/community/like/route.ts`
3. Create `components/community-view.tsx` + `community-view.module.css`
4. Create `app/student/community/page.tsx` + `community.module.css`
5. Create `app/academy/community/page.tsx` (copy of student page)
6. Edit `components/student-shell-client.tsx` — add Community nav item
7. Build, commit, deploy
