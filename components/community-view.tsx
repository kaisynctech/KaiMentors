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
  mediaUrl: string | null;
  videoUrl: string | null;
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
                    <p className={styles.albumMeta}>
                      {album.itemCount} item{album.itemCount !== 1 ? "s" : ""}
                    </p>
                  </button>
                ))}
              </div>
            )
          ) : (
            <>
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
                    const like = likeState[`gallery_item:${item.id}`] ?? {
                      count: item.likeCount,
                      liked: item.likedByMe,
                    };
                    return (
                      <div className={styles.itemCard} key={item.id}>
                        <button
                          className={styles.mediaThumbnail}
                          onClick={() => setLightbox(item)}
                          type="button"
                        >
                          {item.type === "photo" && item.mediaUrl ? (
                            <Image alt={item.caption ?? ""} fill sizes="280px" src={item.mediaUrl} unoptimized />
                          ) : item.type === "video_upload" && item.mediaUrl ? (
                            <video muted playsInline src={item.mediaUrl} />
                          ) : item.type === "video_link" ? (
                            <div className={styles.videoLinkThumb}>▶ Video</div>
                          ) : (
                            <ImageIcon size={28} />
                          )}
                        </button>
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
              const like = likeState[`trade_post:${post.id}`] ?? {
                count: post.likeCount,
                liked: post.likedByMe,
              };
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
                        {post.authorName} ·{" "}
                        {new Date(post.createdAt).toLocaleDateString(undefined, {
                          dateStyle: "medium",
                        })}
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
                <Image
                  alt={lightbox.caption ?? ""}
                  fill
                  sizes="90vw"
                  src={lightbox.mediaUrl}
                  unoptimized
                />
              </div>
            ) : lightbox.type === "video_upload" && lightbox.mediaUrl ? (
              <video
                autoPlay
                className={styles.lightboxVideo}
                controls
                src={lightbox.mediaUrl}
              />
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
