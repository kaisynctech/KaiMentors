import { NextResponse } from "next/server";
import { z } from "zod";
import { getMentorWorkspace } from "@/lib/workspace";
import { requirePlatformAdminApi } from "@/lib/admin-api";

const schema = z.object({
  action: z.literal("rollback"),
  releaseId: z.string().uuid(),
});

export async function POST(request: Request) {
  if (!(await requirePlatformAdminApi())) {
    return NextResponse.json({ error: "Super admin access is required." }, { status: 403 });
  }
  const workspace = await getMentorWorkspace();
  if (!workspace) {
    return NextResponse.json(
      { error: "Please sign in to your mentor workspace." },
      { status: 401 },
    );
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "The release request is invalid." },
      { status: 400 },
    );
  }

  const { error } = await workspace.supabase.rpc("rollback_website_release", {
    target_portal_id: workspace.portal.id,
    target_release_id: parsed.data.releaseId,
  });
  if (error) {
    return NextResponse.json(
      { error: "The selected website release could not be restored." },
      { status: 400 },
    );
  }

  return NextResponse.json({ status: "rolled_back" });
}
