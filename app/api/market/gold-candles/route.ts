import { NextResponse } from "next/server";
import { isGoldChartInterval, parseYahooGoldChart, yahooGoldRequest } from "@/lib/gold-candles";
import { requireChartViewer } from "@/lib/student-chart-access";

const cache = new Map<string, { at: number; body: unknown }>();
const CACHE_MS = 60_000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const traderId = url.searchParams.get("traderId") ?? "";
  const intervalParam = url.searchParams.get("interval") ?? "60";
  if (!isGoldChartInterval(intervalParam)) {
    return NextResponse.json({ error: "Choose 15, 60, or D." }, { status: 400 });
  }

  const access = await requireChartViewer(traderId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const cached = cache.get(intervalParam);
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return NextResponse.json(cached.body, { headers: { "Cache-Control": "private, no-store" } });
  }

  const query = yahooGoldRequest(intervalParam);
  const upstream = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=${query.interval}&range=${query.range}`,
    { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" } },
  );
  const payload = await upstream.json().catch(() => null);
  const candles = parseYahooGoldChart(payload);
  if (!upstream.ok || candles.length === 0) {
    return NextResponse.json({ error: "Gold prices are unavailable right now." }, { status: 502 });
  }

  const body = {
    symbol: "GC=F",
    label: "Gold futures",
    interval: intervalParam,
    candles,
  };
  cache.set(intervalParam, { at: Date.now(), body });
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
