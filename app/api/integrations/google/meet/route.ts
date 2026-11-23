import { NextResponse } from "next/server";
import { z } from "zod";
import { academyCanConnectGoogleMeet } from "@/lib/academy-charts";
import { createGoogleMeetLink, googleOAuthConfigured } from "@/lib/google-meet";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMentorWorkspace } from "@/lib/workspace";

const schema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(600).nullable().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable().optional(),
});

export async function POST(request: Request) {
  const workspace = await getMentorWorkspace();
  if (!workspace) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (!academyCanConnectGoogleMeet(workspace.studentPortalFeatures)) {
    return NextResponse.json({ error: "Google Meet connection is not enabled." }, { status: 404 });
  }
  if (!googleOAuthConfigured()) {
    return NextResponse.json(
      { error: "Google Meet creation is not configured yet. Paste a Meet link instead." },
      { status: 503 },
    );
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid class details." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const { data: refreshToken, error } = await admin.rpc("read_google_calendar_refresh_token", {
    p_trader_id: workspace.traderId,
  });
  if (error || typeof refreshToken !== "string" || refreshToken.length < 10) {
    return NextResponse.json(
      { error: "Connect the academy Google account before creating a Meet link." },
      { status: 409 },
    );
  }

  const created = await createGoogleMeetLink({
    refreshToken,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    startsAt: parsed.data.startsAt,
    endsAt: parsed.data.endsAt ?? null,
    timeZone: workspace.timezone,
  });
  if ("error" in created) {
    return NextResponse.json({ error: created.error }, { status: 502 });
  }

  return NextResponse.json({ joinUrl: created.joinUrl });
}
