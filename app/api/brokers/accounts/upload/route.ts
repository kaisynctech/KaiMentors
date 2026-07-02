import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const uploadSchema = z.object({
  accountId: z.string().uuid(),
  tab: z.enum(["new", "existing"]),
  mediaType: z.enum(["image", "video"]),
  mimeType: z.string(),
  fileSize: z.number().int().positive(),
});

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

const IMAGE_MAX = 10 * 1024 * 1024;
const VIDEO_MAX = 500 * 1024 * 1024;

async function getWorkspace() {
  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!membership) return null;

  return { supabase, traderId: membership.trader_id };
}

export async function POST(request: Request) {
  const workspace = await getWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const parsed = uploadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }

  const { accountId, tab, mediaType, mimeType, fileSize } = parsed.data;

  const { data: account } = await workspace.supabase
    .from("trader_broker_accounts")
    .select("id")
    .eq("id", accountId)
    .eq("trader_id", workspace.traderId)
    .maybeSingle();

  if (!account) {
    return NextResponse.json({ error: "Broker account not found." }, { status: 404 });
  }

  let ext: string;
  if (mediaType === "image") {
    ext = IMAGE_TYPES[mimeType] ?? "";
    if (!ext) {
      return NextResponse.json({ error: "Unsupported image type." }, { status: 400 });
    }
    if (fileSize > IMAGE_MAX) {
      return NextResponse.json({ error: "Image must be under 10 MB." }, { status: 400 });
    }
  } else {
    ext = VIDEO_TYPES[mimeType] ?? "";
    if (!ext) {
      return NextResponse.json({ error: "Unsupported video type." }, { status: 400 });
    }
    if (fileSize > VIDEO_MAX) {
      return NextResponse.json({ error: "Video must be under 500 MB." }, { status: 400 });
    }
  }

  const storagePath = `broker-instructions/${workspace.traderId}/${accountId}/${tab}-${mediaType}.${ext}`;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Storage is not configured." }, { status: 503 });
  }

  const { data: upload, error } = await admin.storage
    .from("academy-media")
    .createSignedUploadUrl(storagePath, { upsert: true });

  if (error || !upload) {
    return NextResponse.json({ error: "Could not create upload URL." }, { status: 500 });
  }

  return NextResponse.json({
    signedUrl: upload.signedUrl,
    storagePath,
    token: upload.token,
  });
}
