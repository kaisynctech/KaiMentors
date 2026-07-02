import { redirect } from "next/navigation";

export default function BrokerAccountsRedirect() {
  redirect("/dashboard/settings?tab=brokers");
}
