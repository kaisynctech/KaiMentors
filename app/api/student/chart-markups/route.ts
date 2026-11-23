import { NextResponse } from "next/server";
import { z } from "zod";
import { chartDrawingsSchema } from "@/lib/chart-drawings";
import { storageSymbol } from "@/lib/chart-markets";
import { isAnalysisDate, johannesburgToday } from "@/lib/chart-signal";
import { isGoldChartInterval } from "@/lib/gold-candles";
import { requireChartStudent } from "@/lib/student-chart-access";

const headers = { "Cache-Control": "private, no-store" };

const saveSchema = z.object({
  traderId: z.string().uuid(),
  symbol: z.string(),
  interval: z.enum(["15", "60", "D"]),
  date: z.string(),
  drawings: chartDrawingsSchema,
});

const deleteSchema = z.object({
  traderId: z.string().uuid(),
  symbol: z.string(),
  date: z.string(),
});

function acceptedDate(value: string | null, today: string) {
  if (!value || !isAnalysisDate(value) || value > today) return null;
  return value;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const traderId = url.searchParams.get("traderId") ?? "";
  const interval = url.searchParams.get("interval") ?? "60";
  const symbol = storageSymbol(url.searchParams.get("symbol") ?? "XAUUSD");
  if (!isGoldChartInterval(interval)) {
    return NextResponse.json({ error: "Choose 15, 60, or D." }, { status: 400 });
  }
  if (!symbol) return NextResponse.json({ error: "Choose a market." }, { status: 400 });

  const access = await requireChartStudent(traderId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const today = johannesburgToday();
  const { data: dayRows, error: dayError } = await access.supabase
    .from("student_chart_markups")
    .select("analysis_date")
    .eq("trader_id", access.traderId)
    .eq("student_user_id", access.user.id)
    .eq("symbol", symbol)
    .order("analysis_date", { ascending: false })
    .limit(90);
  if (dayError) return NextResponse.json({ error: "Could not load your marks." }, { status: 500 });

  const dates = [...new Set((dayRows ?? []).map((row) => row.analysis_date).filter((value): value is string => typeof value === "string"))];
  const requested = acceptedDate(url.searchParams.get("date"), today);
  const date = requested ?? today;

  const { data, error } = await access.supabase
    .from("student_chart_markups")
    .select("drawings")
    .eq("trader_id", access.traderId)
    .eq("student_user_id", access.user.id)
    .eq("symbol", symbol)
    .eq("interval", interval)
    .eq("analysis_date", date)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not load your marks." }, { status: 500 });

  const parsed = chartDrawingsSchema.safeParse(data?.drawings ?? []);
  return NextResponse.json(
    { symbol, date, dates, drawings: parsed.success ? parsed.data : [], signal: null },
    { headers },
  );
}

export async function PUT(request: Request) {
  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  const symbol = parsed.success ? storageSymbol(parsed.data.symbol) : null;
  const date = parsed.success ? acceptedDate(parsed.data.date, johannesburgToday()) : null;
  if (!parsed.success || !symbol || !date) {
    return NextResponse.json({ error: "Those chart marks are not valid." }, { status: 400 });
  }

  const access = await requireChartStudent(parsed.data.traderId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const { error } = await access.supabase.from("student_chart_markups").upsert(
    {
      trader_id: access.traderId,
      student_user_id: access.user.id,
      symbol,
      interval: parsed.data.interval,
      analysis_date: date,
      drawings: parsed.data.drawings,
    },
    { onConflict: "trader_id,student_user_id,symbol,interval,analysis_date" },
  );

  if (error) return NextResponse.json({ error: "Could not save your marks." }, { status: 500 });
  return NextResponse.json({ ok: true, date, symbol });
}

export async function DELETE(request: Request) {
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  const symbol = parsed.success ? storageSymbol(parsed.data.symbol) : null;
  const date = parsed.success ? acceptedDate(parsed.data.date, johannesburgToday()) : null;
  if (!parsed.success || !symbol || !date) {
    return NextResponse.json({ error: "Choose the day to delete." }, { status: 400 });
  }

  const access = await requireChartStudent(parsed.data.traderId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const { error } = await access.supabase
    .from("student_chart_markups")
    .delete()
    .eq("trader_id", access.traderId)
    .eq("student_user_id", access.user.id)
    .eq("symbol", symbol)
    .eq("analysis_date", date);
  if (error) return NextResponse.json({ error: "Could not delete that day." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
