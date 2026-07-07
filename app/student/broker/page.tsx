import { redirect } from "next/navigation";
import { StudentBrokerView } from "@/components/student-broker-view";
import { StudentShell } from "@/components/student-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { loadStudentSessionContext } from "@/lib/student-access-server";
import { getStudentAcademyContext } from "@/lib/student-routing";

export const dynamic = "force-dynamic";

export default async function StudentBrokerPage({
  searchParams,
}: {
  searchParams?: Promise<{ portal?: string }>;
}) {
  const query = await searchParams;
  const academy = await getStudentAcademyContext(query?.portal);
  const { basePath, querySuffix, joinAcademyPath } = academy;

  const supabase = await createClient();
  if (!supabase) redirect(`${basePath}/login${querySuffix}`);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`${basePath}/login${querySuffix}`);

  const ctx = await loadStudentSessionContext(supabase, user.id, academy);
  if (!ctx) redirect(joinAcademyPath);

  const { application, portal, hasModuleAccess } = ctx;
  const academyName = portal.portal_name;
  const displayName = user.email?.split("@")[0] ?? "Student";
  const traderId = application.trader_id;

  const { data: brokerData } = await supabase
    .from("trader_broker_accounts")
    .select(
      "id,account_label,affiliate_link,new_account_instructions,new_account_image_path,new_account_video_path,existing_account_instructions,existing_account_image_path,existing_account_video_path,broker:brokers(name)",
    )
    .eq("trader_id", traderId)
    .eq("is_active", true)
    .order("created_at");

  const admin = createAdminClient();
  async function signMedia(path: string | null): Promise<string | null> {
    if (!path || !admin) return null;
    const { data } = await admin.storage
      .from("academy-media")
      .createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  }

  const rows = (brokerData ?? []) as Array<{
    id: string;
    account_label: string | null;
    affiliate_link: string | null;
    new_account_instructions: string | null;
    new_account_image_path: string | null;
    new_account_video_path: string | null;
    existing_account_instructions: string | null;
    existing_account_image_path: string | null;
    existing_account_video_path: string | null;
    broker: { name: string } | { name: string }[] | null;
  }>;

  const brokers = await Promise.all(
    rows.map(async (b) => {
      const broker = Array.isArray(b.broker) ? b.broker[0] : b.broker;
      return {
        id: b.id,
        brokerName: broker?.name ?? b.account_label ?? "Broker",
        affiliateLink: b.affiliate_link ?? null,
        newAccountInstructions: b.new_account_instructions ?? null,
        newAccountImageUrl: await signMedia(b.new_account_image_path),
        newAccountVideoUrl: await signMedia(b.new_account_video_path),
        existingAccountInstructions: b.existing_account_instructions ?? null,
        existingAccountImageUrl: await signMedia(b.existing_account_image_path),
        existingAccountVideoUrl: await signMedia(b.existing_account_video_path),
      };
    }),
  );

  return (
    <StudentShell
      academyName={academyName}
      basePath={basePath}
      displayName={displayName}
      hasModuleAccess={hasModuleAccess}
      logoPath={portal.logo_path}
      portalSlug={portal.slug}
      querySuffix={querySuffix}
      traderId={traderId}
    >
      <div style={{ padding: "28px 24px" }}>
        <p className="eyebrow">{academyName}</p>
        <h1 style={{ margin: "4px 0 20px", fontSize: "1.5rem", letterSpacing: "-0.03em" }}>
          Open an account
        </h1>
        <StudentBrokerView brokers={brokers} />
      </div>
    </StudentShell>
  );
}
