export type AcademyChartSymbol = {
  description: string;
  proName: string;
};

export type AcademyChartConfig = {
  title: string;
  intro: string;
  symbol: string;
  timezone: string;
  ticker: AcademyChartSymbol[];
};

const DEFAULT_TICKER: AcademyChartSymbol[] = [
  { description: "Gold", proName: "OANDA:XAUUSD" },
  { description: "Gold spot", proName: "TVC:GOLD" },
  { description: "Gold futures", proName: "COMEX:GC1!" },
  { description: "Dollar index", proName: "TVC:DXY" },
];

const DEFAULT_CHART: AcademyChartConfig = {
  title: "Live chart",
  intro: "Students keep their own marks, and see the mentor's daily analysis on each market.",
  symbol: "OANDA:XAUUSD",
  timezone: "Africa/Johannesburg",
  ticker: DEFAULT_TICKER,
};

/**
 * Live chart academies. KaiSync Institution stays off.
 * A portal still needs student_portal_features.charts = true to show it.
 */
const CHARTS_BY_SLUG: Record<string, AcademyChartConfig> = {
  pasii: {
    ...DEFAULT_CHART,
    intro: "Gold for the 714 method. Students keep their own marks, and see the mentor's daily analysis.",
  },
  kaitrades: DEFAULT_CHART,
  "milkers-fx": DEFAULT_CHART,
  "traders-confidence": DEFAULT_CHART,
  "bandi-shares": DEFAULT_CHART,
};

export function academyChartConfig(
  slug: string | null | undefined,
): AcademyChartConfig | null {
  if (!slug) return null;
  return CHARTS_BY_SLUG[slug] ?? null;
}

export function academyCanConnectGoogleMeet(
  features: Record<string, boolean> | null | undefined,
): boolean {
  return features?.google_meet_connect === true;
}

export function academyChartsEnabled(
  features: Record<string, boolean> | null | undefined,
): boolean {
  return features?.charts === true;
}
