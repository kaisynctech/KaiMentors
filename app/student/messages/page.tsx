import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { MessagesWorkspace } from "@/components/messages-workspace";
import { loadConversationWorkspace } from "@/lib/community-server";
import { createClient } from "@/lib/supabase/server";
import { getStudentBasePath } from "@/lib/student-routing";
import styles from "./messages.module.css";

export default async function StudentMessagesPage() {
  const studentBasePath = await getStudentBasePath();
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: application } = await supabase
    .from("student_applications")
    .select("trader_id,status,portal:portals(portal_name)")
    .eq("student_user_id", user.id)
    .eq("status", "verified")
    .order("verified_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!application) redirect(studentBasePath);

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

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <BrandMark href={studentBasePath} label={brandLabel} />
        <div>
          <Link href={`${studentBasePath}/courses`}>Courses</Link>
          <Link href={studentBasePath}>Access status</Link>
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
