import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const optionalUrl = z.preprocess(
  (value) => (value === "" ? null : value),
  z.string().url().max(500).nullable(),
);

const brandingSchema = z.object({
  portalName: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  heroTitle: z.string().trim().min(3).max(180),
  heroSubtitle: z.string().trim().max(320).nullable(),
  welcomeMessage: z.string().trim().min(1).max(600),
  whatsappNumber: z.preprocess(
    (value) => (value === "" ? null : value),
    z
      .string()
      .trim()
      .max(32)
      .regex(/^\+?[0-9 ()-]+$/)
      .nullable(),
  ),
  telegramUrl: optionalUrl,
  instagramUrl: optionalUrl,
  ctaLabel: z.string().trim().min(1).max(80),
  brokerCtaLabel: z.string().trim().min(1).max(80),
  isPublished: z.boolean(),
});

const allowedLogoTypes = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/svg+xml", "svg"],
]);

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Portal branding is not configured." },
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

  const formData = await request.formData();
  const parsed = brandingSchema.safeParse({
    portalName: formData.get("portalName"),
    slug: formData.get("slug"),
    primaryColor: formData.get("primaryColor"),
    accentColor: formData.get("accentColor"),
    heroTitle: formData.get("heroTitle"),
    heroSubtitle: formData.get("heroSubtitle") || null,
    welcomeMessage: formData.get("welcomeMessage"),
    whatsappNumber: formData.get("whatsappNumber") || null,
    telegramUrl: formData.get("telegramUrl") || null,
    instagramUrl: formData.get("instagramUrl") || null,
    ctaLabel: formData.get("ctaLabel"),
    brokerCtaLabel: formData.get("brokerCtaLabel"),
    isPublished: formData.get("isPublished") === "true",
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check the branding details and try again." },
      { status: 400 },
    );
  }

  const { data: portal } = await supabase
    .from("portals")
    .select("id,slug,logo_path")
    .eq("trader_id", membership.trader_id)
    .maybeSingle();
  if (!portal) {
    return NextResponse.json(
      { error: "Your portal could not be found." },
      { status: 404 },
    );
  }

  if (parsed.data.slug !== portal.slug) {
    const { data: slugMatch } = await supabase
      .from("portals")
      .select("id")
      .eq("slug", parsed.data.slug)
      .neq("id", portal.id)
      .maybeSingle();
    if (slugMatch) {
      return NextResponse.json(
        { error: "That portal address is already in use." },
        { status: 409 },
      );
    }
  }

  let logoPath = portal.logo_path as string | null;
  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    const extension = allowedLogoTypes.get(logo.type);
    if (!extension || logo.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Use a PNG, JPG, WebP, or SVG logo smaller than 5 MB." },
        { status: 400 },
      );
    }

    const nextLogoPath = `${membership.trader_id}/portal-logo-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("portal-branding")
      .upload(nextLogoPath, logo, {
        cacheControl: "3600",
        contentType: logo.type,
        upsert: false,
      });
    if (uploadError) {
      return NextResponse.json(
        { error: "The logo could not be uploaded." },
        { status: 400 },
      );
    }
    logoPath = nextLogoPath;
  }

  const branding = parsed.data;
  const { error: updateError } = await supabase
    .from("portals")
    .update({
      portal_name: branding.portalName,
      slug: branding.slug,
      logo_path: logoPath,
      primary_color: branding.primaryColor,
      accent_color: branding.accentColor,
      hero_title: branding.heroTitle,
      hero_subtitle: branding.heroSubtitle,
      welcome_message: branding.welcomeMessage,
      whatsapp_number: branding.whatsappNumber,
      telegram_url: branding.telegramUrl,
      instagram_url: branding.instagramUrl,
      cta_label: branding.ctaLabel,
      broker_cta_label: branding.brokerCtaLabel,
      is_published: branding.isPublished,
    })
    .eq("id", portal.id)
    .eq("trader_id", membership.trader_id);

  if (updateError) {
    if (logoPath && logoPath !== portal.logo_path) {
      await supabase.storage.from("portal-branding").remove([logoPath]);
    }
    const duplicateSlug = updateError.code === "23505";
    return NextResponse.json(
      {
        error: duplicateSlug
          ? "That portal address is already in use."
          : "Your branding changes could not be saved.",
      },
      { status: duplicateSlug ? 409 : 400 },
    );
  }

  if (portal.logo_path && logoPath !== portal.logo_path) {
    await supabase.storage.from("portal-branding").remove([portal.logo_path]);
  }

  return NextResponse.json({
    status: "saved",
    slug: branding.slug,
    logoPath,
  });
}
