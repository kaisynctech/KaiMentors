import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { MentorLiveChart } from "@/components/mentor-live-chart";
import { academyChartConfig, academyChartsEnabled } from "@/lib/academy-charts";
import { getMentorWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function MentorChartsPage({
  searchParams,
}: {
  searchParams?: Promise<{ symbol?: string; date?: string }>;
}) {
  const query = await searchParams;
  const workspace = await getMentorWorkspace();
  if (!workspace) redirect("/login");
  if (
    !academyChartsEnabled(workspace.studentPortalFeatures) ||
    !academyChartConfig(workspace.portal.slug)
  ) {
    redirect("/dashboard");
  }

  return (
    <DashboardShell
      activePath="/dashboard/charts"
      description="Draw on any market and set the signal for that day. Older days stay until you delete them. Students see the latest signal on their dashboard."
      portalName={workspace.portal.portal_name}
      portalSlug={workspace.portal.slug}
      title="Live chart"
      traderId={workspace.traderId}
      userLabel={workspace.displayName}
    >
      <MentorLiveChart date={query?.date} symbol={query?.symbol} traderId={workspace.traderId} />
    </DashboardShell>
  );
}
