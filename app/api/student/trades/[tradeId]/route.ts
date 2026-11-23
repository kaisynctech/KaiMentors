import { NextResponse } from "next/server";
import { presentTrade, tradeInputSchema, tradeRow } from "@/lib/student-trade-record";
import { requireChartStudent } from "@/lib/student-chart-access";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ tradeId: string }> },
) {
  const { tradeId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(tradeId)) {
    return NextResponse.json({ error: "Trade not found." }, { status: 404 });
  }

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
    .update(tradeRow(parsed.data, access.user.id))
    .eq("id", tradeId)
    .eq("trader_id", access.traderId)
    .eq("student_user_id", access.user.id)
    .select("id,symbol,direction,entry_price,exit_price,stop_loss,size,opened_on,closed_on,notes")
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Could not update that trade." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Trade not found." }, { status: 404 });
  return NextResponse.json({ trade: presentTrade(data) });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ tradeId: string }> },
) {
  const { tradeId } = await context.params;
  const traderId = new URL(request.url).searchParams.get("traderId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(tradeId)) {
    return NextResponse.json({ error: "Trade not found." }, { status: 404 });
  }

  const access = await requireChartStudent(traderId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const { data, error } = await access.supabase
    .from("student_trades")
    .delete()
    .eq("id", tradeId)
    .eq("trader_id", access.traderId)
    .eq("student_user_id", access.user.id)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Could not delete that trade." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Trade not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
