import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { MessagesWorkspace } from "@/components/messages-workspace";
import { loadConversationWorkspace } from "@/lib/community-server";
import { createClient } from "@/lib/supabase/server";

export default async function MentorMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ conversation?: string }>;
}) {
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("trader_members")
    .select("trader_id,trader:traders(display_name)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/dashboard");

  const { conversations, students } = await loadConversationWorkspace(
    supabase,
    user.id,
    membership.trader_id,
  );
  const trader = Array.isArray(membership.trader)
    ? membership.trader[0]
    : membership.trader;
  const query = await searchParams;

  return (
    <DashboardShell
      activePath="/dashboard/messages"
      description="Direct, group, and announcement communication for your academy."
      title="Messages"
      userLabel={trader?.display_name ?? "Mentor workspace"}
    >
      <MessagesWorkspace
        conversations={conversations}
        initialConversationId={query.conversation}
        mode="mentor"
        students={students}
        traderId={membership.trader_id}
        userId={user.id}
      />
    </DashboardShell>
  );
}
