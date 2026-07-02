import { createAdminClient } from "@/lib/supabase/admin";
import { StudentShellClient } from "./student-shell-client";

interface StudentShellProps {
  academyName: string;
  logoPath: string | null;
  isVerified: boolean;
  basePath: string;
  querySuffix: string;
  displayName: string;
  traderId?: string;
  portalSlug?: string;
  children: React.ReactNode;
}

export async function StudentShell({
  academyName,
  logoPath,
  isVerified,
  basePath,
  querySuffix,
  displayName,
  traderId,
  portalSlug,
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

  return (
    <StudentShellClient
      academyName={academyName}
      basePath={basePath}
      displayName={displayName}
      isVerified={isVerified}
      logoUrl={logoUrl}
      portalSlug={portalSlug}
      querySuffix={querySuffix}
      traderId={traderId}
    >
      {children}
    </StudentShellClient>
  );
}
