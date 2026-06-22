import { AcademyJoinPage } from "@/components/academy-join-page";
import type { CustomSiteJoinData } from "@/lib/custom-sites";

export function CustomSiteJoinPage({
  customDomain = false,
  data,
}: {
  customDomain?: boolean;
  data: CustomSiteJoinData;
}) {
  return <AcademyJoinPage customDomain={customDomain} data={data} />;
}
