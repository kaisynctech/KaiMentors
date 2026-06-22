import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { MessagesWorkspace } from "@/components/messages-workspace";
import { loadConversationWorkspace } from "@/lib/community-server";
import { createClient } from "@/lib/supabase/server";
import { getStudentAcademyContext } from "@/lib/student-routing";
import styles from "./messages.module.css";

interface StudentMessagesPageProps {
  searchParams?: Promise<{ portal?: string }>;
}

export default async function StudentMessagesPage({
  searchParams,
}: StudentMessagesPageProps) {
  const query = await searchParams;
  const academyContext = await getStudentAcademyContext(query?.portal);
  const studentBasePath = academyContext.basePath;
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let applicationQuery = supabase
    .from("student_applications")
    .select("trader_id,status,portal_id,portal:portals!inner(portal_name,slug)")
    .eq("student_user_id", user.id)
    .eq("status", "verified");
  if (academyContext.portalId) {
    applicationQuery = applicationQuery.eq("portal_id", academyContext.portalId);
  }
  if (academyContext.portalSlug) {
    applicationQuery = applicationQuery.eq("portal.slug", academyContext.portalSlug);
  }
  const { data: application } = await applicationQuery
    .order("verified_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!application) redirect(`${studentBasePath}${academyContext.querySuffix}`);

  const { conversations } = await loadConversationWorkspace(
    supabase,
    user.id,
    application.trader_id,
  );
  const portal = Array.isArray(application.portal)
    ? application.portal[0]
    : application.portal;
  const brandLabel =
    studentBasePath === "/academy"
      ? portal?.portal_name ?? "Academy"
      : "KaiMentors";
  const suffix = academyContext.querySuffix;

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <BrandMark href={`${studentBasePath}${suffix}`} label={brandLabel} />
        <div>
          <Link href={`${studentBasePath}/courses${suffix}`}>Courses</Link>
          <Link href={`${studentBasePath}${suffix}`}>Access status</Link>
          <Link href="/auth/signout">Sign out</Link>
        </div>
      </nav>
      <header className={styles.header}>
        <p className="eyebrow">{portal?.portal_name ?? "Mentor academy"}</p>
        <h1>Your academy messages.</h1>
        <p>Private support, group conversations, and mentor announcements.</p>
      </header>
      <MessagesWorkspace
        conversations={conversations}
        mode="student"
        students={[]}
        traderId={application.trader_id}
        userId={user.id}
      />
    </main>
  );
}
