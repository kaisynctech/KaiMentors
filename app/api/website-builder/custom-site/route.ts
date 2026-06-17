import { NextResponse } from "next/server";
import { z } from "zod";
import { getMentorWorkspace } from "@/lib/workspace";

const modeSchema = z.object({
  action: z.literal("set_mode"),
  mode: z.enum(["builder_template", "custom_package", "external_website"]),
});

const assignSchema = z.object({
  action: z.literal("assign_package"),
  packageId: z.string().uuid(),
  showPoweredBy: z.boolean(),
});

const overridesSchema = z.object({
  action: z.literal("save_overrides"),
  assignmentId: z.string().uuid(),
  showPoweredBy: z.boolean(),
  overrides: z.record(z.string().trim().max(1000)),
});

const requestSchema = z.discriminatedUnion("action", [
  modeSchema,
  assignSchema,
  overridesSchema,
]);

export async function POST(request: Request) {
  const workspace = await getMentorWorkspace();
  if (!workspace) {
    return NextResponse.json(
      { error: "Please sign in to your mentor workspace." },
      { status: 401 },
    );
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check the custom website details." },
      { status: 400 },
    );
  }

  const input = parsed.data;

  if (input.action === "set_mode") {
    const { error } = await workspace.supabase.rpc(
      "set_website_delivery_mode",
      {
        target_portal_id: workspace.portal.id,
        target_mode: input.mode,
      },
    );
    if (error) {
      return NextResponse.json(
        { error: "The website delivery mode could not be changed." },
        { status: 400 },
      );
    }
    return NextResponse.json({ status: "mode_updated" });
  }

  if (input.action === "assign_package") {
    const { data, error } = await workspace.supabase.rpc(
      "assign_custom_site_package",
      {
        target_portal_id: workspace.portal.id,
        target_package_id: input.packageId,
        target_status: "active",
        target_show_powered_by: input.showPoweredBy,
      },
    );
    if (error) {
      return NextResponse.json(
        { error: "The custom website package could not be assigned." },
        { status: 400 },
      );
    }
    return NextResponse.json({ status: "package_assigned", assignmentId: data });
  }

  const { data: assignment } = await workspace.supabase
    .from("custom_site_assignments")
    .select("id,trader_id")
    .eq("id", input.assignmentId)
    .eq("trader_id", workspace.traderId)
    .maybeSingle();
  if (!assignment) {
    return NextResponse.json(
      { error: "Custom website assignment not found." },
      { status: 404 },
    );
  }

  const { error } = await workspace.supabase
    .from("custom_site_assignments")
    .update({
      content_overrides: input.overrides,
      show_powered_by: input.showPoweredBy,
    })
    .eq("id", input.assignmentId)
    .eq("trader_id", workspace.traderId);
  if (error) {
    return NextResponse.json(
      { error: "Custom website settings could not be saved." },
      { status: 400 },
    );
  }

  return NextResponse.json({ status: "overrides_saved" });
}
