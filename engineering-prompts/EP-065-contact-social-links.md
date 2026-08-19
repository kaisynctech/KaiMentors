# EP-065 — Contact & Social Links

**Date:** 2026-07-02
**Status:** Ready for implementation

---

## Objective

Give every academy a full contact and social presence that mentors manage from the dashboard and that appears on their live site automatically.

**Already exists** on `portals` and wired end-to-end: `whatsapp_number`, `telegram_url`, `instagram_url`, `contact_email`. These do NOT need migration or form changes — they work today.

**This EP adds** the six missing fields and injects a contact footer into custom site packages, which currently have no contact/social output at all.

---

## Scope

| Area | Work |
|---|---|
| DB | Add 6 columns to `portals` |
| API | Extend `/api/portal/branding` Zod schema + DB update |
| Form | Add 6 inputs to `PortalBrandingForm` |
| Core academy page | Add 6 new platforms to existing social links row |
| `lib/academy-entry.ts` | Add 6 fields to interface + select query |
| `lib/custom-sites.ts` | Add all contact/social fields to `CustomSitePortal` interface + portal queries |
| New component | `SiteContactFooter` + CSS — footer rendered below custom site HTML |
| `CustomSiteRenderer` | Render `<SiteContactFooter>` below HTML body |

---

## 1 — Migration

**File:** `supabase/migrations/20260702140000_portal_contact_socials.sql`

```sql
ALTER TABLE public.portals
  ADD COLUMN IF NOT EXISTS contact_phone TEXT
    CONSTRAINT portals_contact_phone_length
      CHECK (contact_phone IS NULL OR char_length(contact_phone) <= 32),
  ADD COLUMN IF NOT EXISTS facebook_url TEXT
    CONSTRAINT portals_facebook_url_length
      CHECK (facebook_url IS NULL OR char_length(facebook_url) <= 500),
  ADD COLUMN IF NOT EXISTS youtube_url TEXT
    CONSTRAINT portals_youtube_url_length
      CHECK (youtube_url IS NULL OR char_length(youtube_url) <= 500),
  ADD COLUMN IF NOT EXISTS twitter_url TEXT
    CONSTRAINT portals_twitter_url_length
      CHECK (twitter_url IS NULL OR char_length(twitter_url) <= 500),
  ADD COLUMN IF NOT EXISTS tiktok_url TEXT
    CONSTRAINT portals_tiktok_url_length
      CHECK (tiktok_url IS NULL OR char_length(tiktok_url) <= 500),
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT
    CONSTRAINT portals_linkedin_url_length
      CHECK (linkedin_url IS NULL OR char_length(linkedin_url) <= 500);
```

Apply via Supabase MCP against project `jsbpfhfmumjbrnymhtvq` immediately after writing.

---

## 2 — API route

**File:** `app/api/portal/branding/route.ts`

Add the 6 new fields to the Zod schema alongside the existing ones:

```typescript
// Add alongside existing optional URL fields:
facebookUrl:  optionalUrl,
youtubeUrl:   optionalUrl,
twitterUrl:   optionalUrl,
tiktokUrl:    optionalUrl,
linkedinUrl:  optionalUrl,
contactPhone: z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.string().max(32).nullable().optional(),
),
```

In `formData.get(...)` extraction block, add:
```typescript
facebookUrl:  formData.get("facebookUrl") || null,
youtubeUrl:   formData.get("youtubeUrl") || null,
twitterUrl:   formData.get("twitterUrl") || null,
tiktokUrl:    formData.get("tiktokUrl") || null,
linkedinUrl:  formData.get("linkedinUrl") || null,
contactPhone: formData.get("contactPhone") || null,
```

In the Supabase `.update({...})` call, add:
```typescript
facebook_url:  branding.facebookUrl,
youtube_url:   branding.youtubeUrl,
twitter_url:   branding.twitterUrl,
tiktok_url:    branding.tiktokUrl,
linkedin_url:  branding.linkedinUrl,
contact_phone: branding.contactPhone,
```

---

## 3 — PortalBrandingForm

**File:** `components/portal-branding-form.tsx`

### Interface

Add to `initialPortal` prop type:
```typescript
contact_phone: string | null;
facebook_url:  string | null;
youtube_url:   string | null;
twitter_url:   string | null;
tiktok_url:    string | null;
linkedin_url:  string | null;
```

### State initialisation

Add to `values` state:
```typescript
contactPhone: initialPortal.contact_phone ?? "",
facebookUrl:  initialPortal.facebook_url ?? "",
youtubeUrl:   initialPortal.youtube_url ?? "",
twitterUrl:   initialPortal.twitter_url ?? "",
tiktokUrl:    initialPortal.tiktok_url ?? "",
linkedinUrl:  initialPortal.linkedin_url ?? "",
```

### Form inputs

In the existing "Contact & Social" section (where WhatsApp, Telegram, Instagram inputs live), add the following inputs after the existing three:

```tsx
<label>
  Phone number
  <input
    name="contactPhone"
    placeholder="+44 7911 123456"
    type="tel"
    value={values.contactPhone}
    onChange={updateValue}
  />
</label>
<label>
  Facebook URL
  <input
    name="facebookUrl"
    placeholder="https://facebook.com/youracademy"
    type="url"
    value={values.facebookUrl}
    onChange={updateValue}
  />
</label>
<label>
  YouTube URL
  <input
    name="youtubeUrl"
    placeholder="https://youtube.com/@youracademy"
    type="url"
    value={values.youtubeUrl}
    onChange={updateValue}
  />
</label>
<label>
  X / Twitter URL
  <input
    name="twitterUrl"
    placeholder="https://x.com/youracademy"
    type="url"
    value={values.twitterUrl}
    onChange={updateValue}
  />
</label>
<label>
  TikTok URL
  <input
    name="tiktokUrl"
    placeholder="https://tiktok.com/@youracademy"
    type="url"
    value={values.tiktokUrl}
    onChange={updateValue}
  />
</label>
<label>
  LinkedIn URL
  <input
    name="linkedinUrl"
    placeholder="https://linkedin.com/company/youracademy"
    type="url"
    value={values.linkedinUrl}
    onChange={updateValue}
  />
</label>
```

---

## 4 — Academy entry type + query

**File:** `lib/academy-entry.ts`

Add to `AcademyEntryPortal` interface:
```typescript
contact_phone?: string | null;
facebook_url?:  string | null;
youtube_url?:   string | null;
twitter_url?:   string | null;
tiktok_url?:    string | null;
linkedin_url?:  string | null;
```

Extend the select query string (the constant near the top of the file) to include:
```
contact_phone,facebook_url,youtube_url,twitter_url,tiktok_url,linkedin_url
```
Append these alongside the existing `whatsapp_number,telegram_url,instagram_url` entries.

---

## 5 — CoreAcademyPage: add new platforms

**File:** `components/core-academy-page.tsx`

Import additional lucide-react icons at the top:
```typescript
import {
  ArrowRight, Facebook, Instagram, Linkedin, Mail,
  MessageCircle, Phone, Send, ShieldCheck, Twitter, Youtube,
} from "lucide-react";
```

TikTok has no lucide icon — use this inline SVG component defined at the top of the file:
```tsx
function TikTokIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z"/>
    </svg>
  );
}
```

In the existing `socialLinks` div, add the new links alongside the existing ones:
```tsx
<div className={styles.socialLinks}>
  {portal.contact_email   ? <a href={`mailto:${portal.contact_email}`}><Mail size={17} /> Email</a> : null}
  {portal.contact_phone   ? <a href={`tel:${portal.contact_phone}`}><Phone size={17} /> Call</a> : null}
  {whatsappUrl            ? <a href={whatsappUrl} rel="noreferrer" target="_blank"><MessageCircle size={17} /> WhatsApp</a> : null}
  {portal.telegram_url    ? <a href={portal.telegram_url} rel="noreferrer" target="_blank"><Send size={17} /> Telegram</a> : null}
  {portal.instagram_url   ? <a href={portal.instagram_url} rel="noreferrer" target="_blank"><Instagram size={17} /> Instagram</a> : null}
  {portal.facebook_url    ? <a href={portal.facebook_url} rel="noreferrer" target="_blank"><Facebook size={17} /> Facebook</a> : null}
  {portal.youtube_url     ? <a href={portal.youtube_url} rel="noreferrer" target="_blank"><Youtube size={17} /> YouTube</a> : null}
  {portal.twitter_url     ? <a href={portal.twitter_url} rel="noreferrer" target="_blank"><Twitter size={17} /> X</a> : null}
  {portal.tiktok_url      ? <a href={portal.tiktok_url} rel="noreferrer" target="_blank"><TikTokIcon /> TikTok</a> : null}
  {portal.linkedin_url    ? <a href={portal.linkedin_url} rel="noreferrer" target="_blank"><Linkedin size={17} /> LinkedIn</a> : null}
</div>
```

---

## 6 — Custom site portal type + queries

**File:** `lib/custom-sites.ts`

### `CustomSitePortal` interface

Add the full contact/social field set (including existing ones so they flow through to the renderer):
```typescript
// Add to CustomSitePortal interface:
contact_phone?:  string | null;
contact_email?:  string | null;
whatsapp_number?: string | null;
telegram_url?:   string | null;
instagram_url?:  string | null;
facebook_url?:   string | null;
youtube_url?:    string | null;
twitter_url?:    string | null;
tiktok_url?:     string | null;
linkedin_url?:   string | null;
```

### Portal queries

In `loadCustomSiteByResolution`, extend the `.select(...)` string to include all contact/social fields:
```typescript
"id,trader_id,slug,portal_name,hero_title,hero_subtitle,welcome_message,primary_color,accent_color,logo_path,is_published,website_delivery_mode,contact_phone,contact_email,whatsapp_number,telegram_url,instagram_url,facebook_url,youtube_url,twitter_url,tiktok_url,linkedin_url"
```

In `loadPortalBySlug` (used by `loadCustomSiteBySlug`), apply the same extended select string.

### `LoadedCustomSite` interface

Add:
```typescript
contactInfo: {
  phone:     string | null;
  email:     string | null;
  whatsapp:  string | null;
  telegram:  string | null;
  instagram: string | null;
  facebook:  string | null;
  youtube:   string | null;
  twitter:   string | null;
  tiktok:    string | null;
  linkedin:  string | null;
};
```

### `loadCustomSite` function

When constructing the return object, add:
```typescript
contactInfo: {
  phone:     portal.contact_phone    ?? null,
  email:     portal.contact_email    ?? null,
  whatsapp:  portal.whatsapp_number  ?? null,
  telegram:  portal.telegram_url     ?? null,
  instagram: portal.instagram_url    ?? null,
  facebook:  portal.facebook_url     ?? null,
  youtube:   portal.youtube_url      ?? null,
  twitter:   portal.twitter_url      ?? null,
  tiktok:    portal.tiktok_url       ?? null,
  linkedin:  portal.linkedin_url     ?? null,
},
```

---

## 7 — SiteContactFooter component

**File:** `components/site-contact-footer.tsx`

A server component (no `"use client"` needed — purely presentational). Renders only if at least one field is non-empty.

```typescript
import {
  Facebook, Instagram, Linkedin, Mail,
  MessageCircle, Phone, Send, Twitter, Youtube,
} from "lucide-react";
import styles from "./site-contact-footer.module.css";

function TikTokIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z"/>
    </svg>
  );
}

interface ContactInfo {
  phone:     string | null;
  email:     string | null;
  whatsapp:  string | null;
  telegram:  string | null;
  instagram: string | null;
  facebook:  string | null;
  youtube:   string | null;
  twitter:   string | null;
  tiktok:    string | null;
  linkedin:  string | null;
}

interface Props {
  contactInfo: ContactInfo;
  primaryColor: string;
  accentColor:  string;
}

export function SiteContactFooter({ contactInfo: c, primaryColor, accentColor }: Props) {
  const whatsappUrl = c.whatsapp
    ? `https://wa.me/${c.whatsapp.replace(/\D/g, "")}`
    : null;

  const hasAny = Object.values(c).some(Boolean);
  if (!hasAny) return null;

  return (
    <footer
      className={styles.footer}
      style={{ "--footer-primary": primaryColor, "--footer-accent": accentColor } as React.CSSProperties}
    >
      <div className={styles.inner}>
        <div className={styles.links}>
          {c.email     ? <a href={`mailto:${c.email}`} className={styles.link}><Mail size={16} /><span>Email</span></a> : null}
          {c.phone     ? <a href={`tel:${c.phone}`} className={styles.link}><Phone size={16} /><span>Call</span></a> : null}
          {whatsappUrl ? <a href={whatsappUrl} target="_blank" rel="noreferrer" className={styles.link}><MessageCircle size={16} /><span>WhatsApp</span></a> : null}
          {c.telegram  ? <a href={c.telegram} target="_blank" rel="noreferrer" className={styles.link}><Send size={16} /><span>Telegram</span></a> : null}
          {c.instagram ? <a href={c.instagram} target="_blank" rel="noreferrer" className={styles.link}><Instagram size={16} /><span>Instagram</span></a> : null}
          {c.facebook  ? <a href={c.facebook} target="_blank" rel="noreferrer" className={styles.link}><Facebook size={16} /><span>Facebook</span></a> : null}
          {c.youtube   ? <a href={c.youtube} target="_blank" rel="noreferrer" className={styles.link}><Youtube size={16} /><span>YouTube</span></a> : null}
          {c.twitter   ? <a href={c.twitter} target="_blank" rel="noreferrer" className={styles.link}><Twitter size={16} /><span>X</span></a> : null}
          {c.tiktok    ? <a href={c.tiktok} target="_blank" rel="noreferrer" className={styles.link}><TikTokIcon /><span>TikTok</span></a> : null}
          {c.linkedin  ? <a href={c.linkedin} target="_blank" rel="noreferrer" className={styles.link}><Linkedin size={16} /><span>LinkedIn</span></a> : null}
        </div>
      </div>
    </footer>
  );
}
```

**File:** `components/site-contact-footer.module.css`

```css
.footer {
  width: 100%;
  background: var(--footer-primary, #111314);
  color: #ffffff;
  padding: 2rem 1.5rem;
  margin-top: 0;
}

.inner {
  max-width: 1180px;
  margin: 0 auto;
}

.links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.5rem;
  justify-content: center;
}

.link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: rgba(255, 255, 255, 0.8);
  text-decoration: none;
  font-size: 0.85rem;
  font-weight: 600;
  transition: color 0.15s;
}

.link:hover {
  color: var(--footer-accent, #ffffff);
}

.link span {
  display: inline;
}
```

---

## 8 — CustomSiteRenderer: inject footer

**File:** `components/custom-site-renderer.tsx`

Import the footer component:
```typescript
import { SiteContactFooter } from "@/components/site-contact-footer";
```

Render it after the HTML body div and before the powered-by link:

```tsx
export function CustomSiteRenderer({ site }: CustomSiteRendererProps) {
  const poweredBy =
    site.assignment.show_powered_by &&
    (site.package.manifest.poweredByLabel ?? "Powered by KaiMentors");

  return (
    <>
      <link href={`${site.assetBasePath}/styles.css`} rel="stylesheet" />
      <style>{`
        .kaimentors-package-announcement { ... }
        .kaimentors-powered-by { ... }
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
```

---

## 9 — Settings page: pass new fields to PortalBrandingForm

**File:** `app/dashboard/settings/page.tsx` (branding tab section)

The query `supabase.from("portals").select("*")` already fetches all columns, so the new fields come through automatically via `select("*")`. No query change needed.

The `<PortalBrandingForm initialPortal={portalData} .../>` call passes the full portal object — since TypeScript will now expect the new fields, ensure the component prop type accepts them (already handled in step 3).

---

## 10 — Commit and deploy

```bash
git add -A
git commit -m "feat: EP-065 contact & social links — 6 new platforms, custom site footer"
git push origin main && vercel --prod
```

---

## 11 — Acceptance Criteria

Test against KaiTrades only.

- [ ] Migration applied — `\d portals` in SQL editor shows `contact_phone`, `facebook_url`, `youtube_url`, `twitter_url`, `tiktok_url`, `linkedin_url`
- [ ] Settings → Academy Page tab: all 10 contact/social fields visible and saveable (4 existing + 6 new)
- [ ] Fill in phone + all 6 new social URLs for KaiTrades, save — no error
- [ ] Core academy page (`/portal/kaitrades` or custom domain): all filled links appear in the social links row; empty ones do not render
- [ ] Custom site (Traders Confidence or any `custom_package` academy): footer appears below the site content with all filled links; footer is dark-background using `primary_color`
- [ ] Custom site with NO contact/social fields set: footer does not render at all (component returns null)
- [ ] Phone link opens `tel:` on mobile
- [ ] WhatsApp link opens `wa.me/` with digits-only number
- [ ] All external links open in a new tab with `rel="noreferrer"`
- [ ] TypeScript compiles clean — no unused imports
