import { NextResponse } from "next/server";
import { getPwaManifestFields, getPwaPortalBranding } from "@/lib/pwa-portal";

export async function GET(request: Request) {
  const branding = await getPwaPortalBranding(request);
  const manifest = getPwaManifestFields(branding);

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
