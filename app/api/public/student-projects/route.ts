import { NextResponse } from "next/server";
import { isPortalSlug } from "@/lib/academy-routes";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const portalSlug = new URL(request.url).searchParams.get("portal");
  if (!isPortalSlug(portalSlug)) {
    return NextResponse.json({ error: "Invalid academy." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Projects are unavailable." }, { status: 503 });
  }

  const { data: portal } = await admin
    .from("portals")
    .select("trader_id")
    .eq("slug", portalSlug)
    .maybeSingle();
  if (!portal?.trader_id) {
    return NextResponse.json({ error: "Academy not found." }, { status: 404 });
  }

  const { data, error } = await admin
    .from("student_projects")
    .select(
      "id,title,student_name,description,category,live_url,github_url,thumbnail_url,tools,featured,published,created_at",
    )
    .eq("trader_id", portal.trader_id)
    .eq("published", true)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Projects could not be loaded." }, { status: 400 });
  }

  return NextResponse.json(data ?? []);
}
