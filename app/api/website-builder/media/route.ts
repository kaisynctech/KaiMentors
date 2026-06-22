import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdminApi } from "@/lib/admin-api";

const mediaType = z.enum(["logo", "hero", "image"]);
const allowedTypes = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/svg+xml", "svg"],
]);

export async function POST(request: Request) {
  if (!(await requirePlatformAdminApi())) {
    return NextResponse.json({ error: "Super admin access is required." }, { status: 403 });
  }
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Website media is not configured." },
      { status: 503 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json(
      { error: "No mentor workspace was found." },
      { status: 403 },
    );
  }

  const { data: portal } = await supabase
    .from("portals")
    .select("id")
    .eq("trader_id", membership.trader_id)
    .maybeSingle();
  if (!portal) {
    return NextResponse.json(
      { error: "Your website could not be found." },
      { status: 404 },
    );
  }

  const formData = await request.formData();
  const parsedType = mediaType.safeParse(formData.get("mediaType"));
  const file = formData.get("file");
  if (!parsedType.success || !(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: "Choose a website image to upload." },
      { status: 400 },
    );
  }

  const extension = allowedTypes.get(file.type);
  if (!extension || file.size > 10 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Use a PNG, JPG, WebP, or SVG image smaller than 10 MB." },
      { status: 400 },
    );
  }

  const path = `${membership.trader_id}/${parsedType.data}-${Date.now()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from("website-media")
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) {
    return NextResponse.json(
      { error: "The website image could not be uploaded." },
      { status: 400 },
    );
  }

  const { error: mediaError } = await supabase.from("website_media").insert({
    trader_id: membership.trader_id,
    portal_id: portal.id,
    storage_path: path,
    media_type: parsedType.data,
    alt_text: String(formData.get("altText") ?? "").trim(),
    metadata: { size: file.size, contentType: file.type },
  });
  if (mediaError) {
    await supabase.storage.from("website-media").remove([path]);
    return NextResponse.json(
      { error: "The website image record could not be created." },
      { status: 400 },
    );
  }

  if (parsedType.data === "logo" || parsedType.data === "hero") {
    const field =
      parsedType.data === "logo" ? "logo_path" : "hero_image_path";
    await supabase
      .from("website_theme_settings")
      .update({ [field]: path })
      .eq("portal_id", portal.id)
      .eq("trader_id", membership.trader_id);
  }

  return NextResponse.json({ status: "uploaded", path });
}
