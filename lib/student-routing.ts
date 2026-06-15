import { headers } from "next/headers";
import {
  isPlatformHostname,
  normalizeRequestHostname,
} from "@/lib/domains/hostnames";

export async function getStudentBasePath() {
  const requestHeaders = await headers();
  const hostname = normalizeRequestHostname(
    requestHeaders.get("x-forwarded-host") ??
      requestHeaders.get("host") ??
      "localhost",
  );
  return isPlatformHostname(hostname) ? "/student" : "/academy";
}
