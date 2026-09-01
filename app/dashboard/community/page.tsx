import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardShell } from "@/components/dashboard-shell";
import { MentorCommunity } from "@/components/mentor-community";
import { signedUrls } from "@/lib/signed-urls";
import { isPortalFeatureEnabled } from "@/lib/portal-features";
import { getMentorWorkspace } from "@/lib/workspace";
import type { ComponentProps } from "react";

export const dynamic = "force-dynamic";

type GalleryItem = ComponentProps<typeof MentorCommunity>["itemsByAlbum"][string][number];

export default async function DashboardCommunityPage() {
  const workspace = await getMentorWorkspace();
  if (!workspace) redirect("/login");
  if (
    !isPortalFeatureEnabled(
      workspace.studentPortalFeatures,
      "community",
      workspace.accessModel,
    )
  ) {
    redirect("/dashboard");
  }
  const { supabase, traderId, displayName, portal } = workspace;

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

  const rawAlbums = albumsResult.data ?? [];
  const rawItems = itemsResult.data ?? [];
  const rawPosts = postsResult.data ?? [];

  // MB-125: one bulk createSignedUrls call replaces what was previously a
  // serial `for` loop awaiting one createSignedUrl per gallery item (plus
  // separate serial calls for album covers and trade-post images) --
  // N+M+K sequential storage round-trips collapsed into one.
  const urlMap = admin
    ? await signedUrls(admin, "academy-media", [
        ...rawAlbums.map((a) => a.cover_path),
        ...rawItems.map((i) => i.file_path),
        ...rawPosts.map((p) => p.image_path),
      ])
    : new Map<string, string | null>();

  const itemCountByAlbum: Record<string, number> = {};
  for (const item of rawItems) {
    itemCountByAlbum[item.album_id] = (itemCountByAlbum[item.album_id] ?? 0) + 1;
  }

  const albums = rawAlbums.map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    coverUrl: a.cover_path ? (urlMap.get(a.cover_path) ?? null) : null,
    itemCount: itemCountByAlbum[a.id] ?? 0,
  }));

  const itemsByAlbum: Record<string, GalleryItem[]> = {};
  for (const item of rawItems) {
    const mediaUrl = item.file_path ? (urlMap.get(item.file_path) ?? null) : null;
    if (!itemsByAlbum[item.album_id]) itemsByAlbum[item.album_id] = [];
    itemsByAlbum[item.album_id].push({
      id: item.id,
      type: item.type as GalleryItem["type"],
      mediaUrl,
      videoUrl: item.video_url,
      caption: item.caption,
    });
  }

  const tradePosts = rawPosts.map((post) => ({
    id: post.id,
    body: post.body,
    imageUrl: post.image_path ? (urlMap.get(post.image_path) ?? null) : null,
    createdAt: post.created_at,
  }));

  return (
    <DashboardShell
      activePath="/dashboard/community"
      description="Upload gallery albums and post your daily trades."
      title="Community"
      traderId={traderId}
      userLabel={displayName}
      portalName={portal.portal_name}
      portalSlug={portal.slug}
    >
      <MentorCommunity
        albums={albums}
        itemsByAlbum={itemsByAlbum}
        tradePosts={tradePosts}
      />
    </DashboardShell>
  );
}
