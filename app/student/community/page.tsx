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
  const { basePath, querySuffix, joinAcademyPath } = academy;

  const supabase = await createClient();
  if (!supabase) redirect(`${basePath}/login${querySuffix}`);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`${basePath}/login${querySuffix}`);

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

  if (!application) redirect(joinAcademyPath);

  const portal = Array.isArray(application.portal) ? application.portal[0] : application.portal;
  const academyName = portal?.portal_name ?? "Academy";
  const displayName = user.email?.split("@")[0] ?? "Student";
  const isVerified = application.status === "verified";
  const traderId = application.trader_id as string;

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

  const allTargetIds = [
    ...rawItems.map((i) => i.id),
    ...rawPosts.map((p) => p.id),
  ];
  const { data: likeCountRows } = allTargetIds.length > 0
    ? await supabase
        .from("community_likes")
        .select("target_id")
        .in("target_id", allTargetIds)
    : { data: [] as { target_id: string }[] };

  const countMap: Record<string, number> = {};
  for (const row of (likeCountRows ?? [])) {
    countMap[row.target_id] = (countMap[row.target_id] ?? 0) + 1;
  }

  const admin = createAdminClient();
  async function signedUrl(path: string | null): Promise<string | null> {
    if (!path || !admin) return null;
    const { data } = await admin.storage
      .from("academy-media")
      .createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  }

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
      portalSlug={portal?.slug}
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
