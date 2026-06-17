import { NextResponse } from "next/server";
import { z } from "zod";
import { getMentorWorkspace } from "@/lib/workspace";

const overridesSchema = z.object({
  action: z.literal("save_overrides"),
  assignmentId: z.string().uuid(),
  showPoweredBy: z.boolean(),
  overrides: z.record(z.string().trim().max(1000)),
});

const requestSchema = overridesSchema;

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
