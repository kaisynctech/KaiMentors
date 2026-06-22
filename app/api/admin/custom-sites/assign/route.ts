import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("assign"),
    portalId: z.string().uuid(),
    packageId: z.string().uuid(),
    showPoweredBy: z.boolean(),
  }),
  z.object({
    action: z.literal("set_mode"),
    portalId: z.string().uuid(),
    mode: z.enum(["core_page", "builder_template", "custom_package", "external_website"]),
  }),
]);

async function requireSuperAdmin() {
  const supabase = await createClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "super_admin") return null;
  return supabase;
}

export async function POST(request: Request) {
  const supabase = await requireSuperAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Super admin access is required." },
      { status: 403 },
    );
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check the custom site assignment details." },
      { status: 400 },
    );
  }

  const input = parsed.data;
  if (input.action === "assign") {
    const { data, error } = await supabase.rpc("assign_custom_site_package", {
      target_portal_id: input.portalId,
      target_package_id: input.packageId,
      target_status: "active",
      target_show_powered_by: input.showPoweredBy,
    });
    if (error) {
      return NextResponse.json(
        { error: "The custom package could not be assigned." },
        { status: 400 },
      );
    }
    return NextResponse.json({ status: "assigned", assignmentId: data });
  }

  const { error } = await supabase.rpc("set_website_delivery_mode", {
    target_portal_id: input.portalId,
    target_mode: input.mode,
  });
  if (error) {
    return NextResponse.json(
      { error: "The website delivery mode could not be updated." },
      { status: 400 },
    );
  }
  return NextResponse.json({ status: "mode_updated" });
}
