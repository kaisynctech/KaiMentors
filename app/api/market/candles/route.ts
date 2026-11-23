import { NextResponse } from "next/server";
import { isGoldChartInterval, parseYahooGoldChart, yahooGoldRequest } from "@/lib/gold-candles";
import { storageSymbol, yahooTicker } from "@/lib/chart-markets";
import { requireChartViewer } from "@/lib/student-chart-access";

const cache = new Map<string, { at: number; body: unknown }>();
const CACHE_MS = 60_000;
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const traderId = url.searchParams.get("traderId") ?? "";
  const intervalParam = url.searchParams.get("interval") ?? "60";
  const symbol = storageSymbol(url.searchParams.get("symbol") ?? "XAUUSD");
  if (!isGoldChartInterval(intervalParam)) {
    return NextResponse.json({ error: "Choose 15, 60, or D." }, { status: 400 });
  }
  if (!symbol) return NextResponse.json({ error: "Choose a market." }, { status: 400 });

  const access = await requireChartViewer(traderId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const cacheKey = `${symbol}:${intervalParam}`;
  const cached = cache.get(cacheKey);
  const fresh = url.searchParams.get("fresh") === "1";
  if (!fresh && cached && Date.now() - cached.at < CACHE_MS) {
    return NextResponse.json(cached.body, { headers });
  }

  const query = yahooGoldRequest(intervalParam);
  const ticker = encodeURIComponent(yahooTicker(symbol));
  const upstream = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${query.interval}&range=${query.range}`,
    { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" } },
  );
  const payload = await upstream.json().catch(() => null);
  const candles = parseYahooGoldChart(payload);
  if (!upstream.ok || candles.length === 0) {
    return NextResponse.json({ error: "This market is unavailable right now." }, { status: 502 });
  }

  const body = { symbol, label: symbol, interval: intervalParam, candles };
  cache.set(cacheKey, { at: Date.now(), body });
  return NextResponse.json(body, { headers });
}
