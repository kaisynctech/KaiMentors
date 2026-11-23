import "server-only";
import { chartFocusHref, formatChartPrice, marketLabel } from "@/lib/chart-markets";
import type { ChartSignal } from "@/lib/chart-signal";
import { isPlatformHostname, normalizeRequestHostname } from "@/lib/domains/hostnames";
import { createNotification } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWebPushToTraderStudents } from "@/lib/web-push";

function chartPath(host: string, portalSlug: string | null, symbol: string, date: string) {
  const platform = isPlatformHostname(normalizeRequestHostname(host));
  const base = platform
    ? `/student/charts${portalSlug ? `?portal=${encodeURIComponent(portalSlug)}` : ""}`
    : "/academy/charts";
  return chartFocusHref(base, symbol, date, true);
}

export async function fanOutChartSignal(params: {
  traderId: string;
  host: string;
  symbol: string;
  date: string;
  signal: ChartSignal;
}) {
  const admin = createAdminClient();
  if (!admin) return;

  const [{ data: portal }, { data: students }] = await Promise.all([
    admin.from("portals").select("portal_name, slug").eq("trader_id", params.traderId).maybeSingle(),
    admin
      .from("student_applications")
      .select("student_user_id")
      .eq("trader_id", params.traderId)
      .eq("status", "verified"),
  ]);

  const studentIds = (students ?? []).map((row) => row.student_user_id).filter(Boolean);
  if (!portal || studentIds.length === 0) return;

  const side = params.signal.direction === "buy" ? "Buy" : "Sell";
  const title = `${side} ${marketLabel(params.symbol)}`;
  const body = `Entry ${formatChartPrice(params.signal.entry)} · Stop ${formatChartPrice(params.signal.stop)} · Target ${formatChartPrice(params.signal.target)}`;
  const slug = typeof portal.slug === "string" ? portal.slug : null;

  await Promise.all(
    studentIds.map((userId) =>
      createNotification({
        userId,
        traderId: params.traderId,
        type: "chart_signal",
        title,
        body,
        metadata: { symbol: params.symbol, date: params.date },
      }),
    ),
  );

  await sendWebPushToTraderStudents({
    traderId: params.traderId,
    portalSlug: slug,
    payload: {
      title: portal.portal_name,
      body: title,
      url: chartPath(params.host, slug, params.symbol, params.date),
      tag: `chart-signal-${params.traderId}-${params.symbol}-${params.date}`,
    },
    resolveUrl: (origin) => {
      let host = params.host;
      try {
        host = new URL(origin).host;
      } catch {
        // keep the request host
      }
      return new URL(chartPath(host, slug, params.symbol, params.date), origin).href;
    },
  });
}
