import type { SupabaseClient } from "@supabase/supabase-js";
import { chartSignalSchema, type ChartSignal } from "@/lib/chart-signal";

export type ChartSignalPost = {
  symbol: string;
  date: string;
  signal: ChartSignal;
};

type SignalRow = {
  symbol: string;
  analysis_date: string;
  signal: unknown;
};

/** Signals from the newest day that has one. Older days stay stored and are not included here. */
export async function loadLatestChartSignals(
  supabase: SupabaseClient,
  traderId: string,
): Promise<ChartSignalPost[]> {
  const { data } = await supabase
    .from("mentor_chart_signals")
    .select("symbol, analysis_date, signal")
    .eq("trader_id", traderId)
    .order("analysis_date", { ascending: false })
    .limit(30);

  const posts: ChartSignalPost[] = [];
  let newest: string | null = null;
  for (const row of (data ?? []) as SignalRow[]) {
    const parsed = chartSignalSchema.safeParse(row.signal);
    if (!parsed.success || !row.analysis_date || !row.symbol) continue;
    newest ??= row.analysis_date;
    if (row.analysis_date !== newest) break;
    posts.push({ symbol: row.symbol, date: row.analysis_date, signal: parsed.data });
  }
  return posts;
}
