import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StudentAcademyContext } from "@/lib/student-routing";
import {
  hasStudentModuleAccess,
  parsePortalAccessPolicy,
  shouldShowBrokerVerificationUI,
  type PortalAccessPolicy,
} from "@/lib/student-access";

export type ActiveStudentSubscription = {
  id: string;
  plan_id: string;
  status: string;
  current_period_end: string | null;
};

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
  fullName: string | null;
  portal: {
    portal_name: string;
    slug: string;
    logo_path: string | null;
    primary_color: string | null;
    access_model: "verification" | "subscription";
  };
  policy: PortalAccessPolicy;
  hasModuleAccess: boolean;
  showBrokerVerification: boolean;
  hasActiveBrokers: boolean;
  isBrokerVerified: boolean;
  activeSubscription: ActiveStudentSubscription | null;
};

export async function loadStudentSessionContext(
  supabase: SupabaseClient,
  userId: string,
  academy: StudentAcademyContext,
): Promise<StudentSessionContext | null> {
  let appQuery = supabase
    .from("student_applications")
    .select(
      "id,trader_id,status,status_reason,portal_id,broker_verified,verification_screenshot_path,full_name,portal:portals!inner(portal_name,slug,logo_path,primary_color,access_model,require_broker_verification_for_modules,allow_full_access_without_verification)",
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

  const accessModel = (portal.access_model as "verification" | "subscription") ?? "verification";
  const policy = parsePortalAccessPolicy(portal);
  const accessApplication = {
    status: application.status as string,
    brokerVerified: application.broker_verified as boolean,
  };

  let hasActiveBrokers = false;
  let showBrokerVerification = false;
  let activeSubscription: ActiveStudentSubscription | null = null;

  if (accessModel === "subscription") {
    // Skip the broker-verification check entirely for subscription portals — there is no
    // broker to verify against. Query the most recent subscription row that is currently
    // granting access: 'active' (fresh payment), 'cancelled' or 'payment_failed' but still
    // inside its paid-for period (grace period — see has_student_module_access() in the
    // MB-118 migration for the equivalent RLS-level check and why 'cancelled'/
    // 'payment_failed' are included here).
    const { data: subscriptionRow } = await supabase
      .from("student_subscriptions")
      .select("id,plan_id,status,current_period_end")
      .eq("student_user_id", userId)
      .eq("portal_id", application.portal_id)
      .in("status", ["active", "cancelled", "payment_failed"])
      .not("current_period_end", "is", null)
      .gt("current_period_end", new Date().toISOString())
      .order("current_period_end", { ascending: false })
      .limit(1)
      .maybeSingle();

    activeSubscription = subscriptionRow as ActiveStudentSubscription | null;
  } else {
    const { count: brokerCount } = await supabase
      .from("trader_broker_accounts")
      .select("id", { count: "exact", head: true })
      .eq("trader_id", application.trader_id)
      .eq("is_active", true);

    hasActiveBrokers = (brokerCount ?? 0) > 0;
    showBrokerVerification = shouldShowBrokerVerificationUI(
      policy,
      hasActiveBrokers,
      accessApplication,
    );
  }

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
    fullName: (application.full_name as string | null) ?? null,
    portal: {
      portal_name: portal.portal_name as string,
      slug: portal.slug as string,
      logo_path: portal.logo_path as string | null,
      primary_color: portal.primary_color as string | null,
      access_model: accessModel,
    },
    policy,
    hasModuleAccess: hasStudentModuleAccess(
      accessApplication,
      policy,
      accessModel,
      !!activeSubscription,
    ),
    showBrokerVerification,
    hasActiveBrokers,
    isBrokerVerified:
      application.broker_verified === true ||
      application.status === "verified",
    activeSubscription,
  };
}
