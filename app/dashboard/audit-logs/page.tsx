import { redirect } from "next/navigation";

export default function AuditLogsRedirect() {
  redirect("/dashboard/settings?tab=audit-logs");
}
