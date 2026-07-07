import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

interface NotificationPayload {
  userId: string;
  traderId?: string;
  bookingId?: string;
  conversationId?: string;
  type: string;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
}

export async function createNotification(payload: NotificationPayload): Promise<void> {
  try {
    const admin = createAdminClient();
    if (!admin) return;
    await admin.from("notifications").insert({
      user_id: payload.userId,
      trader_id: payload.traderId ?? null,
      booking_id: payload.bookingId ?? null,
      conversation_id: payload.conversationId ?? null,
      type: payload.type,
      title: payload.title,
      body: payload.body ?? null,
      metadata: payload.metadata ?? null,
    });
  } catch (e) {
    console.error("createNotification failed:", e);
  }
}
