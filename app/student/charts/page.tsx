import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ContentGate } from "@/components/content-gate";
import { StudentLiveChart } from "@/components/student-live-chart";
import { StudentShell } from "@/components/student-shell";
import { academyChartConfig, academyChartsEnabled } from "@/lib/academy-charts";
import { storageSymbol } from "@/lib/chart-markets";
import { isAnalysisDate } from "@/lib/chart-signal";
import { loadLatestChartSignals } from "@/lib/chart-signal-feed";
import { portalTitle } from "@/lib/metadata";
import { createClient } from "@/lib/supabase/server";
import { loadStudentSessionContext } from "@/lib/student-access-server";
import { getStudentAcademyContext, getStudentLoginHref } from "@/lib/student-routing";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return portalTitle("Live chart");
}

export default async function StudentChartsPage({
  searchParams,
}: {
  searchParams?: Promise<{ portal?: string; symbol?: string; date?: string; view?: string }>;
}) {
  const query = await searchParams;
  const academy = await getStudentAcademyContext(query?.portal);
  const { basePath, querySuffix, joinAcademyPath } = academy;
  const home = `${basePath}${querySuffix}`;
  const chart = academyChartConfig(academy.portalSlug);
  if (!academyChartsEnabled(academy.studentPortalFeatures) || !chart) {
    redirect(home);
  }

  const supabase = await createClient();
  if (!supabase) redirect(getStudentLoginHref(academy));
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(getStudentLoginHref(academy));

  const ctx = await loadStudentSessionContext(supabase, user.id, academy);
  if (!ctx) redirect(joinAcademyPath);

  const displayName = ctx.fullName?.trim() || user.email?.split("@")[0] || "Student";
  const traderId = ctx.application.trader_id;
  const requestedSymbol = storageSymbol(query?.symbol ?? "");
  const requestedDate = query?.date && isAnalysisDate(query.date) ? query.date : null;
  const latest = ctx.hasModuleAccess ? await loadLatestChartSignals(supabase, traderId) : [];
  const matched = requestedSymbol ? latest.find((post) => post.symbol === requestedSymbol) : latest[0];
  const focus = requestedSymbol
    ? { symbol: requestedSymbol, date: requestedDate ?? matched?.date ?? null }
    : matched
      ? { symbol: matched.symbol, date: matched.date }
      : null;
  const openDaily = query?.view === "daily" || Boolean(requestedSymbol);

  return (
    <StudentShell
      academyName={ctx.portal.portal_name}
      basePath={basePath}
      displayName={displayName}
      hasModuleAccess={ctx.hasModuleAccess}
      logoPath={ctx.portal.logo_path}
      portalSlug={ctx.portal.slug}
      querySuffix={querySuffix}
      traderId={ctx.application.trader_id}
    >
      {ctx.hasModuleAccess ? (
        <StudentLiveChart focus={focus} openDaily={openDaily} traderId={traderId} />
      ) : (
        <div style={{ padding: "36px 40px 60px" }}>
          <ContentGate
            applicationStatus={ctx.application.status}
            returnPath={`${basePath}${querySuffix}`}
          />
        </div>
      )}
    </StudentShell>
  );
}
