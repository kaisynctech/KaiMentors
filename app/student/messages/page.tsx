import { redirect } from "next/navigation";
import { ContentGate } from "@/components/content-gate";
import { MessagesWorkspace } from "@/components/messages-workspace";
import { StudentShell } from "@/components/student-shell";
import { loadConversationWorkspace, loadTodaySignal, loadWorkspaceMentors } from "@/lib/community-server";
import { createClient } from "@/lib/supabase/server";
import { loadStudentSessionContext } from "@/lib/student-access-server";
import { getStudentAcademyContext } from "@/lib/student-routing";
import styles from "./messages.module.css";

export const dynamic = "force-dynamic";

interface StudentMessagesPageProps {
  searchParams?: Promise<{ portal?: string; conversation?: string }>;
}

export default async function StudentMessagesPage({
  searchParams,
}: StudentMessagesPageProps) {
  const query = await searchParams;
  const academyContext = await getStudentAcademyContext(query?.portal);
  const { basePath, querySuffix: suffix, joinAcademyPath } = academyContext;

  const supabase = await createClient();
  if (!supabase) redirect(`${basePath}/login${suffix}`);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`${basePath}/login${suffix}`);

  const ctx = await loadStudentSessionContext(supabase, user.id, academyContext);
  if (!ctx) redirect(joinAcademyPath);

  const { application, portal, hasModuleAccess } = ctx;
  const academyName = portal.portal_name;
  const displayName = user.email?.split("@")[0] ?? "Student";

  function Shell({ children }: { children: React.ReactNode }) {
    return (
      <StudentShell
        academyName={academyName}
        basePath={basePath}
        displayName={displayName}
        hasModuleAccess={hasModuleAccess}
        logoPath={portal.logo_path}
        portalSlug={portal.slug}
        querySuffix={suffix}
        traderId={application.trader_id}
      >
        {children}
      </StudentShell>
    );
  }

  if (!hasModuleAccess) {
    return (
      <Shell>
        <div className={styles.page}>
          <header className={styles.header}>
            <p className="eyebrow">{portal?.portal_name ?? "Mentor academy"}</p>
            <h1>Academy messages.</h1>
            <p>Private support, group conversations, and today&apos;s trade signals.</p>
          </header>
          <ContentGate
            applicationStatus={application.status}
            returnPath={`${basePath}${suffix}`}
          />
        </div>
      </Shell>
    );
  }

  // Verified — full messages
  const [{ conversations }, workspaceMentors, todaySignal] = await Promise.all([
    loadConversationWorkspace(supabase, user.id, application.trader_id),
    loadWorkspaceMentors(supabase, application.trader_id),
    loadTodaySignal(supabase, application.trader_id),
  ]);
  const allStudentsConversationId =
    conversations.find((conversation) => conversation.isAllStudents)?.id;

  return (
    <Shell>
      <main className={styles.page}>
        <header className={styles.header}>
          <p className="eyebrow">{portal?.portal_name ?? "Mentor academy"}</p>
          <h1>Your academy messages.</h1>
          <p>
            Private support, group conversations, and today&apos;s trade signals.
          </p>
        </header>
        <MessagesWorkspace
          allStudentsConversationId={allStudentsConversationId}
          conversations={conversations}
          initialConversationId={query?.conversation}
          initialTodaySignal={todaySignal}
          mode="student"
          studentApplicationId={application.id}
          students={[]}
          traderId={application.trader_id}
          userId={user.id}
          workspaceMentors={workspaceMentors}
        />
      </main>
    </Shell>
  );
}
