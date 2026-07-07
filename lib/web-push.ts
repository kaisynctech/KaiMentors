import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformHostname, normalizeRequestHostname } from "@/lib/domains/hostnames";

export interface WebPushPayload {
  title: string;
  body: string;
  url: string;
  icon?: string;
  tag?: string;
}

function configureWebPush() {
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!subject || !publicKey || !privateKey) {
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

export function buildSignalPushUrl(
  origin: string,
  portalSlug: string | null,
  conversationId: string,
) {
  const base = origin.replace(/\/$/, "");
  let hostname = "localhost";
  try {
    hostname = normalizeRequestHostname(new URL(base).hostname);
  } catch {
    // keep default
  }

  if (!isPlatformHostname(hostname)) {
    return `${base}/academy/messages?conversation=${encodeURIComponent(conversationId)}`;
  }

  const params = new URLSearchParams();
  if (portalSlug) params.set("portal", portalSlug);
  params.set("conversation", conversationId);
  return `${base}/student/messages?${params.toString()}`;
}

export async function sendWebPushToTraderStudents(params: {
  traderId: string;
  portalSlug: string | null;
  iconUrl?: string;
  payload: WebPushPayload;
}) {
  if (!configureWebPush()) {
    console.warn("Web push skipped: VAPID keys are not configured.");
    return;
  }

  const admin = createAdminClient();
  if (!admin) return;

  const { data: subscriptions, error } = await admin
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth,origin,user_id")
    .eq("trader_id", params.traderId);

  if (error || !subscriptions?.length) return;

  const conversationMatch = params.payload.url.match(/conversation=([^&]+)/);
  const conversationId = conversationMatch?.[1] ?? "";

  await Promise.all(
    subscriptions.map(async (subscription) => {
      const url = conversationId
        ? buildSignalPushUrl(
            subscription.origin,
            params.portalSlug,
            conversationId,
          )
        : params.payload.url;

      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify({
            title: params.payload.title,
            body: params.payload.body,
            icon: params.payload.icon,
            url,
            tag: params.payload.tag,
          }),
        );
      } catch (pushError) {
        const statusCode =
          pushError &&
          typeof pushError === "object" &&
          "statusCode" in pushError
            ? Number((pushError as { statusCode: number }).statusCode)
            : 0;

        if (statusCode === 404 || statusCode === 410) {
          await admin
            .from("push_subscriptions")
            .delete()
            .eq("id", subscription.id);
        } else {
          console.error("Web push delivery failed:", pushError);
        }
      }
    }),
  );
}
