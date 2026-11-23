export type GoldCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export const GOLD_CHART_INTERVALS = ["15", "60", "D"] as const;
export type GoldChartInterval = (typeof GOLD_CHART_INTERVALS)[number];

export function isGoldChartInterval(value: string): value is GoldChartInterval {
  return (GOLD_CHART_INTERVALS as readonly string[]).includes(value);
}

export function yahooGoldRequest(interval: GoldChartInterval) {
  if (interval === "15") return { interval: "15m", range: "5d" };
  if (interval === "60") return { interval: "60m", range: "1mo" };
  return { interval: "1d", range: "1y" };
}

export function parseYahooGoldChart(payload: unknown): GoldCandle[] {
  if (!payload || typeof payload !== "object") return [];
  const result = (payload as { chart?: { result?: unknown[] } }).chart?.result?.[0];
  if (!result || typeof result !== "object") return [];
  const row = result as {
    timestamp?: unknown[];
    indicators?: { quote?: Array<Record<string, unknown[] | undefined>> };
  };
  const times = row.timestamp;
  const quote = row.indicators?.quote?.[0];
  if (!Array.isArray(times) || !quote) return [];

  const candles: GoldCandle[] = [];
  for (let index = 0; index < times.length; index += 1) {
    const time = times[index];
    const open = quote.open?.[index];
    const high = quote.high?.[index];
    const low = quote.low?.[index];
    const close = quote.close?.[index];
    if (
      typeof time !== "number" ||
      typeof open !== "number" ||
      typeof high !== "number" ||
      typeof low !== "number" ||
      typeof close !== "number"
    ) {
      continue;
    }
    candles.push({ time, open, high, low, close });
  }
  return candles;
}
