import { ImageResponse } from "next/og";
import { getPwaPortalBranding } from "@/lib/pwa-portal";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size: sizeParam } = await params;
  const size = Math.min(Math.max(Number.parseInt(sizeParam, 10) || 192, 48), 512);
  const branding = await getPwaPortalBranding(request);
  const initial = branding.portalName.trim().charAt(0).toUpperCase() || "A";
  const fontSize = Math.round(size * 0.42);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: branding.primaryColor,
          color: "#ffffff",
          fontSize,
          fontWeight: 800,
          letterSpacing: "-0.04em",
        }}
      >
        {initial}
      </div>
    ),
    {
      width: size,
      height: size,
      headers: {
        "Cache-Control": "public, max-age=86400",
      },
    },
  );
}
