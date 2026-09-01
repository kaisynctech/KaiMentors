import { NextResponse } from "next/server";
import { z } from "zod";
import { sanitizePortalFeatureMap } from "@/lib/portal-features";
import { getMentorWorkspace } from "@/lib/workspace";

const schema = z.object({
  features: z.record(z.boolean()),
});

export async function PATCH(request: Request) {
  const workspace = await getMentorWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid academy features." }, { status: 400 });
  }

  const features = sanitizePortalFeatureMap(parsed.data.features);
  if (!features) {
    return NextResponse.json(
      { error: "Every academy feature must be explicitly on or off." },
      { status: 400 },
    );
  }

  const { data: portal, error } = await workspace.supabase
    .from("portals")
    .update({ student_portal_features: features })
    .eq("trader_id", workspace.traderId)
    .select("id, student_portal_features")
    .single();

  if (error || !portal) {
    return NextResponse.json(
      { error: "Academy features could not be saved." },
      { status: 400 },
    );
  }

  await workspace.supabase.from("audit_logs").insert({
    trader_id: workspace.traderId,
    actor_user_id: workspace.user.id,
    actor_role: workspace.role,
    action: "portal.features_updated",
    entity_type: "portals",
    entity_id: portal.id as string,
    new_data: { student_portal_features: portal.student_portal_features },
  });

  return NextResponse.json({
    features: portal.student_portal_features,
  });
}
