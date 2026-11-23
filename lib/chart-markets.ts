export const CHART_PRICE_MAX = 10_000_000;

export const FEATURED_MARKETS = [
  { symbol: "XAUUSD", label: "Gold", yahoo: "GC=F" },
  { symbol: "XAGUSD", label: "Silver", yahoo: "SI=F" },
  { symbol: "EURUSD", label: "EURUSD", yahoo: "EURUSD=X" },
  { symbol: "GBPUSD", label: "GBPUSD", yahoo: "GBPUSD=X" },
  { symbol: "USDJPY", label: "USDJPY", yahoo: "USDJPY=X" },
  { symbol: "USDCHF", label: "USDCHF", yahoo: "USDCHF=X" },
  { symbol: "AUDUSD", label: "AUDUSD", yahoo: "AUDUSD=X" },
  { symbol: "USDCAD", label: "USDCAD", yahoo: "USDCAD=X" },
  { symbol: "BTCUSD", label: "Bitcoin", yahoo: "BTC-USD" },
  { symbol: "ETHUSD", label: "Ethereum", yahoo: "ETH-USD" },
  { symbol: "USOIL", label: "US oil", yahoo: "CL=F" },
  { symbol: "US500", label: "US 500", yahoo: "ES=F" },
  { symbol: "NAS100", label: "Nasdaq", yahoo: "NQ=F" },
] as const;

const SYMBOL_PATTERN = /^[A-Z0-9^=.\-]{1,24}$/;
const SEARCH_TYPES = new Set(["CURRENCY", "EQUITY", "CRYPTOCURRENCY", "FUTURE", "INDEX", "ETF"]);

export function storageSymbol(input: string): string | null {
  const raw = input.trim().toUpperCase();
  if (!SYMBOL_PATTERN.test(raw)) return null;
  if (raw === "GC=F" || raw === "XAUUSD") return "XAUUSD";
  const featured = FEATURED_MARKETS.find((item) => item.symbol === raw || item.yahoo === raw);
  return featured ? featured.symbol : raw;
}

export function yahooTicker(symbol: string): string {
  const featured = FEATURED_MARKETS.find((item) => item.symbol === symbol);
  return featured?.yahoo ?? symbol;
}

export function marketLabel(symbol: string): string {
  return FEATURED_MARKETS.find((item) => item.symbol === symbol)?.label ?? symbol;
}

export function priceSourceNote(symbol: string): string {
  if (symbol === "XAUUSD") {
    return "Gold prices are COMEX futures from Yahoo, not the spot price on your broker. Refresh to update the latest candle.";
  }
  return "Prices come from Yahoo and can differ from your broker. Refresh to update the latest candle.";
}

/** Adds the market and day to a chart link, keeping any query the base path already has. */
export function chartFocusHref(base: string, symbol: string, date: string, openDaily = false): string {
  const url = new URL(base, "http://chart.local");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("date", date);
  if (openDaily) url.searchParams.set("view", "daily");
  return `${url.pathname}${url.search}`;
}

export function formatChartPrice(price: number): string {
  if (!Number.isFinite(price)) return "";
  if (Math.abs(price) >= 1000) return price.toFixed(2);
  if (Math.abs(price) >= 10) return price.toFixed(3);
  return price.toFixed(5);
}

export function roundChartPrice(price: number): number {
  return Number(formatChartPrice(price));
}

export function parseYahooSearch(payload: unknown): Array<{ symbol: string; label: string }> {
  if (!payload || typeof payload !== "object") return [];
  const quotes = (payload as { quotes?: unknown[] }).quotes;
  if (!Array.isArray(quotes)) return [];
  const seen = new Set<string>();
  const markets: Array<{ symbol: string; label: string }> = [];
  for (const quote of quotes) {
    if (!quote || typeof quote !== "object") continue;
    const row = quote as { symbol?: unknown; shortname?: unknown; quoteType?: unknown };
    if (typeof row.quoteType !== "string" || !SEARCH_TYPES.has(row.quoteType)) continue;
    if (typeof row.symbol !== "string") continue;
    const symbol = storageSymbol(row.symbol);
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    const label = typeof row.shortname === "string" && row.shortname.trim() ? row.shortname.trim() : symbol;
    markets.push({ symbol, label });
    if (markets.length === 8) break;
  }
  return markets;
}
