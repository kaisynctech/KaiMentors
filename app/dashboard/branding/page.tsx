import { redirect } from "next/navigation";

export default function BrandingRedirect() {
  redirect("/dashboard/settings?tab=branding");
}
