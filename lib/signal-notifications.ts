import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";
import { sendWebPushToTraderStudents } from "@/lib/web-push";

function truncateBody(body: string, max = 140) {
  const normalized = body.trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1).trim()}…`;
}

export async function fanOutDailySignalNotifications(params: {
  traderId: string;
  portalName: string;
  portalSlug: string | null;
  title: string;
  body: string;
  conversationId: string;
  signalDate: string;
  iconUrl?: string;
}) {
  const admin = createAdminClient();
  if (!admin) return;

  const { data: students } = await admin
    .from("student_applications")
    .select("student_user_id")
    .eq("trader_id", params.traderId)
    .eq("status", "verified");

  const studentIds = (students ?? []).map((row) => row.student_user_id);
  if (!studentIds.length) return;

  const notificationTitle = `Signal: ${params.title}`;
  const notificationBody = truncateBody(params.body);

  await Promise.all(
    studentIds.map((userId) =>
      createNotification({
        userId,
        traderId: params.traderId,
        type: "daily_signal",
        title: notificationTitle,
        body: notificationBody,
        conversationId: params.conversationId,
        metadata: {
          conversationId: params.conversationId,
        },
      }),
    ),
  );

  await sendWebPushToTraderStudents({
    traderId: params.traderId,
    portalSlug: params.portalSlug,
    iconUrl: params.iconUrl,
    payload: {
      title: params.portalName,
      body: notificationTitle,
      url: `/student/messages?${params.portalSlug ? `portal=${encodeURIComponent(params.portalSlug)}&` : ""}conversation=${encodeURIComponent(params.conversationId)}`,
      icon: params.iconUrl,
      tag: `daily-signal-${params.traderId}-${params.signalDate}`,
    },
  });
}
