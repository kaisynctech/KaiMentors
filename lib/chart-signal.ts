import { z } from "zod";

const price = z.number().finite().positive().max(10_000_000);

export const chartSignalSchema = z.object({
  direction: z.enum(["buy", "sell"]),
  entry: price,
  stop: price,
  target: price,
  note: z.string().trim().max(280),
});

export type ChartSignal = z.infer<typeof chartSignalSchema>;

export type SignalGuide = {
  id: string;
  price: number;
  title: string;
  color: string;
};

export function signalGuides(signal: ChartSignal | null | undefined): SignalGuide[] {
  if (!signal) return [];
  const side = signal.direction === "buy" ? "Buy" : "Sell";
  return [
    { id: "signal-entry", price: signal.entry, title: side, color: "#111315" },
    { id: "signal-stop", price: signal.stop, title: "Stop", color: "#b42318" },
    { id: "signal-target", price: signal.target, title: "Target", color: "#0f6b3c" },
  ];
}

/** Calendar day for the academy's daily gold analysis. Johannesburg does not use daylight saving. */
export function johannesburgToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isAnalysisDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function formatAnalysisDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
