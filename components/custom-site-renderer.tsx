import Script from "next/script";
import type { LoadedCustomSite } from "@/lib/custom-sites";

export function CustomSiteRenderer({ site }: { site: LoadedCustomSite }) {
  const poweredBy =
    site.assignment.show_powered_by &&
    (site.package.manifest.poweredByLabel ?? "Powered by KaiMentors");
  const platformUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "/";

  return (
    <>
      <link href={`${site.assetBasePath}/styles.css`} rel="stylesheet" />
      <style>{`
        .kaimentors-package-announcement {
          margin: 0 auto;
          max-width: 1180px;
          padding: 14px 22px;
          border-radius: 999px;
          background: ${site.portal.accent_color};
          color: #111315;
          font-weight: 800;
          text-align: center;
        }
        .kaimentors-powered-by {
          position: fixed;
          right: 18px;
          bottom: 18px;
          z-index: 80;
          border: 1px solid rgba(17, 19, 21, 0.12);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.92);
          color: #111315;
          box-shadow: 0 16px 44px rgba(0, 0, 0, 0.12);
          font: 800 11px/1 Inter, Arial, sans-serif;
          letter-spacing: 0.06em;
          padding: 10px 13px;
          text-transform: uppercase;
        }
        @media (max-width: 720px) {
          .kaimentors-powered-by {
            left: 16px;
            right: auto;
            bottom: 14px;
          }
        }
      `}</style>
      <div dangerouslySetInnerHTML={{ __html: site.bodyHtml }} />
      {poweredBy ? (
        <a className="kaimentors-powered-by" href={platformUrl}>
          {poweredBy}
        </a>
      ) : null}
      <Script src={`${site.assetBasePath}/app.js`} strategy="afterInteractive" />
    </>
  );
}
