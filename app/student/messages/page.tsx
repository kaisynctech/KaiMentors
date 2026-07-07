import { redirect } from "next/navigation";
import { ContentGate } from "@/components/content-gate";
import { MessagesWorkspace } from "@/components/messages-workspace";
import { StudentShell } from "@/components/student-shell";
import { loadConversationWorkspace, loadTodaySignal, loadWorkspaceMentors } from "@/lib/community-server";
import { createClient } from "@/lib/supabase/server";
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

  // Fetch application — any status
  let applicationQuery = supabase
    .from("student_applications")
    .select(
      "id,trader_id,status,portal_id,portal:portals!inner(portal_name,slug,logo_path)",
    )
    .eq("student_user_id", user.id);
  if (academyContext.portalId) {
    applicationQuery = applicationQuery.eq("portal_id", academyContext.portalId);
  }
  if (academyContext.portalSlug) {
    applicationQuery = applicationQuery.eq(
      "portal.slug",
      academyContext.portalSlug,
    );
  }
  const { data: application } = await applicationQuery
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!application) redirect(joinAcademyPath);

  const portal = Array.isArray(application.portal)
    ? application.portal[0]
    : application.portal;
  const academyName = portal?.portal_name ?? "Academy";
  const displayName = user.email?.split("@")[0] ?? "Student";
  const isVerified = application.status === "verified";

  function Shell({ children }: { children: React.ReactNode }) {
    return (
      <StudentShell
        academyName={academyName}
        basePath={basePath}
        displayName={displayName}
        isVerified={isVerified}
        logoPath={portal?.logo_path ?? null}
        portalSlug={portal?.slug}
        querySuffix={suffix}
        traderId={application?.trader_id}
      >
        {children}
      </StudentShell>
    );
  }

  // Unverified — ContentGate
  if (!isVerified) {
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
