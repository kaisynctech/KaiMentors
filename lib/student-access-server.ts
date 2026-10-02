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
    trading_account_number: string | null;
    broker_account_identifier: string | null;
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
  /** Owner or mentor of this academy. Staff are not held behind student broker verification. */
  isAcademyStaff: boolean;
  showBrokerVerification: boolean;
  hasActiveBrokers: boolean;
  isBrokerVerified: boolean;
  activeSubscription: ActiveStudentSubscription | null;
};

type PortalRow = {
  id: string;
  trader_id: string;
  portal_name: string;
  slug: string;
  logo_path: string | null;
  primary_color: string | null;
  access_model: "verification" | "subscription";
  require_broker_verification_for_modules?: boolean | null;
  allow_full_access_without_verification?: boolean | null;
};

async function isTraderMember(
  supabase: SupabaseClient,
  traderId: string | null | undefined,
): Promise<boolean> {
  if (!traderId) return false;
  const { data } = await supabase.rpc("is_trader_member", {
    target_trader_id: traderId,
  });
  return data === true;
}

async function loadAcademyPortal(
  supabase: SupabaseClient,
  academy: StudentAcademyContext,
  traderId?: string | null,
): Promise<PortalRow | null> {
  let query = supabase
    .from("portals")
    .select(
      "id,trader_id,portal_name,slug,logo_path,primary_color,access_model,require_broker_verification_for_modules,allow_full_access_without_verification",
    );
  if (academy.portalId) query = query.eq("id", academy.portalId);
  else if (academy.portalSlug) query = query.eq("slug", academy.portalSlug);
  else if (traderId) query = query.eq("trader_id", traderId);
  else return null;
  const { data } = await query.maybeSingle();
  return (data as PortalRow | null) ?? null;
}

function staffContext(portal: PortalRow, userId: string): StudentSessionContext {
  const accessModel = portal.access_model ?? "verification";
  const policy = parsePortalAccessPolicy(portal);
  return {
    application: {
      id: userId,
      trader_id: portal.trader_id,
      portal_id: portal.id,
      status: "verified",
      status_reason: null,
      broker_verified: true,
      verification_screenshot_path: null,
      trading_account_number: null,
      broker_account_identifier: null,
    },
    fullName: null,
    portal: {
      portal_name: portal.portal_name,
      slug: portal.slug,
      logo_path: portal.logo_path,
      primary_color: portal.primary_color,
      access_model: accessModel,
    },
    policy,
    isAcademyStaff: true,
    hasModuleAccess: true,
    showBrokerVerification: false,
    hasActiveBrokers: false,
    isBrokerVerified: true,
    activeSubscription: null,
  };
}

export async function loadStudentSessionContext(
  supabase: SupabaseClient,
  userId: string,
  academy: StudentAcademyContext,
): Promise<StudentSessionContext | null> {
  let appQuery = supabase
    .from("student_applications")
    .select(
      "id,trader_id,status,status_reason,portal_id,broker_verified,verification_screenshot_path,full_name,trading_account_number,broker_account_identifier,portal:portals!inner(id,trader_id,portal_name,slug,logo_path,primary_color,access_model,require_broker_verification_for_modules,allow_full_access_without_verification)",
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

  if (!application) {
    const portal = await loadAcademyPortal(supabase, academy, academy.traderId);
    if (!portal) return null;
    const staff = await isTraderMember(supabase, portal.trader_id);
    return staff ? staffContext(portal, userId) : null;
  }

  const portal = Array.isArray(application.portal)
    ? application.portal[0]
    : application.portal;
  if (!portal) return null;

  const traderId = (application.trader_id as string) ?? academy.traderId;
  const isAcademyStaff = await isTraderMember(supabase, traderId);

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
    showBrokerVerification = isAcademyStaff
      ? false
      : shouldShowBrokerVerificationUI(
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
      trading_account_number:
        (application.trading_account_number as string | null) ?? null,
      broker_account_identifier:
        (application.broker_account_identifier as string | null) ?? null,
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
    isAcademyStaff,
    hasModuleAccess:
      isAcademyStaff ||
      hasStudentModuleAccess(
        accessApplication,
        policy,
        accessModel,
        !!activeSubscription,
      ),
    showBrokerVerification,
    hasActiveBrokers,
    isBrokerVerified:
      isAcademyStaff ||
      application.broker_verified === true ||
      application.status === "verified",
    activeSubscription,
  };
}
