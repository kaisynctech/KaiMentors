import { NextResponse } from "next/server";
import { fanOutChartSignal } from "@/lib/chart-signal-notify";
import { z } from "zod";
import { chartDrawingsSchema } from "@/lib/chart-drawings";
import { roundChartPrice, storageSymbol } from "@/lib/chart-markets";
import { chartSignalSchema, isAnalysisDate, johannesburgToday, type ChartSignal } from "@/lib/chart-signal";
import { isGoldChartInterval } from "@/lib/gold-candles";
import { requireChartMentor, requireChartViewer } from "@/lib/student-chart-access";

const headers = { "Cache-Control": "private, no-store" };

const drawingsBody = z.object({
  traderId: z.string().uuid(),
  symbol: z.string(),
  interval: z.enum(["15", "60", "D"]),
  date: z.string(),
  drawings: chartDrawingsSchema,
});

const signalBody = z.object({
  traderId: z.string().uuid(),
  symbol: z.string(),
  date: z.string(),
  signal: chartSignalSchema.nullable(),
});

const deleteBody = z.object({
  traderId: z.string().uuid(),
  symbol: z.string(),
  date: z.string(),
});

function roundSignal(signal: ChartSignal): ChartSignal {
  return {
    direction: signal.direction,
    entry: roundChartPrice(signal.entry),
    stop: roundChartPrice(signal.stop),
    target: roundChartPrice(signal.target),
    note: signal.note,
  };
}

function acceptedDate(value: string | null, today: string) {
  if (!value || !isAnalysisDate(value) || value > today) return null;
  return value;
}

type Viewer = Extract<Awaited<ReturnType<typeof requireChartViewer>>, { ok: true }>;

async function analysisDates(supabase: Viewer["supabase"], traderId: string, symbol: string) {
  const [marks, signals] = await Promise.all([
    supabase
      .from("mentor_chart_markups")
      .select("analysis_date")
      .eq("trader_id", traderId)
      .eq("symbol", symbol)
      .order("analysis_date", { ascending: false })
      .limit(90),
    supabase
      .from("mentor_chart_signals")
      .select("analysis_date")
      .eq("trader_id", traderId)
      .eq("symbol", symbol)
      .order("analysis_date", { ascending: false })
      .limit(90),
  ]);
  const dates = new Set<string>();
  for (const row of [...(marks.data ?? []), ...(signals.data ?? [])]) {
    if (typeof row.analysis_date === "string") dates.add(row.analysis_date);
  }
  return [...dates].sort().reverse();
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

  const access = await requireChartViewer(traderId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const today = johannesburgToday();
  const dates = await analysisDates(access.supabase, access.traderId, symbol);
  const requested = acceptedDate(url.searchParams.get("date"), today);
  const start = url.searchParams.get("start") === "latest" ? "latest" : "today";
  const date = requested ?? (start === "latest" ? dates[0] ?? null : today);
  if (!date) {
    return NextResponse.json({ symbol, date: null, dates, drawings: [], signal: null }, { headers });
  }

  const [marks, signalRow] = await Promise.all([
    access.supabase
      .from("mentor_chart_markups")
      .select("drawings")
      .eq("trader_id", access.traderId)
      .eq("symbol", symbol)
      .eq("interval", interval)
      .eq("analysis_date", date)
      .maybeSingle(),
    access.supabase
      .from("mentor_chart_signals")
      .select("signal")
      .eq("trader_id", access.traderId)
      .eq("symbol", symbol)
      .eq("analysis_date", date)
      .maybeSingle(),
  ]);
  if (marks.error || signalRow.error) {
    return NextResponse.json({ error: "Could not load the daily analysis." }, { status: 500 });
  }

  const drawings = chartDrawingsSchema.safeParse(marks.data?.drawings ?? []);
  const parsedSignal = signalRow.data?.signal
    ? chartSignalSchema.safeParse(signalRow.data.signal)
    : null;

  return NextResponse.json(
    {
      symbol,
      date,
      dates,
      drawings: drawings.success ? drawings.data : [],
      signal: parsedSignal?.success ? parsedSignal.data : null,
    },
    { headers },
  );
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  const traderId = typeof body?.traderId === "string" ? body.traderId : "";
  const access = await requireChartMentor(traderId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const today = johannesburgToday();

  if (body && typeof body === "object" && "drawings" in body) {
    const parsed = drawingsBody.safeParse(body);
    const symbol = parsed.success ? storageSymbol(parsed.data.symbol) : null;
    const date = parsed.success ? acceptedDate(parsed.data.date, today) : null;
    if (!parsed.success || !symbol || !date) {
      return NextResponse.json({ error: "Those chart marks are not valid." }, { status: 400 });
    }
    const { error } = await access.supabase.from("mentor_chart_markups").upsert(
      {
        trader_id: access.traderId,
        symbol,
        interval: parsed.data.interval,
        analysis_date: date,
        drawings: parsed.data.drawings,
        updated_by: access.user.id,
      },
      { onConflict: "trader_id,symbol,analysis_date,interval" },
    );
    if (error) return NextResponse.json({ error: "Could not save those marks." }, { status: 500 });
    return NextResponse.json({ ok: true, date, symbol });
  }

  const parsed = signalBody.safeParse(body);
  const symbol = parsed.success ? storageSymbol(parsed.data.symbol) : null;
  const date = parsed.success ? acceptedDate(parsed.data.date, today) : null;
  if (!parsed.success || !symbol || !date) {
    return NextResponse.json({ error: "That signal is not valid." }, { status: 400 });
  }

  if (!parsed.data.signal) {
    const { error } = await access.supabase
      .from("mentor_chart_signals")
      .delete()
      .eq("trader_id", access.traderId)
      .eq("symbol", symbol)
      .eq("analysis_date", date);
    if (error) return NextResponse.json({ error: "Could not clear that signal." }, { status: 500 });
    return NextResponse.json({ ok: true, date, symbol, signal: null });
  }

  const signal = roundSignal(parsed.data.signal);
  const { error } = await access.supabase.from("mentor_chart_signals").upsert(
    {
      trader_id: access.traderId,
      symbol,
      analysis_date: date,
      signal,
      updated_by: access.user.id,
    },
    { onConflict: "trader_id,symbol,analysis_date" },
  );
  if (error) return NextResponse.json({ error: "Could not save that signal." }, { status: 500 });
  try {
    await fanOutChartSignal({
      traderId: access.traderId,
      host: request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "",
      symbol,
      date,
      signal,
    });
  } catch (notifyError) {
    console.error("Chart signal notification failed:", notifyError);
  }
  return NextResponse.json({ ok: true, date, symbol, signal });
}

export async function DELETE(request: Request) {
  const parsed = deleteBody.safeParse(await request.json().catch(() => null));
  const traderId = parsed.success ? parsed.data.traderId : "";
  const access = await requireChartMentor(traderId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const symbol = parsed.success ? storageSymbol(parsed.data.symbol) : null;
  const date = parsed.success ? acceptedDate(parsed.data.date, johannesburgToday()) : null;
  if (!symbol || !date) {
    return NextResponse.json({ error: "Choose the day to delete." }, { status: 400 });
  }

  const [marks, signal] = await Promise.all([
    access.supabase
      .from("mentor_chart_markups")
      .delete()
      .eq("trader_id", access.traderId)
      .eq("symbol", symbol)
      .eq("analysis_date", date),
    access.supabase
      .from("mentor_chart_signals")
      .delete()
      .eq("trader_id", access.traderId)
      .eq("symbol", symbol)
      .eq("analysis_date", date),
  ]);
  if (marks.error || signal.error) {
    return NextResponse.json({ error: "Could not delete that day." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
