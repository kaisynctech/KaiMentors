# EP-067 — Academy Page Form: Simplify for Custom Sites

**Date:** 2026-07-02
**Status:** Ready for implementation

---

## Objective

The Academy Page settings form shows fields that do nothing for custom site academies — hero title, subtitle, welcome message, CTA labels, accent color. These all drive the `CoreAcademyPage` component which custom site mentors never see.

Two targeted changes to `components/portal-branding-form.tsx`:

1. **Rename color labels** conditionally — "Primary color" → "Footer colour" and hide accent color entirely for `custom_package` (the only use of `primary_color` on a custom site is the `SiteContactFooter` background)
2. **Hide the "Hero and welcome message" section** for `custom_package` — all five fields (academy description, hero title, hero subtitle, welcome message, CTA labels) are irrelevant

`websiteDeliveryMode` is already a prop on `PortalBrandingForm` from EP-066 — no settings page change needed.

No migration, no CSS changes, no API changes.

---

## Scope

| File | Change |
|---|---|
| `components/portal-branding-form.tsx` | Conditional labels + conditional section visibility |

---

## 1 — Rename color labels

**File:** `components/portal-branding-form.tsx`

Find the `twoColumns` div containing "Primary color" and "Accent color" (around line 209). Make two changes:

### 1a — Rename "Primary color" label

```tsx
// BEFORE:
<label>
  Primary color
  <span className={styles.colorField}>

// AFTER:
<label>
  {websiteDeliveryMode === "custom_package" ? "Footer colour" : "Primary color"}
  <span className={styles.colorField}>
```

### 1b — Hide "Accent color" for custom sites

Wrap the entire accent color `<label>` in a conditional:

```tsx
// BEFORE:
<label>
  Accent color
  <span className={styles.colorField}>
    ...
  </span>
</label>

// AFTER:
{websiteDeliveryMode !== "custom_package" && (
  <label>
    Accent color
    <span className={styles.colorField}>
      ...
    </span>
  </label>
)}
```

---

## 2 — Hide "Hero and welcome message" section

**File:** `components/portal-branding-form.tsx`

Find the entire `<section>` with the "Content / Hero and welcome message" header (starts around line 258, ends around line 322 — closing `</section>` after the CTA twoColumns div). Wrap the whole section:

```tsx
// BEFORE:
<section className={styles.section}>
  <div className={styles.sectionHeader}>
    <div>
      <span>Content</span>
      <h2>Hero and welcome message</h2>
    </div>
  </div>
  <label>Academy description ... </label>
  <label>Hero title ... </label>
  <label>Hero subtitle ... </label>
  <label>Welcome message ... </label>
  <div className={styles.twoColumns}>
    <label>CTA button text ... </label>
    <label>Broker signup button text ... </label>
  </div>
</section>

// AFTER:
{websiteDeliveryMode !== "custom_package" && (
  <section className={styles.section}>
    <div className={styles.sectionHeader}>
      <div>
        <span>Content</span>
        <h2>Hero and welcome message</h2>
      </div>
    </div>
    <label>Academy description ... </label>
    <label>Hero title ... </label>
    <label>Hero subtitle ... </label>
    <label>Welcome message ... </label>
    <div className={styles.twoColumns}>
      <label>CTA button text ... </label>
      <label>Broker signup button text ... </label>
    </div>
  </section>
)}
```

---

## 3 — Result for each delivery mode

**`custom_package` mentor sees:**
- Identity: portal name, slug, logo, publish toggle
- Footer colour (primary_color) — controls `SiteContactFooter` background
- *(Accent color hidden)*
- *(Hero and welcome message section hidden)*
- Contact & Socials — all 10 fields
- Compliance — risk disclosure

**`core_page` / `builder_template` mentor sees:**
- Everything as before — no change

---

## 4 — Commit and deploy

```bash
git add -A
git commit -m "feat: EP-067 simplify academy page form for custom site academies — hide hero section, rename color labels"
git push origin main && vercel --prod
```

---

## 5 — Acceptance Criteria

- [ ] KaiTrades (custom_package): "Hero and welcome message" section is not visible in the Academy Page tab
- [ ] KaiTrades (custom_package): color picker row shows "Footer colour" (not "Primary color") and no "Accent color" picker
- [ ] KaiTrades (custom_package): Contact & Socials and Compliance sections still visible and functional
- [ ] Core page academy: all sections still present and unchanged
- [ ] TypeScript compiles clean
