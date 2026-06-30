import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

interface NotificationPayload {
  userId: string;
  traderId?: string;
  bookingId?: string;
  type: string;
  title: string;
  body?: string;
}

export async function createNotification(payload: NotificationPayload): Promise<void> {
  try {
    const admin = createAdminClient();
    if (!admin) return;
    await admin.from("notifications").insert({
      user_id: payload.userId,
      trader_id: payload.traderId ?? null,
      booking_id: payload.bookingId ?? null,
      type: payload.type,
      title: payload.title,
      body: payload.body ?? null,
    });
  } catch (e) {
    console.error("createNotification failed:", e);
  }
}
