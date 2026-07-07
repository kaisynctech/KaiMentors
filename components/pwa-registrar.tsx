"use client";

import { useEffect } from "react";

interface Props {
  portalSlug?: string | null;
  portalName: string;
  primaryColor?: string;
}

export function PwaRegistrar({
  portalSlug,
  portalName,
  primaryColor = "#111315",
}: Props) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    const manifestHref = portalSlug
      ? `/manifest.webmanifest?portal=${encodeURIComponent(portalSlug)}`
      : "/manifest.webmanifest";

    let manifestLink = document.querySelector<HTMLLinkElement>(
      'link[rel="manifest"]',
    );
    if (!manifestLink) {
      manifestLink = document.createElement("link");
      manifestLink.rel = "manifest";
      document.head.appendChild(manifestLink);
    }
    manifestLink.href = manifestHref;

    const iconHref = portalSlug
      ? `/api/pwa/icon/180?portal=${encodeURIComponent(portalSlug)}`
      : "/api/pwa/icon/180";

    let appleIcon = document.querySelector<HTMLLinkElement>(
      'link[rel="apple-touch-icon"]',
    );
    if (!appleIcon) {
      appleIcon = document.createElement("link");
      appleIcon.rel = "apple-touch-icon";
      document.head.appendChild(appleIcon);
    }
    appleIcon.href = iconHref;

    const metaTags: Array<[string, string]> = [
      ["apple-mobile-web-app-capable", "yes"],
      ["apple-mobile-web-app-title", portalName],
      ["mobile-web-app-capable", "yes"],
      ["theme-color", primaryColor],
    ];

    for (const [name, content] of metaTags) {
      let tag = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      if (!tag) {
        tag = document.createElement("meta");
        tag.name = name;
        document.head.appendChild(tag);
      }
      tag.content = content;
    }
  }, [portalName, portalSlug, primaryColor]);

  return null;
}
