import { NextResponse } from "next/server";
import { z } from "zod";
import { fanOutDailySignalNotifications } from "@/lib/signal-notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMentorWorkspace } from "@/lib/workspace";

const schema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(5000),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Title and body are required." },
      { status: 400 },
    );
  }

  const workspace = await getMentorWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: signalId, error } = await workspace.supabase.rpc(
    "post_daily_signal",
    {
      target_title: parsed.data.title,
      target_body: parsed.data.body,
    },
  );

  if (error || !signalId) {
    return NextResponse.json(
      { error: "The signal could not be posted." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  if (admin) {
    const [{ data: signal }, { data: portal }] = await Promise.all([
      admin
        .from("daily_signals")
        .select("title,body,conversation_id,signal_date")
        .eq("id", signalId)
        .maybeSingle(),
      admin
        .from("portals")
        .select("portal_name,slug")
        .eq("trader_id", workspace.traderId)
        .maybeSingle(),
    ]);

    if (signal) {
      const iconQuery = portal?.slug
        ? `?portal=${encodeURIComponent(portal.slug)}`
        : "";
      await fanOutDailySignalNotifications({
        traderId: workspace.traderId,
        portalName: portal?.portal_name ?? "Academy",
        portalSlug: portal?.slug ?? null,
        title: signal.title,
        body: signal.body,
        conversationId: signal.conversation_id,
        signalDate: signal.signal_date,
        iconUrl: `/api/pwa/icon/192${iconQuery}`,
      });
    }
  }

  return NextResponse.json({ signalId }, { status: 201 });
}
