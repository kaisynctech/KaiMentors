import { NextResponse } from "next/server";
import { z } from "zod";
import { getMentorWorkspace } from "@/lib/workspace";

const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const sectionContent = z.record(z.unknown());

const saveSchema = z.object({
  action: z.literal("save"),
  portal: z.object({
    name: z.string().trim().min(2).max(120),
    slug: z
      .string()
      .trim()
      .min(3)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    isPublished: z.boolean(),
  }),
  theme: z.object({
    primaryColor: color,
    accentColor: color,
    backgroundColor: color,
    surfaceColor: color,
    textColor: color,
    headingFont: z.string().trim().min(2).max(80),
    bodyFont: z.string().trim().min(2).max(80),
    socialLinks: z.object({
      whatsapp: z.string().trim().max(32),
      telegram: z.string().trim().max(500),
      instagram: z.string().trim().max(500),
    }),
  }),
  pages: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string().trim().min(1).max(120),
      isEnabled: z.boolean(),
      seoTitle: z.string().trim().max(180),
      seoDescription: z.string().trim().max(320),
    }),
  ),
  sections: z.array(
    z.object({
      id: z.string().uuid(),
      content: sectionContent,
      isEnabled: z.boolean(),
      sortOrder: z.number().int().min(0).max(1000),
    }),
  ),
  navigation: z.array(
    z.object({
      id: z.string().uuid(),
      label: z.string().trim().min(1).max(80),
      isEnabled: z.boolean(),
      sortOrder: z.number().int().min(0).max(1000),
    }),
  ),
});

const templateSchema = z.object({
  action: z.literal("apply_template"),
  templateId: z.string().uuid(),
});

export async function POST(request: Request) {
  const workspace = await getMentorWorkspace();
  if (!workspace) {
    return NextResponse.json(
      { error: "Please sign in to your mentor workspace." },
      { status: 401 },
    );
  }

  const body = await request.json();
  const templateRequest = templateSchema.safeParse(body);
  if (templateRequest.success) {
    const { data: currentTheme } = await workspace.supabase
      .from("website_theme_settings")
      .select("template:website_templates(is_managed)")
      .eq("portal_id", workspace.portal.id)
      .maybeSingle();
    const currentTemplate = Array.isArray(currentTheme?.template)
      ? currentTheme.template[0]
      : currentTheme?.template;
    if (currentTemplate?.is_managed) {
      return NextResponse.json(
        {
          error:
            "This workspace uses a managed custom design. Its template cannot be replaced from the library.",
        },
        { status: 403 },
      );
    }

    const { error } = await workspace.supabase.rpc("apply_website_template", {
      target_portal_id: workspace.portal.id,
      target_template_id: templateRequest.data.templateId,
    });
    if (error) {
      return NextResponse.json(
        { error: "The selected template could not be applied." },
        { status: 400 },
      );
    }
    return NextResponse.json({ status: "template_applied" });
  }

  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check the website details and try again." },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const draft = {
    portal: {
      name: input.portal.name,
      slug: input.portal.slug,
    },
    theme: input.theme,
    pages: input.pages.map((page) => ({
      id: page.id,
      title: page.title,
      is_enabled: page.isEnabled,
      seo_title: page.seoTitle,
      seo_description: page.seoDescription,
    })),
    sections: input.sections.map((section) => ({
      id: section.id,
      content: section.content,
      is_enabled: section.isEnabled,
      sort_order: section.sortOrder,
    })),
    navigation: input.navigation.map((item) => ({
      id: item.id,
      label: item.label,
      is_enabled: item.isEnabled,
      sort_order: item.sortOrder,
    })),
  };
  const { error: draftError } = await workspace.supabase.rpc(
    "save_website_draft",
    {
      target_portal_id: workspace.portal.id,
      draft,
    },
  );
  if (draftError) {
    return NextResponse.json(
      {
        error:
          draftError.code === "23505"
            ? "That website address is already in use."
            : "The website draft could not be saved.",
      },
      { status: draftError.code === "23505" ? 409 : 400 },
    );
  }

  const { error: publishError } = input.portal.isPublished
    ? await workspace.supabase.rpc("publish_website_release", {
        target_portal_id: workspace.portal.id,
        target_release_notes: "Published from Website Builder",
      })
    : await workspace.supabase.rpc("unpublish_website", {
        target_portal_id: workspace.portal.id,
      });
  if (publishError) {
    return NextResponse.json(
      {
        error: input.portal.isPublished
          ? "The draft was saved, but the website release could not be published."
          : "The draft was saved, but the website could not be unpublished.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    status: "saved",
    slug: input.portal.slug,
    isPublished: input.portal.isPublished,
  });
}
