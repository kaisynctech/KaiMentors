import Script from "next/script";
import { getAcademyEntryHref } from "@/lib/academy-routes";
import type { LoadedCustomSite } from "@/lib/custom-sites";

export function CustomSiteRenderer({
  customDomain = false,
  site,
}: {
  customDomain?: boolean;
  site: LoadedCustomSite;
}) {
  const poweredBy =
    site.assignment.show_powered_by &&
    (site.package.manifest.poweredByLabel ?? "Powered by KaiMentors");
  const platformUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "/";
  const routeContext = { portalSlug: site.portal.slug, customDomain };
  const joinHref = getAcademyEntryHref(routeContext, "join-academy");
  const loginHref = getAcademyEntryHref(routeContext, "login");

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
        .kaimentors-entry-actions {
          position: fixed;
          top: 18px;
          right: 18px;
          z-index: 90;
          display: flex;
          gap: 8px;
          align-items: center;
          padding: 8px;
          border: 1px solid rgba(17, 19, 21, 0.12);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.92);
          box-shadow: 0 16px 44px rgba(0, 0, 0, 0.12);
          backdrop-filter: blur(18px);
        }
        .kaimentors-entry-actions a {
          border-radius: 999px;
          color: #111315;
          font: 800 12px/1 Inter, Arial, sans-serif;
          padding: 11px 14px;
          text-decoration: none;
        }
        .kaimentors-entry-actions a:first-child {
          background: ${site.portal.primary_color};
          color: #fff;
        }
        @media (max-width: 720px) {
          .kaimentors-entry-actions {
            left: 14px;
            right: 14px;
            justify-content: center;
            top: 12px;
          }
          .kaimentors-powered-by {
            left: 16px;
            right: auto;
            bottom: 14px;
          }
        }
      `}</style>
      <div className="kaimentors-entry-actions">
        <a href={joinHref}>Join Academy</a>
        <a href={loginHref}>Sign In</a>
      </div>
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
