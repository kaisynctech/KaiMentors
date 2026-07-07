import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { MessagesWorkspace } from "@/components/messages-workspace";
import { loadConversationWorkspace } from "@/lib/community-server";
import { getMentorWorkspace } from "@/lib/workspace";

export default async function MentorMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ conversation?: string }>;
}) {
  const workspace = await getMentorWorkspace();
  if (!workspace) redirect("/login");
  const { supabase, traderId, displayName, user, portal } = workspace;

  const { conversations, students } = await loadConversationWorkspace(
    supabase,
    user.id,
    traderId,
  );
  const query = await searchParams;

  return (
    <DashboardShell
      activePath="/dashboard/messages"
      description="Direct, group, and signal communication for your academy."
      title="Messages"
      userLabel={displayName}
      traderId={traderId}
      portalName={portal.portal_name}
      portalSlug={portal.slug}
    >
      <MessagesWorkspace
        conversations={conversations}
        initialConversationId={query.conversation}
        mode="mentor"
        students={students}
        traderId={traderId}
        userId={user.id}
      />
    </DashboardShell>
  );
}
