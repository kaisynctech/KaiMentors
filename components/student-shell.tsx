import { createAdminClient } from "@/lib/supabase/admin";
import { AcademyUnavailable } from "@/components/academy-unavailable";
import { isAcademyActive } from "@/lib/entitlements";
import { resolvePortalFeatures } from "@/lib/portal-features";
import { getStudentAcademyContext } from "@/lib/student-routing";
import { StudentShellClient } from "./student-shell-client";

interface StudentShellProps {
  academyName: string;
  logoPath: string | null;
  hasModuleAccess: boolean;
  basePath: string;
  querySuffix: string;
  displayName: string;
  traderId?: string;
  portalSlug?: string;
  primaryColor?: string;
  children: React.ReactNode;
}

export async function StudentShell({
  academyName,
  logoPath,
  hasModuleAccess,
  basePath,
  querySuffix,
  displayName,
  traderId,
  portalSlug,
  primaryColor,
  children,
}: StudentShellProps) {
  let logoUrl: string | null = null;
  if (logoPath) {
    const admin = createAdminClient();
    if (admin) {
      const { data } = await admin.storage
        .from("portal-branding")
        .createSignedUrl(logoPath, 3600);
      logoUrl = data?.signedUrl ?? null;
    }
  }

  const academyActive = traderId ? await isAcademyActive(traderId) : true;
  const academy = await getStudentAcademyContext(portalSlug);
  const portalFeatures = resolvePortalFeatures(
    academy.studentPortalFeatures,
    academy.accessModel,
  );

  return (
    <StudentShellClient
      academyName={academyName}
      basePath={basePath}
      displayName={displayName}
      hasModuleAccess={hasModuleAccess}
      logoUrl={logoUrl}
      portalFeatures={portalFeatures}
      portalSlug={portalSlug}
      primaryColor={primaryColor}
      querySuffix={querySuffix}
      traderId={traderId}
    >
      {academyActive ? children : <AcademyUnavailable academyName={academyName} />}
    </StudentShellClient>
  );
}
