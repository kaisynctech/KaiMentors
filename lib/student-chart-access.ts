import "server-only";

import { academyChartConfig, academyChartsEnabled } from "@/lib/academy-charts";
import { hasStudentModuleAccess, parsePortalAccessPolicy } from "@/lib/student-access";
import { createClient } from "@/lib/supabase/server";

type ChartClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;

type OpenedChart = {
  ok: true;
  supabase: ChartClient;
  user: { id: string };
  traderId: string;
};

async function openChart(traderId: string): Promise<OpenedChart | { ok: false; error: string; status: number }> {
  if (!/^[0-9a-f-]{36}$/i.test(traderId)) {
    return { ok: false, error: "Invalid academy.", status: 400 };
  }

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Not configured.", status: 503 };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in again.", status: 401 };

  const { data: portal } = await supabase
    .from("portals")
    .select(
      "slug, access_model, student_portal_features, require_broker_verification_for_modules, allow_full_access_without_verification",
    )
    .eq("trader_id", traderId)
    .maybeSingle();

  const features = (portal?.student_portal_features ?? {}) as Record<string, boolean>;
  if (
    !portal ||
    !academyChartsEnabled(features) ||
    !academyChartConfig(portal.slug as string)
  ) {
    return { ok: false, error: "This chart is not available.", status: 404 };
  }

  return { ok: true, supabase, user, traderId };
}

async function isAcademyMember(supabase: ChartClient, userId: string, traderId: string) {
  const { data } = await supabase
    .from("trader_members")
    .select("id")
    .eq("user_id", userId)
    .eq("trader_id", traderId)
    .maybeSingle();
  return Boolean(data);
}

async function allowStudent(opened: OpenedChart) {
  const { data: application } = await opened.supabase
    .from("student_applications")
    .select("status, broker_verified")
    .eq("student_user_id", opened.user.id)
    .eq("trader_id", opened.traderId)
    .neq("status", "rejected")
    .limit(1)
    .maybeSingle();
  if (!application) {
    return { ok: false as const, error: "This chart is not available.", status: 404 };
  }

  const { data: portal } = await opened.supabase
    .from("portals")
    .select(
      "access_model, require_broker_verification_for_modules, allow_full_access_without_verification",
    )
    .eq("trader_id", opened.traderId)
    .maybeSingle();
  if (!portal) {
    return { ok: false as const, error: "This chart is not available.", status: 404 };
  }

  const allowed = hasStudentModuleAccess(
    {
      status: application.status as string,
      brokerVerified: application.broker_verified as boolean,
    },
    parsePortalAccessPolicy(portal),
    portal.access_model as "verification" | "subscription",
  );
  if (!allowed) {
    return {
      ok: false as const,
      error: "Verify your account before saving analysis or trades.",
      status: 403,
    };
  }

  return {
    ok: true as const,
    supabase: opened.supabase,
    user: opened.user,
    traderId: opened.traderId,
    role: "student" as const,
  };
}

export async function requireChartStudent(traderId: string) {
  const opened = await openChart(traderId);
  if (!opened.ok) return opened;
  return allowStudent(opened);
}

export async function requireChartMentor(traderId: string) {
  const opened = await openChart(traderId);
  if (!opened.ok) return opened;
  if (!(await isAcademyMember(opened.supabase, opened.user.id, opened.traderId))) {
    return { ok: false as const, error: "This chart is not available.", status: 404 };
  }
  return {
    ok: true as const,
    supabase: opened.supabase,
    user: opened.user,
    traderId: opened.traderId,
    role: "mentor" as const,
  };
}

/** Mentors of this academy, or a verified student of it. */
export async function requireChartViewer(traderId: string) {
  const opened = await openChart(traderId);
  if (!opened.ok) return opened;
  if (await isAcademyMember(opened.supabase, opened.user.id, opened.traderId)) {
    return {
      ok: true as const,
      supabase: opened.supabase,
      user: opened.user,
      traderId: opened.traderId,
      role: "mentor" as const,
    };
  }
  return allowStudent(opened);
}
