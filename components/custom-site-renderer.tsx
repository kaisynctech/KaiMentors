import Link from "next/link";
import Script from "next/script";
import type { LoadedCustomSite } from "@/lib/custom-sites";
import { SiteContactFooter } from "@/components/site-contact-footer";

interface CustomSiteRendererProps {
  customDomain?: boolean;
  site: LoadedCustomSite;
}

export function CustomSiteRenderer({ site }: CustomSiteRendererProps) {
  const poweredBy =
    site.assignment.show_powered_by &&
    (site.package.manifest.poweredByLabel ?? "Powered by KaiMentors");

  if (
    site.package.manifest.renderMode === "static_export" &&
    site.staticExportUrl
  ) {
    return (
      <iframe
        className="kaimentors-static-export-site"
        src={site.staticExportUrl}
        title={site.title}
        style={{
          border: 0,
          display: "block",
          width: "100%",
          minHeight: "100dvh",
        }}
      />
    );
  }

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
          display: block;
          text-align: center;
          padding: 18px;
          font: 700 11px/1 Inter, Arial, sans-serif;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: rgba(17,19,21,0.35);
          text-decoration: none;
        }
      `}</style>
      <div dangerouslySetInnerHTML={{ __html: site.bodyHtml }} />
      <SiteContactFooter
        contactInfo={site.contactInfo}
        primaryColor={site.portal.primary_color}
        accentColor={site.portal.accent_color}
      />
      {poweredBy ? (
        <Link className="kaimentors-powered-by" href="/">
          {poweredBy}
        </Link>
      ) : null}
      <Script src={`${site.assetBasePath}/app.js`} strategy="afterInteractive" />
    </>
  );
}
