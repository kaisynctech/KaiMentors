import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CommunityStudent,
  ConversationSummary,
} from "@/lib/community";

export async function loadConversationWorkspace(
  supabase: SupabaseClient,
  userId: string,
  traderId: string,
) {
  const [{ data: membershipRows }, { data: applicationRows }] =
    await Promise.all([
      supabase
        .from("conversation_members")
        .select(
          "conversation_id,last_read_at,conversation:conversations(id,type,title,last_message_at,last_message_preview,is_archived)",
        )
        .eq("user_id", userId)
        .eq("trader_id", traderId),
      supabase
        .from("student_applications")
        .select(
          "id,student_user_id,profile:profiles!student_user_id(full_name,email)",
        )
        .eq("trader_id", traderId)
        .eq("status", "verified")
        .order("submitted_at", { ascending: false }),
    ]);

  const normalized = (membershipRows ?? [])
    .map((membership) => {
      const conversation = Array.isArray(membership.conversation)
        ? membership.conversation[0] ?? null
        : membership.conversation;
      return conversation
        ? {
            conversation,
            lastReadAt: membership.last_read_at as string | null,
          }
        : null;
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  const conversations: ConversationSummary[] = normalized
    .map(({ conversation, lastReadAt }) => {
      const lastMessageAt = conversation.last_message_at ?? null;
      return {
        id: conversation.id,
        type: conversation.type,
        title: conversation.title ?? "Conversation",
        lastMessageAt,
        lastMessage: conversation.last_message_preview ?? null,
        unread: Boolean(
          lastMessageAt &&
            (!lastReadAt || new Date(lastMessageAt) > new Date(lastReadAt)),
        ),
      };
    })
    .sort((a, b) => {
      if (!a.lastMessageAt) return 1;
      if (!b.lastMessageAt) return -1;
      return (
        new Date(b.lastMessageAt).getTime() -
        new Date(a.lastMessageAt).getTime()
      );
    });

  const students: CommunityStudent[] = (applicationRows ?? []).map(
    (application) => {
      const profile = Array.isArray(application.profile)
        ? application.profile[0] ?? null
        : application.profile;
      return {
        applicationId: application.id,
        userId: application.student_user_id,
        fullName: profile?.full_name ?? "Student",
        email: profile?.email ?? null,
      };
    },
  );

  return { conversations, students };
}
