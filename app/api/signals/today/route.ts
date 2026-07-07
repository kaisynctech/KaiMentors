import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const traderId = new URL(request.url).searchParams.get("traderId") ?? "";
  if (!traderId) {
    return NextResponse.json({ error: "traderId required." }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: traderRow } = await supabase
    .from("traders")
    .select("timezone")
    .eq("id", traderId)
    .maybeSingle();

  const timezone = traderRow?.timezone ?? "UTC";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: timezone });

  const { data: signal, error } = await supabase
    .from("daily_signals")
    .select("id,title,body,signal_date,conversation_id,message_id,created_at")
    .eq("trader_id", traderId)
    .eq("signal_date", today)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Today's signal could not be loaded." },
      { status: 403 },
    );
  }

  return NextResponse.json({
    signal: signal
      ? {
          id: signal.id,
          title: signal.title,
          body: signal.body,
          signalDate: signal.signal_date,
          conversationId: signal.conversation_id,
          messageId: signal.message_id,
          createdAt: signal.created_at,
        }
      : null,
  });
}
