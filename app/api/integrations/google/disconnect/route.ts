import { NextResponse } from "next/server";
import { academyCanConnectGoogleMeet } from "@/lib/academy-charts";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMentorWorkspace } from "@/lib/workspace";

export async function POST(request: Request) {
  const workspace = await getMentorWorkspace();
  if (!workspace) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (!academyCanConnectGoogleMeet(workspace.studentPortalFeatures)) {
    return NextResponse.json({ error: "Google Meet connection is not enabled." }, { status: 404 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const { error } = await admin.rpc("disconnect_google_calendar", {
    p_trader_id: workspace.traderId,
  });
  if (error) {
    return NextResponse.json({ error: "Could not disconnect Google." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
