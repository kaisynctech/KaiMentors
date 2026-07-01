import { CheckCircle2, Clock3, UserRoundX, Users } from "lucide-react";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { MetricCard } from "@/components/metric-card";
import { StudentReviewList } from "@/components/student-review-list";
import type {
  VerificationMethod,
  VerificationStatus,
} from "@/lib/database.types";
import {
  studentTabStatuses,
  type StudentApplicationRow,
  type StudentTab,
} from "@/lib/students";
import { getMentorWorkspace } from "@/lib/workspace";
import styles from "./students.module.css";

const validTabs = new Set<StudentTab>([
  "all",
  "pending",
  "needs_information",
  "verified",
  "rejected",
]);
const validMethods = new Set<VerificationMethod>([
  "api",
  "manual_review",
  "screenshot_upload",
]);
const validPageSizes = new Set([25, 50, 100]);

interface QueueRecord {
  application_id: string;
  application_status: VerificationStatus;
  status_reason: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  review_version: number;
  phone_number: string;
  trading_account_number: string | null;
  platform_account_number: string | null;
  screenshot_path: string | null;
  student_name: string;
  student_email: string | null;
  profile_phone: string | null;
  broker_id: string | null;
  broker_name: string | null;
  verification_method: VerificationMethod | null;
  trading_level: string | null;
  total_count: number;
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const requestedTab = firstValue(query.tab) as StudentTab | undefined;
  const tab =
    requestedTab && validTabs.has(requestedTab) ? requestedTab : "all";
  const search = firstValue(query.search)?.trim().slice(0, 120) ?? "";
  const brokerId = firstValue(query.broker) ?? "";
  const requestedMethod = firstValue(query.method) as
    | VerificationMethod
    | undefined;
  const method =
    requestedMethod && validMethods.has(requestedMethod)
      ? requestedMethod
      : "";
  const requestedPage = Number(firstValue(query.page));
  const page =
    Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const requestedPageSize = Number(firstValue(query.pageSize));
  const pageSize = validPageSizes.has(requestedPageSize)
    ? requestedPageSize
    : 25;

  const workspace = await getMentorWorkspace();
  if (!workspace) redirect("/login");
  const { supabase, traderId, displayName } = workspace;
  const statuses =
    tab === "all" ? null : studentTabStatuses[tab as Exclude<StudentTab, "all">];

  const [
    total,
    verified,
    pending,
    needsInformation,
    rejected,
    connectionResult,
    queueResult,
  ] = await Promise.all([
    supabase
      .from("student_applications")
      .select("*", { count: "exact", head: true })
      .eq("trader_id", traderId),
    supabase
      .from("student_applications")
      .select("*", { count: "exact", head: true })
      .eq("trader_id", traderId)
      .eq("status", "verified"),
    supabase
      .from("student_applications")
      .select("*", { count: "exact", head: true })
      .eq("trader_id", traderId)
      .in("status", ["pending", "processing", "manual_review"]),
    supabase
      .from("student_applications")
      .select("*", { count: "exact", head: true })
      .eq("trader_id", traderId)
      .eq("status", "needs_more_information"),
    supabase
      .from("student_applications")
      .select("*", { count: "exact", head: true })
      .eq("trader_id", traderId)
      .eq("status", "rejected"),
    supabase
      .from("trader_broker_accounts")
      .select("id,broker_id,verification_method,broker:brokers(name)")
      .eq("trader_id", traderId)
      .order("created_at"),
    supabase.rpc("get_student_applications_page", {
      target_trader_id: traderId,
      target_statuses: statuses,
      target_search: search || null,
      target_broker_id: brokerId || null,
      target_verification_method: method || null,
      target_limit: pageSize,
      target_offset: (page - 1) * pageSize,
    }),
  ]);

  let queue = (queueResult.data ?? []) as QueueRecord[];
  let queueCount = Number(queue[0]?.total_count ?? 0);

  // Keep the page usable before the local migration is applied remotely.
  if (queueResult.error) {
    let fallback = supabase
      .from("student_applications")
      .select(
        "id,status,status_reason,submitted_at,reviewed_at,phone_number,trading_account_number,platform_account_number,screenshot_path,profile:profiles!student_user_id(full_name,email,phone),connection:trader_broker_accounts(broker_id,verification_method,broker:brokers(name))",
        { count: "exact" },
      )
      .eq("trader_id", traderId);

    if (statuses) fallback = fallback.in("status", statuses);
    if (method) {
      fallback = fallback.eq("connection.verification_method", method);
    }
    if (brokerId) fallback = fallback.eq("connection.broker_id", brokerId);
    if (search) {
      fallback = fallback.or(
        `phone_number.ilike.%${search}%,trading_account_number.ilike.%${search}%,platform_account_number.ilike.%${search}%`,
      );
    }

    const result = await fallback
      .order("submitted_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    queueCount = result.count ?? 0;
    queue = (result.data ?? []).map((application) => {
      const profile = Array.isArray(application.profile)
        ? application.profile[0] ?? null
        : application.profile;
      const connection = Array.isArray(application.connection)
        ? application.connection[0] ?? null
        : application.connection;
      const broker = connection
        ? Array.isArray(connection.broker)
          ? connection.broker[0] ?? null
          : connection.broker
        : null;

      return {
        application_id: application.id,
        application_status: application.status as VerificationStatus,
        status_reason: application.status_reason,
        submitted_at: application.submitted_at,
        reviewed_at: application.reviewed_at,
        review_version: 0,
        phone_number: application.phone_number,
        trading_account_number: application.trading_account_number,
        platform_account_number: application.platform_account_number,
        screenshot_path: application.screenshot_path,
        student_name: profile?.full_name ?? "Student",
        student_email: profile?.email ?? null,
        profile_phone: profile?.phone ?? null,
        broker_id: connection?.broker_id ?? null,
        broker_name: broker?.name ?? null,
        verification_method:
          (connection?.verification_method as VerificationMethod | null) ??
          null,
        trading_level: null,
        total_count: result.count ?? 0,
      };
    });
  }

  const applications: StudentApplicationRow[] = queue.map((application) => ({
    id: application.application_id,
    status: application.application_status,
    statusReason: application.status_reason,
    submittedAt: application.submitted_at,
    reviewedAt: application.reviewed_at,
    reviewVersion: application.review_version,
    phoneNumber: application.phone_number,
    tradingAccountNumber: application.trading_account_number,
    platformAccountNumber: application.platform_account_number,
    hasProof: Boolean(application.screenshot_path),
    studentName: application.student_name,
    studentEmail: application.student_email,
    profilePhone: application.profile_phone,
    brokerId: application.broker_id,
    brokerName: application.broker_name,
    verificationMethod: application.verification_method,
    tradingLevel: application.trading_level ?? null,
  }));

  const brokers = (connectionResult.data ?? []).map((connection) => {
    const broker = Array.isArray(connection.broker)
      ? connection.broker[0] ?? null
      : connection.broker;
    return {
      id: connection.broker_id,
      name: broker?.name ?? "Broker",
    };
  });
  const uniqueBrokers = Array.from(
    new Map(brokers.map((broker) => [broker.id, broker])).values(),
  );

  const counts = {
    total: total.count ?? 0,
    verified: verified.count ?? 0,
    pending: pending.count ?? 0,
    needsInformation: needsInformation.count ?? 0,
    rejected: rejected.count ?? 0,
  };

  return (
    <DashboardShell
      activePath="/dashboard/students"
      description="Review broker evidence and control access to your private academy."
      title="Students"
      userLabel={displayName}
      traderId={traderId}
    >
      <section className={styles.metrics}>
        <MetricCard
          icon={Users}
          label="Total students"
          note="All applications"
          value={counts.total}
        />
        <MetricCard
          icon={CheckCircle2}
          label="Verified students"
          note="Access enabled"
          value={counts.verified}
        />
        <MetricCard
          icon={Clock3}
          label="Pending students"
          note="Awaiting review"
          value={counts.pending}
        />
        <MetricCard
          icon={UserRoundX}
          label="Rejected students"
          note="Access denied"
          value={counts.rejected}
        />
      </section>
      <StudentReviewList
        applications={applications}
        brokers={uniqueBrokers}
        counts={counts}
        filters={{
          brokerId,
          method,
          page,
          pageSize,
          search,
          tab,
        }}
        totalCount={queueCount}
      />
    </DashboardShell>
  );
}
