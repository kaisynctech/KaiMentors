# EP-058 — XM Global partner badge on login and signup pages

All mentors on KaiMentors are partnered with XM Global. Add the XM Global logo and a
"Partnered with XM Global" label to every login and signup page as a trust signal.

---

## No database changes required

---

## Step 1 — Add the XM Global logo asset

Download the official XM Global logo (black version, PNG or SVG) from
`https://www.xm.com/` (press kit / brand resources) and save it at:

```
public/images/xm-global-logo.png
```

The file the user shared shows the standard XM logo — black "XM" with red triangle accent.
Use the horizontal version on a transparent background so it works on any card colour.

If the PNG has a white background, use the SVG variant or ask the user to supply a
transparent-background copy. The logo should render cleanly at 80–100 px wide.

---

## Step 2 — Edit: `components/academy-entry.module.css`

Add the partner badge styles at the end of the file:

```css
/* XM Global partner badge */
.partnerBadge {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid rgba(17, 19, 21, 0.08);
  color: #7a8594;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.partnerBadge img {
  height: 18px;
  width: auto;
  object-fit: contain;
  opacity: 0.85;
}
```

---

## Step 3 — Edit: `components/academy-login-page.tsx`

Add `Image` is already imported. Add the badge block after the last `<p className={styles.footerNote}>` element, just before the closing `</section>`:

```tsx
<div className={styles.partnerBadge}>
  <Image
    alt="XM Global"
    height={18}
    src="/images/xm-global-logo.png"
    unoptimized
    width={60}
  />
  <span>Partnered with XM Global</span>
</div>
```

Full card section after the change (showing context around insertion point):

```tsx
<section className={styles.card}>
  <div className={styles.cardHeader}>
    {/* ... unchanged ... */}
  </div>
  <LoginForm {/* ... unchanged ... */} />
  <p className={styles.footerNote}>
    <Link href={setupHref}>Resume account setup</Link> · <Link href={recoveryHref}>Forgot password</Link>
  </p>
  <p className={styles.footerNote}>
    Secure academy access powered by KaiMentors.
  </p>
  {/* ↓ add this */}
  <div className={styles.partnerBadge}>
    <Image
      alt="XM Global"
      height={18}
      src="/images/xm-global-logo.png"
      unoptimized
      width={60}
    />
    <span>Partnered with XM Global</span>
  </div>
</section>
```

---

## Step 4 — Edit: `components/academy-join-page.tsx`

`Image` is already imported. Add the badge block at the bottom of `<section className={styles.card}>`, after the closing `</StudentRegistrationForm />`:

```tsx
<section className={styles.card}>
  <div className={styles.cardHeader}>
    {/* ... unchanged ... */}
  </div>
  <StudentRegistrationForm {/* ... unchanged ... */} />
  {/* ↓ add this */}
  <div className={styles.partnerBadge}>
    <Image
      alt="XM Global"
      height={18}
      src="/images/xm-global-logo.png"
      unoptimized
      width={60}
    />
    <span>Partnered with XM Global</span>
  </div>
</section>
```

---

## Step 5 — Edit: `app/auth.module.css`

Add the partner badge styles for the mentor login aside panel:

```css
/* XM Global partner badge */
.partnerBadge {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #757d83;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.partnerBadge img {
  height: 16px;
  width: auto;
  object-fit: contain;
  opacity: 0.75;
}
```

---

## Step 6 — Edit: `app/login/page.tsx`

Replace the existing `<small>` footer text in the aside with the partner badge:

Before:
```tsx
<small>Secure multi-tenant infrastructure powered by Supabase.</small>
```

After:
```tsx
<div className={styles.partnerBadge}>
  <Image
    alt="XM Global"
    height={16}
    src="/images/xm-global-logo.png"
    unoptimized
    width={54}
  />
  <span>Partnered with XM Global</span>
</div>
```

Add `Image` import at the top of the file:

```ts
import Image from "next/image";
```

---

## Acceptance criteria

- [ ] `public/images/xm-global-logo.png` exists with a transparent background; renders
  cleanly at widths 54–100 px
- [ ] Academy login page shows the XM Global badge at the bottom of the card, below the
  footer links
- [ ] Academy join/signup page shows the XM Global badge at the bottom of the card, below
  the registration form
- [ ] Mentor platform login (`/login`) shows the XM Global badge in the aside panel at the
  bottom left, in place of the old Supabase text
- [ ] `domain-sites` login and join pages inherit the changes automatically (they render the
  same `AcademyLoginPage` and `AcademyJoinPage` components)
- [ ] Badge is visible but unobtrusive — it should read as a trust signal, not a
  co-branding headline
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] Deploy with `vercel --prod`

## Implementation order

1. Download and save XM Global logo to `public/images/xm-global-logo.png`
2. Add CSS to `academy-entry.module.css`
3. Edit `academy-login-page.tsx`
4. Edit `academy-join-page.tsx`
5. Add CSS to `auth.module.css`
6. Edit `app/login/page.tsx` (add Image import, replace `<small>`)
7. Build, verify visually, commit, deploy
