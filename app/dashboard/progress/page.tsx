import { redirect } from "next/navigation";
import { AcademyProgressPulse } from "@/components/academy-progress-pulse";
import { DashboardShell } from "@/components/dashboard-shell";
import { loadAcademyProgressPulse } from "@/lib/academy-progress-server";
import { PULSE_BUCKETS, type PulseBucket } from "@/lib/academy-progress";
import { isPortalFeatureEnabled } from "@/lib/portal-features";
import { getMentorWorkspace } from "@/lib/workspace";

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AcademyProgressPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const workspace = await getMentorWorkspace();
  if (!workspace) redirect("/login");
  if (
    !isPortalFeatureEnabled(
      workspace.studentPortalFeatures,
      "courses",
      workspace.accessModel,
    )
  ) {
    redirect("/dashboard");
  }

  const query = await searchParams;
  const courseId = firstValue(query.course) || "";
  const groupId = firstValue(query.group) || "";
  const requestedBucket = firstValue(query.bucket);
  const bucket =
    requestedBucket && (PULSE_BUCKETS as readonly string[]).includes(requestedBucket)
      ? (requestedBucket as PulseBucket)
      : "all";

  const pulse = await loadAcademyProgressPulse(workspace.supabase, workspace.traderId, {
    courseId: courseId || null,
    groupId: groupId || null,
  });

  const messagesEnabled = isPortalFeatureEnabled(
    workspace.studentPortalFeatures,
    "messages",
    workspace.accessModel,
  );
  const bookingsEnabled = isPortalFeatureEnabled(
    workspace.studentPortalFeatures,
    "bookings",
    workspace.accessModel,
  );

  return (
    <DashboardShell
      activePath="/dashboard/progress"
      description="See who is ahead, who is stuck, and who has not started — then nudge, message, or book from here."
      title="Academy progress"
      userLabel={workspace.displayName}
      traderId={workspace.traderId}
      portalName={workspace.portal.portal_name}
      portalSlug={workspace.portal.slug}
    >
      <AcademyProgressPulse
        bookingsEnabled={bookingsEnabled}
        bucket={bucket}
        courseId={courseId}
        groupId={groupId}
        messagesEnabled={messagesEnabled}
        pulse={pulse}
      />
    </DashboardShell>
  );
}
