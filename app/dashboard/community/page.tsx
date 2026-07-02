import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardShell } from "@/components/dashboard-shell";
import { MentorCommunity } from "@/components/mentor-community";
import { getMentorWorkspace } from "@/lib/workspace";
import type { ComponentProps } from "react";

export const dynamic = "force-dynamic";

type GalleryItem = ComponentProps<typeof MentorCommunity>["itemsByAlbum"][string][number];

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

  const itemsByAlbum: Record<string, GalleryItem[]> = {};
  for (const item of rawItems) {
    const mediaUrl = item.file_path ? await signedUrl(item.file_path) : null;
    if (!itemsByAlbum[item.album_id]) itemsByAlbum[item.album_id] = [];
    itemsByAlbum[item.album_id].push({
      id: item.id,
      type: item.type as GalleryItem["type"],
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
