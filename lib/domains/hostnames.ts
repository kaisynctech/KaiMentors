const domainPattern =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function normalizeHostname(input: string) {
  const candidate = input.trim().toLowerCase().replace(/\.$/, "");
  const hostname = candidate.includes("://")
    ? new URL(candidate).hostname.toLowerCase().replace(/\.$/, "")
    : new URL(`https://${candidate}`).hostname.toLowerCase().replace(/\.$/, "");

  if (
    !domainPattern.test(hostname) ||
    /^\d+(?:\.\d+){3}$/.test(hostname)
  ) {
    throw new Error("Enter a valid domain name, such as academy.example.com.");
  }

  return hostname;
}

function configuredPlatformHosts() {
  return [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
    ...(process.env.KAIMENTORS_PLATFORM_HOSTNAMES ?? "").split(","),
  ]
    .filter(Boolean)
    .map((value) => {
      try {
        return normalizeRequestHostname(String(value));
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}

export function normalizeRequestHostname(value: string) {
  const raw = value.trim().toLowerCase().replace(/\.$/, "");
  const withoutProtocol = raw.replace(/^https?:\/\//, "").split("/")[0];
  return withoutProtocol.replace(/:\d+$/, "");
}

export function isPlatformHostname(hostname: string) {
  const normalized = normalizeRequestHostname(hostname);
  if (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "[::1]"
  ) {
    return true;
  }

  return configuredPlatformHosts().includes(normalized);
}
