import { NextResponse } from "next/server";
import { z } from "zod";
import { validateAccessPolicy } from "@/lib/student-access";
import { getMentorWorkspace } from "@/lib/workspace";

const schema = z.object({
  requireBrokerVerificationForModules: z.boolean(),
  allowFullAccessWithoutVerification: z.boolean(),
});

export async function PATCH(request: Request) {
  const workspace = await getMentorWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid access policy." }, { status: 400 });
  }

  const validationError = validateAccessPolicy(parsed.data);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { data: portal, error } = await workspace.supabase
    .from("portals")
    .update({
      require_broker_verification_for_modules:
        parsed.data.requireBrokerVerificationForModules,
      allow_full_access_without_verification:
        parsed.data.allowFullAccessWithoutVerification,
    })
    .eq("trader_id", workspace.traderId)
    .select(
      "id, require_broker_verification_for_modules, allow_full_access_without_verification",
    )
    .single();

  if (error || !portal) {
    return NextResponse.json(
      { error: "Student access settings could not be saved." },
      { status: 400 },
    );
  }

  await workspace.supabase.from("audit_logs").insert({
    trader_id: workspace.traderId,
    actor_user_id: workspace.user.id,
    actor_role: workspace.role,
    action: "portal.access_policy_updated",
    entity_type: "portals",
    entity_id: portal.id as string,
    new_data: portal,
  });

  return NextResponse.json({
    policy: {
      requireBrokerVerificationForModules:
        portal.require_broker_verification_for_modules,
      allowFullAccessWithoutVerification:
        portal.allow_full_access_without_verification,
    },
  });
}
