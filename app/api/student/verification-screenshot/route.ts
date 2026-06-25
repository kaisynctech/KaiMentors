import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const patchSchema = z.object({
  storagePath: z
    .string()
    .max(500)
    .regex(
      /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/resubmission\/verification\.\w+$/i,
      "Invalid storage path format",
    ),
  portalId: z.string().uuid(),
});

export async function PATCH(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { storagePath, portalId } = parsed.data;

  // Validate that the path's student segment matches the authenticated user.
  const pathSegments = storagePath.split("/");
  // Format: {traderId}/{studentUserId}/resubmission/verification.ext
  const pathStudentId = pathSegments[1];
  if (pathStudentId !== user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const pathTraderId = pathSegments[0];

  // Find the application scoped to this portal + student.
  const { data: application } = await supabase
    .from("student_applications")
    .select("id, trader_id, status")
    .eq("student_user_id", user.id)
    .eq("portal_id", portalId)
    .in("status", ["pending", "manual_review"])
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!application) {
    return NextResponse.json(
      { error: "No eligible application found for this portal." },
      { status: 404 },
    );
  }

  // Ensure the trader_id in the path matches the application's trader.
  if (application.trader_id !== pathTraderId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Service not available." },
      { status: 503 },
    );
  }

  const { error: updateError } = await admin
    .from("student_applications")
    .update({ verification_screenshot_path: storagePath })
    .eq("id", application.id);

  if (updateError) {
    return NextResponse.json(
      { error: "Could not record screenshot path." },
      { status: 500 },
    );
  }

  await admin.from("audit_logs").insert({
    trader_id: application.trader_id,
    actor_user_id: user.id,
    action: "student.verification_screenshot.submitted",
    entity_type: "student_applications",
    entity_id: application.id,
    metadata: { portal_id: portalId },
  });

  return NextResponse.json({ success: true });
}
