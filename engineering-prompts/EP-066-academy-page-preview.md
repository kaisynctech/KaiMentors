# EP-066 — Academy Page Preview: Custom Site + Social Footer

**Date:** 2026-07-02
**Status:** Ready for implementation

---

## Objective

The Academy Page settings tab currently shows a hand-built HTML mockup of the core (system-provided) academy page in its right column. For academies on a custom site package this is useless — they never use the system page.

Replace the right column content for `custom_package` academies with:
1. A **scaled iframe** of the real live custom site (`/portal/{slug}`) — always same-origin, no CORS issues
2. An **"Open live site"** button
3. A **reactive social footer preview** — a mini version of the `SiteContactFooter` that updates in real time as the mentor types their contact/social fields

The existing core-page mockup stays untouched for non-custom academies.

---

## Scope

| File | Change |
|---|---|
| `components/portal-branding-form.tsx` | Accept `websiteDeliveryMode` prop; conditional right column |
| `components/portal-branding-form.module.css` | Add iframe wrapper + social preview styles |
| `app/dashboard/settings/page.tsx` | Pass `website_delivery_mode` to `PortalBrandingForm` |

No new components, no migration, no API changes.

---

## 1 — Settings page: pass delivery mode

**File:** `app/dashboard/settings/page.tsx` — branding tab section

The query already uses `select("*")` so `portalData.website_delivery_mode` is available. Add it to the `PortalBrandingForm` props:

```tsx
<PortalBrandingForm
  initialPortal={portalData}
  riskTemplates={riskTemplates ?? []}
  websiteDeliveryMode={portalData.website_delivery_mode}
/>
```

---

## 2 — PortalBrandingForm: accept prop + conditional preview

**File:** `components/portal-branding-form.tsx`

### Prop interface

Add to `PortalBrandingFormProps`:
```typescript
websiteDeliveryMode: string;
```

### Destructure in component

```typescript
export function PortalBrandingForm({
  initialPortal,
  riskTemplates,
  websiteDeliveryMode,
}: PortalBrandingFormProps) {
```

### Replace the `<aside>` block

Find the existing `<aside className={styles.previewColumn}>` block (lines 481–523) and replace it entirely:

```tsx
<aside className={styles.previewColumn}>
  <div className={styles.previewLabel}>
    <span>Live preview</span>
    {websiteDeliveryMode === "custom_package" ? (
      <a
        href={`/portal/${values.slug || initialPortal.slug}`}
        target="_blank"
        rel="noreferrer"
        className={styles.openSiteLink}
      >
        Open live site <ExternalLink size={13} />
      </a>
    ) : (
      <small>Desktop</small>
    )}
  </div>

  {websiteDeliveryMode === "custom_package" ? (
    <>
      {/* Scaled iframe of the real custom site */}
      <div className={styles.iframeWrapper}>
        <iframe
          className={styles.siteIframe}
          src={`/portal/${values.slug || initialPortal.slug}`}
          title="Live site preview"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>

      {/* Reactive social footer preview */}
      <div className={styles.socialPreviewLabel}>
        <span>Footer preview</span>
        <small>Updates as you type</small>
      </div>
      <SocialFooterPreview values={values} primaryColor={values.primaryColor} />
    </>
  ) : (
    /* Existing core-page mockup — unchanged */
    <div className={styles.preview}>
      <header>
        <div>
          <span style={{ background: values.primaryColor }}>
            {logoPreview ? (
              <Image alt="" height={28} src={logoPreview} unoptimized width={28} />
            ) : (
              values.portalName[0]
            )}
          </span>
          <strong>{values.portalName || "Your portal"}</strong>
        </div>
      </header>
      <div className={styles.previewHero}>
        <small style={{ background: values.accentColor }}>Verified student community</small>
        <h3>{values.heroTitle || "Your hero title"}</h3>
        <p>{values.heroSubtitle || "Your hero subtitle will appear here."}</p>
        <div>
          <span style={{ background: values.primaryColor }}>{values.ctaLabel || "Join academy"}</span>
          <span>{values.brokerCtaLabel || "Open broker account"}</span>
        </div>
      </div>
      <div className={styles.previewWelcome}>
        <span>Welcome</span>
        <p>{values.welcomeMessage}</p>
      </div>
    </div>
  )}
</aside>
```

### `SocialFooterPreview` — define at the bottom of the file (before the closing brace, after the main export)

This is a pure local component — no separate file needed. Add it at the end of `portal-branding-form.tsx`:

```tsx
function SocialFooterPreview({
  values,
  primaryColor,
}: {
  values: Record<string, string>;
  primaryColor: string;
}) {
  const links: { label: string; href: string }[] = [];

  if (values.contactEmail)   links.push({ label: "Email",     href: `mailto:${values.contactEmail}` });
  if (values.contactPhone)   links.push({ label: "Call",      href: `tel:${values.contactPhone}` });
  if (values.whatsappNumber) {
    const digits = values.whatsappNumber.replace(/\D/g, "");
    if (digits) links.push({ label: "WhatsApp", href: `https://wa.me/${digits}` });
  }
  if (values.telegramUrl)    links.push({ label: "Telegram",  href: values.telegramUrl });
  if (values.instagramUrl)   links.push({ label: "Instagram", href: values.instagramUrl });
  if (values.facebookUrl)    links.push({ label: "Facebook",  href: values.facebookUrl });
  if (values.youtubeUrl)     links.push({ label: "YouTube",   href: values.youtubeUrl });
  if (values.twitterUrl)     links.push({ label: "X",         href: values.twitterUrl });
  if (values.tiktokUrl)      links.push({ label: "TikTok",    href: values.tiktokUrl });
  if (values.linkedinUrl)    links.push({ label: "LinkedIn",  href: values.linkedinUrl });

  return (
    <div
      className={styles.socialFooterPreview}
      style={{ background: primaryColor || "#111314" }}
    >
      {links.length === 0 ? (
        <p className={styles.socialFooterEmpty}>
          Fill in contact &amp; social fields to preview your footer.
        </p>
      ) : (
        <div className={styles.socialFooterLinks}>
          {links.map((link) => (
            <span key={link.label} className={styles.socialFooterLink}>
              {link.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

Note: links are rendered as `<span>` not `<a>` in the preview — this is intentional so the preview doesn't navigate away when clicked.

---

## 3 — CSS additions

**File:** `components/portal-branding-form.module.css`

Append to the end of the file:

```css
/* ── Custom site iframe preview ───────────────────────────── */
.iframeWrapper {
  width: 100%;
  height: 300px;
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid var(--border, #dce1e4);
  background: #f3f4f6;
  position: relative;
}

.siteIframe {
  width: 1280px;
  height: 1100px;
  border: none;
  transform-origin: top left;
  transform: scale(0.28);
  pointer-events: none;
}

.openSiteLink {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: #111314;
  text-decoration: none;
}
.openSiteLink:hover { text-decoration: underline; }

/* ── Social footer preview ───────────────────────────────── */
.socialPreviewLabel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 1rem 0 0.5rem;
}
.socialPreviewLabel span {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-primary, #111314);
}
.socialPreviewLabel small {
  font-size: 0.72rem;
  color: #8a9298;
}

.socialFooterPreview {
  border-radius: 12px;
  padding: 1rem 1.25rem;
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.socialFooterEmpty {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.45);
  text-align: center;
  margin: 0;
}

.socialFooterLinks {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
}

.socialFooterLink {
  font-size: 0.75rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  padding: 0.2rem 0.65rem;
}
```

### Iframe scale note

The scale `0.28` maps a 1280px-wide site into the ~358px preview column (`1280 × 0.28 = 358px`). If the preview column width changes, adjust accordingly. The visible height is `300px / 0.28 = 1071px` of the site — enough to see the hero and start of the custom site.

---

## 4 — Commit and deploy

```bash
git add -A
git commit -m "feat: EP-066 custom site iframe preview + reactive social footer preview in academy page settings"
git push origin main && vercel --prod
```

---

## 5 — Acceptance Criteria

Test against a `custom_package` academy (Traders Confidence or similar) and a `core_page` academy (KaiTrades).

- [ ] **Custom package academy:** right column shows scaled iframe of `/portal/{slug}`, not the HTML mockup
- [ ] **Custom package academy:** "Open live site" link appears top-right of the preview label, opens in new tab
- [ ] **Custom package academy:** social footer preview section appears below the iframe
- [ ] Social footer preview shows a dark card (using the primary color) with pill labels for every filled contact/social field
- [ ] Social footer preview updates in real time as the mentor types into the social fields — no save required
- [ ] Social footer preview shows the empty state text when no fields are filled
- [ ] **Core page academy:** right column still shows the existing HTML mockup unchanged
- [ ] TypeScript compiles clean
