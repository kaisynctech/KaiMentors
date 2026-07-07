import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StudentAcademyContext } from "@/lib/student-routing";
import {
  hasStudentModuleAccess,
  parsePortalAccessPolicy,
  shouldShowBrokerVerificationUI,
  type PortalAccessPolicy,
} from "@/lib/student-access";

export type StudentSessionContext = {
  application: {
    id: string;
    trader_id: string;
    portal_id: string;
    status: string;
    status_reason: string | null;
    broker_verified: boolean;
    verification_screenshot_path: string | null;
  };
  portal: {
    portal_name: string;
    slug: string;
    logo_path: string | null;
    primary_color: string | null;
  };
  policy: PortalAccessPolicy;
  hasModuleAccess: boolean;
  showBrokerVerification: boolean;
  hasActiveBrokers: boolean;
  isBrokerVerified: boolean;
};

export async function loadStudentSessionContext(
  supabase: SupabaseClient,
  userId: string,
  academy: StudentAcademyContext,
): Promise<StudentSessionContext | null> {
  let appQuery = supabase
    .from("student_applications")
    .select(
      "id,trader_id,status,status_reason,portal_id,broker_verified,verification_screenshot_path,portal:portals!inner(portal_name,slug,logo_path,primary_color,require_broker_verification_for_modules,allow_full_access_without_verification)",
    )
    .eq("student_user_id", userId);

  if (academy.portalId) appQuery = appQuery.eq("portal_id", academy.portalId);
  if (academy.portalSlug) appQuery = appQuery.eq("portal.slug", academy.portalSlug);
  if (!academy.portalId && !academy.portalSlug) {
    appQuery = appQuery.neq("status", "rejected");
  }

  const { data: application } = await appQuery
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!application) return null;

  const portal = Array.isArray(application.portal)
    ? application.portal[0]
    : application.portal;
  if (!portal) return null;

  const policy = parsePortalAccessPolicy(portal);
  const accessApplication = {
    status: application.status as string,
    brokerVerified: application.broker_verified as boolean,
  };

  const { count: brokerCount } = await supabase
    .from("trader_broker_accounts")
    .select("id", { count: "exact", head: true })
    .eq("trader_id", application.trader_id)
    .eq("is_active", true);

  const hasActiveBrokers = (brokerCount ?? 0) > 0;

  return {
    application: {
      id: application.id,
      trader_id: application.trader_id,
      portal_id: application.portal_id,
      status: application.status as string,
      status_reason: application.status_reason as string | null,
      broker_verified: application.broker_verified as boolean,
      verification_screenshot_path:
        application.verification_screenshot_path as string | null,
    },
    portal: {
      portal_name: portal.portal_name as string,
      slug: portal.slug as string,
      logo_path: portal.logo_path as string | null,
      primary_color: portal.primary_color as string | null,
    },
    policy,
    hasModuleAccess: hasStudentModuleAccess(accessApplication, policy),
    showBrokerVerification: shouldShowBrokerVerificationUI(
      policy,
      hasActiveBrokers,
      accessApplication,
    ),
    hasActiveBrokers,
    isBrokerVerified:
      application.broker_verified === true ||
      application.status === "verified",
  };
}
