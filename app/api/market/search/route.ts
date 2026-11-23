import { NextResponse } from "next/server";
import { parseYahooSearch } from "@/lib/chart-markets";
import { requireChartViewer } from "@/lib/student-chart-access";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const traderId = url.searchParams.get("traderId") ?? "";
  const query = (url.searchParams.get("q") ?? "").trim();
  if (query.length < 2 || query.length > 40) {
    return NextResponse.json({ markets: [] }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const access = await requireChartViewer(traderId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const upstream = await fetch(
    `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=12&newsCount=0`,
    { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" } },
  );
  const payload = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    return NextResponse.json({ markets: [] }, { headers: { "Cache-Control": "private, no-store" } });
  }
  return NextResponse.json(
    { markets: parseYahooSearch(payload) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
