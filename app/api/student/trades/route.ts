import { NextResponse } from "next/server";
import { presentTrade, tradeInputSchema, tradeRow } from "@/lib/student-trade-record";
import { requireChartStudent } from "@/lib/student-chart-access";

export async function GET(request: Request) {
  const traderId = new URL(request.url).searchParams.get("traderId") ?? "";
  const access = await requireChartStudent(traderId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const { data, error } = await access.supabase
    .from("student_trades")
    .select("id,symbol,direction,entry_price,exit_price,stop_loss,size,opened_on,closed_on,notes")
    .eq("trader_id", access.traderId)
    .eq("student_user_id", access.user.id)
    .order("opened_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Could not load your trades." }, { status: 500 });
  return NextResponse.json({ trades: (data ?? []).map(presentTrade) });
}

export async function POST(request: Request) {
  const parsed = tradeInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Check the trade details." },
      { status: 400 },
    );
  }

  const access = await requireChartStudent(parsed.data.traderId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const { data, error } = await access.supabase
    .from("student_trades")
    .insert(tradeRow(parsed.data, access.user.id))
    .select("id,symbol,direction,entry_price,exit_price,stop_loss,size,opened_on,closed_on,notes")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Could not save that trade." }, { status: 500 });
  }
  return NextResponse.json({ trade: presentTrade(data) }, { status: 201 });
}
