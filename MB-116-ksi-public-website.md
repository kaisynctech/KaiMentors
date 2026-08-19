# MB-116 — KSI Custom Public Website Package

**Status:** Ready for Engineering  
**Date:** 2026-08-17  
**Depends on:** MB-115 (KSI portal exists in DB)  
**Blocks:** MB-118 (student registration), domain DNS setup

---

## Context

Build the public marketing website for KaiSync Institution as a custom site package — the same mechanism used for PASSII, TC, and Milkers FX. Visitors land here before enrolling. The site must represent KSI as a premium AI education platform.

**Design reference:** https://academyai.co.za — use it as inspiration for the dark, full-width academic layout. KSI's brand is black background with a purple-to-cyan gradient (matching the logo).

---

## Deliverables

### File structure

```
public/custom-sites/kaisync-institution/
└── v1/
    ├── index.html          ← Homepage
    ├── about.html          ← About KaiSync Institution
    ├── courses.html        ← What you'll learn / curriculum
    ├── tools.html          ← AI tools directory
    ├── pricing.html        ← Full pricing page
    ├── styles.css          ← Shared styles (dark theme)
    ├── app.js              ← Shared JS (nav, scroll reveal, ticker)
    └── assets/
        ├── kaisync-logo.png     ← KaiSync Institution logo (see note below)
        └── README.md            ← Placeholder note for future photo assets
```

**Logo note:** Save the KaiSync logo PNG (white-background version) to `assets/kaisync-logo.png`. Additionally create `assets/kaisync-logo-dark.png` if a transparent-background version is available — ideal for the dark header. If only the white-background version is available, use it at full size in the hero section and invert it in CSS for the header: `filter: brightness(0) invert(1)` so it renders as white on the dark background.

---

## Design System — `styles.css`

### Tokens

```css
:root {
  --bg:           #06060E;
  --surface:      #0F0C1A;
  --surface-2:    #16122A;
  --purple-deep:  #1A0A3D;
  --purple-mid:   #5B2DBF;
  --purple-light: #8B5CF6;
  --cyan:         #00C4D8;
  --cyan-dim:     #007A8A;
  --gradient:     linear-gradient(135deg, #2D1B8E 0%, #00C4D8 100%);
  --gradient-text: linear-gradient(90deg, #9B6DFF 0%, #00C4D8 100%);
  --text:         #F0EEF8;
  --text-muted:   #9B98B8;
  --line:         rgba(255, 255, 255, 0.07);
  --line-accent:  rgba(91, 45, 191, 0.4);
  --radius:       10px;
  --font:         'Inter', 'Segoe UI', system-ui, sans-serif;
}
```

### Base

- `body`: `background: var(--bg); color: var(--text); font-family: var(--font);`
- All section padding: `80px 24px` (desktop), `48px 20px` (mobile)
- Max content width: `1160px`, centred
- Links: colour `var(--cyan)`, no underline by default

### Typography

- `h1`: `clamp(2.4rem, 6vw, 4.2rem)`, weight 800, line-height 1.1
- `h2`: `clamp(1.8rem, 4vw, 2.8rem)`, weight 700
- `h3`: `1.15rem`, weight 600
- `.eyebrow`: `0.75rem`, uppercase, letter-spacing `0.12em`, colour `var(--cyan)`, display flex with `::before` dot
- `.lead`: `1.1rem`, colour `var(--text-muted)`, max-width `580px`
- Gradient text class `.grad`: `background: var(--gradient-text); -webkit-background-clip: text; -webkit-text-fill-color: transparent;`

### Buttons

```css
.btn {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 12px 28px; border-radius: 50px; font-weight: 600;
  font-size: 0.95rem; text-decoration: none; transition: all 0.2s;
  cursor: pointer; border: none;
}
.btn.primary {
  background: var(--gradient); color: #fff;
  box-shadow: 0 0 24px rgba(0, 196, 216, 0.25);
}
.btn.primary:hover { transform: translateY(-2px); box-shadow: 0 0 36px rgba(0, 196, 216, 0.4); }
.btn.ghost {
  background: transparent; color: var(--text);
  border: 1px solid var(--line-accent);
}
.btn.ghost:hover { border-color: var(--cyan); color: var(--cyan); }
```

### Scroll reveal

```css
.reveal { opacity: 0; transform: translateY(24px); transition: opacity 0.6s ease, transform 0.6s ease; }
.reveal.is-visible { opacity: 1; transform: none; }
.reveal.delay-1 { transition-delay: 0.1s; }
.reveal.delay-2 { transition-delay: 0.2s; }
.reveal.delay-3 { transition-delay: 0.3s; }
```

### Cards

```css
.card {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius); padding: 28px 24px;
  transition: border-color 0.2s, transform 0.2s;
}
.card:hover { border-color: var(--line-accent); transform: translateY(-3px); }
.card__icon {
  width: 44px; height: 44px; border-radius: 10px;
  background: linear-gradient(135deg, var(--purple-deep), var(--purple-mid));
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 16px; color: var(--cyan);
}
```

---

## Page Specs

### `index.html` — Homepage

#### `<head>`
```html
<title>KaiSync Institution | Learn AI. Build Products. Change Your Future.</title>
<meta name="description" content="South Africa's premier AI education platform. Learn to build websites, apps, SaaS products, automations, and AI agents using the world's most powerful tools.">
```

#### Header
Fixed header. Logo left, nav links centre-right, two CTAs at far right.

```html
<header class="ksi-header" data-header>
  <a class="brand" href="index.html" aria-label="KaiSync Institution home">
    <img src="assets/kaisync-logo.png" alt="KaiSync Institution" width="160" height="48"
         style="filter: brightness(0) invert(1);">
  </a>
  <button class="nav-toggle" data-nav-toggle aria-label="Toggle navigation" aria-expanded="false">
    <span></span><span></span><span></span>
  </button>
  <nav class="ksi-nav" data-nav>
    <a href="index.html" aria-current="page">Home</a>
    <a href="about.html">About</a>
    <a href="courses.html">Courses</a>
    <a href="tools.html">AI Tools</a>
    <a href="pricing.html">Pricing</a>
    <a class="nav-cta btn primary" href="signup.html">Enrol Now</a>
    <a class="nav-login" href="login.html">Login</a>
  </nav>
</header>
```

Header scrolled state: `background: rgba(6,6,14,0.95); backdrop-filter: blur(12px); border-bottom: 1px solid var(--line);`

#### Hero Section

Full-viewport hero. Animated background: SVG circuit-board grid pattern that pulses, with purple glow orbs in the corners. Two-column layout on desktop (copy left, visual right).

```html
<section class="hero">
  <!-- Animated background -->
  <div class="hero-bg" aria-hidden="true">
    <!-- Floating orbs -->
    <div class="orb orb--purple"></div>
    <div class="orb orb--cyan"></div>
    <!-- Circuit grid SVG: thin lines connecting dots, like a PCB -->
    <svg class="hero-circuit" viewBox="0 0 800 600" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- horizontal and vertical lines with nodes at intersections, low opacity purple/cyan -->
      <!-- Use opacity 0.06 on lines, 0.12 on dots -->
    </svg>
  </div>

  <div class="hero-inner">
    <div class="hero-copy reveal">
      <p class="kicker">South Africa's AI Academy</p>
      <h1>Learn AI.<br>Build Products.<br><span class="grad">Change Your Future.</span></h1>
      <p class="lead">
        From websites and apps to automation, AI agents and SaaS products —
        learn to build with the world's most powerful AI tools.
        Practical skills. Real projects. Expert mentorship.
      </p>
      <div class="btn-row">
        <a class="btn primary" href="signup.html">Enrol Now</a>
        <a class="btn ghost" href="pricing.html">View Plans</a>
      </div>
      <p class="hero-note">Flexible monthly plans from <b>R250/month</b> · Cancel anytime</p>
    </div>
    <div class="hero-visual reveal delay-2" aria-hidden="true">
      <!-- Glowing logo mark centred in a circular gradient ring -->
      <div class="hero-logo-ring">
        <img src="assets/kaisync-logo.png" alt="" width="300" height="300"
             style="filter: brightness(0) invert(1);">
      </div>
      <!-- Floating stat chips around the ring -->
      <div class="hero-chip hero-chip--1">🤖 AI Agents</div>
      <div class="hero-chip hero-chip--2">⚡ Automation</div>
      <div class="hero-chip hero-chip--3">📱 Mobile Apps</div>
      <div class="hero-chip hero-chip--4">🌐 Web Products</div>
    </div>
  </div>
</section>
```

**Orb CSS:**
```css
.orb { position: absolute; border-radius: 50%; filter: blur(100px); pointer-events: none; }
.orb--purple { width: 500px; height: 500px; background: rgba(91,45,191,0.18); top: -100px; right: -100px; }
.orb--cyan    { width: 320px; height: 320px; background: rgba(0,196,216,0.12); bottom: 0; left: -80px; }
```

**Hero logo ring:**
```css
.hero-logo-ring {
  width: 360px; height: 360px; border-radius: 50%;
  border: 1px solid rgba(91,45,191,0.35);
  box-shadow: 0 0 80px rgba(0,196,216,0.15), inset 0 0 60px rgba(91,45,191,0.08);
  display: flex; align-items: center; justify-content: center;
  position: relative;
}
```

**Floating chips:**
Small pill-shaped labels (`background: var(--surface-2); border: 1px solid var(--line-accent); padding: 6px 14px; border-radius: 20px; font-size: 0.8rem`) positioned absolutely around the ring using `transform: translate(...)`. Add a subtle CSS `@keyframes float` animation (translateY ±8px, 3-4s ease-in-out infinite, each chip offset).

#### Tech Ticker

Scrolling ticker below hero. Content: `AI Agents · Automation · Web Apps · Mobile Apps · SaaS Products · APIs · Databases · Animations · Business Classes · Python · Prompt Engineering · AI Mentorship` — repeat twice.

Style: `background: var(--surface); border-block: 1px solid var(--line); overflow: hidden; white-space: nowrap;`. Track uses `@keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }` at ~40s linear infinite.

#### "What You'll Build" Section

9-card grid (3×3 desktop, 2×2 tablet, 1 mobile). Each card has an SVG icon, title, one-line description.

```
1. Websites with AI      — icon: browser window
2. Mobile Apps           — icon: smartphone
3. SaaS Products         — icon: layers/stack
4. Databases             — icon: cylinder/DB
5. APIs                  — icon: plug/connect
6. AI Agents             — icon: robot/brain
7. Automations           — icon: lightning/loop
8. Animations            — icon: play/sparkle
9. Basic Gaming          — icon: gamepad
```

Section heading: `eyebrow: "What you'll build"` / `h2: "Real products. Real skills."` / `lead: "Everything at KaiSync Institution is hands-on — you leave with projects in your portfolio."`

#### AI Tools Section

Compact icon grid showing tools. 4-per-row desktop, 3 mobile. Each tool: small rounded tile with name and a representative SVG icon (no actual brand logos — use abstract icons that represent the tool's function). Include a note: `"We teach with industry-standard tools from day one."`

Tools to show (12 total):
```
Claude Code · ChatGPT · Grok · Cursor AI · Lovable
Runway · ElevenLabs · GitHub Copilot · Python
Base44 · Higgsfield · Designer.io
```

Section: `eyebrow: "Powered by"` / `h2: "Industry tools. From day one."` / `lead: "No toy environments — we use the same tools professionals use to ship real products."`

#### About Strip

Two-column: copy left, visual right (large glowing number or quote).

```
eyebrow: "Who we are"
h2: "Built for the next generation of African tech builders."
lead: "KaiSync Institution was founded to close the gap between curiosity and capability. 
       We teach practical AI skills that translate directly into products, income and careers."

3 bullet points:
• Practical curriculum — build real projects, not theory exercises
• Expert mentorship — live classes, one-on-one sessions, community
• Career-focused — business classes, marketing, scaling your product

CTA: "Our story →" → about.html
```

Right side: large `</> AI` text in gradient, or a simple animated SVG showing code → product flow.

#### Pricing Section

3 cards in a row. Middle card (`Intermediate`) is highlighted with a gradient border and "Most Popular" chip.

```
BASIC — R250/month
"Get started with AI"
• All courses
• AI Tools directory
• Community access
• Self-paced learning
[ Enrol — Basic → signup.html ]

INTERMEDIATE — R400/month  ← highlighted, "Most Popular"
"Go deeper with AI"
• Everything in Basic
• Live classes
• Group sessions
• Project workshops
[ Enrol — Intermediate → signup.html ]

PRO — R700/month
"Build and launch"
• Everything in Intermediate
• One-on-one mentorship bookings
• Priority support
• Early access to new content
[ Enrol — Pro → signup.html ]
```

All Enrol buttons → `signup.html` (resolved to `/join-academy` by reservedLinks).

Note below cards: `"All plans are monthly and cancel anytime. Prices in South African Rand (ZAR). International students welcome."`

#### Social / Contact Strip

Horizontal bar with social links (icon + name) and contact email. Use SVG icons for each platform.

```
Platforms to include (use placeholder hrefs — Nyarie will fill in real URLs):
• WhatsApp     (data-whatsapp — set by editable_schema)
• Instagram    (data-instagram)
• TikTok       (data-tiktok)
• YouTube      (data-youtube)
• Facebook     (data-facebook)
• Discord      (data-discord)

Contact: kaisynctech@gmail.com (or data-email from editable_schema)
```

Use `data-*` attributes for all social URLs so the app.js can populate them from `window.__KSI_SITE__` (see app.js section below).

#### Final CTA

```html
<section class="section cta-section">
  <div class="cta reveal">
    <p class="eyebrow" style="justify-content:center;">Start today</p>
    <h2>Your AI journey starts here.</h2>
    <p>Join KaiSync Institution and start building real products with AI — one skill, one project at a time.</p>
    <div class="btn-row" style="justify-content:center;">
      <a class="btn primary" href="signup.html">Enrol Now</a>
      <a class="btn ghost" href="pricing.html">Compare Plans</a>
    </div>
  </div>
</section>
```

#### Footer

```html
<footer class="ksi-footer">
  <div class="ksi-footer-wrap">
    <div class="ksi-footer-brand">
      <img src="assets/kaisync-logo.png" alt="KaiSync Institution" width="140" height="42"
           style="filter: brightness(0) invert(1);">
      <p>Learn AI. Build Products. Change Your Future.</p>
    </div>
    <div class="ksi-footer-cols">
      <div>
        <h4>Platform</h4>
        <a href="about.html">About</a>
        <a href="courses.html">Courses</a>
        <a href="tools.html">AI Tools</a>
        <a href="pricing.html">Pricing</a>
      </div>
      <div>
        <h4>Enrol</h4>
        <a href="signup.html">Get started</a>
        <a href="login.html">Student login</a>
      </div>
      <div>
        <h4>Connect</h4>
        <!-- Social links populated by app.js from data attributes -->
        <a href="#" data-footer-whatsapp>WhatsApp</a>
        <a href="#" data-footer-instagram>Instagram</a>
        <a href="#" data-footer-tiktok>TikTok</a>
        <a href="#" data-footer-discord>Discord</a>
      </div>
    </div>
  </div>
  <div class="ksi-footer-bar">
    <span>© 2026 KaiSync Institution. All rights reserved.</span>
    <span>AI education for the next generation of African builders.</span>
  </div>
</footer>
```

---

### `about.html` — About KaiSync Institution

Sections:
1. Hero strip: `"Built to teach AI that creates real outcomes."` — full-width, dark, no image
2. Mission statement: why KSI was founded, who it's for (beginners through advanced)
3. What makes KSI different: 3 points — practical projects, real tools, business-focused curriculum
4. Business classes callout: marketing, scaling, research skills
5. CTA: Enrol Now

---

### `courses.html` — What You'll Learn

Sections:
1. Hero strip: `"A curriculum built around building."`
2. 9 build categories with expanded descriptions (websites, apps, SaaS, etc.)
3. Business classes section: marketing, scaling, research skills
4. AI level selector explanation (Beginner / Intermediate / Advanced — mentioned at registration)
5. CTA: Enrol Now

---

### `tools.html` — AI Tools

Sections:
1. Hero strip: `"The tools. The techniques. The edge."`
2. All 12 tools in a detailed grid — name, short description of what it's used for in the curriculum
3. `"Tools are updated as the industry evolves — students always learn what's current."`
4. CTA: Enrol Now

---

### `pricing.html` — Full Pricing Page

Sections:
1. Hero strip: `"Simple pricing. No hidden fees."`
2. The 3 plan cards (same as homepage, expanded with full feature list)
3. FAQ section:
   - "Can I cancel anytime?" → Yes, monthly billing, no lock-in
   - "What payment methods are accepted?" → Card payment via secure checkout
   - "Can I upgrade my plan?" → Yes, from your account dashboard
   - "Is this available outside South Africa?" → Yes, international students welcome
4. CTA

---

## `app.js`

Extend the PASSII app.js pattern. Add:

```javascript
// KaiSync Institution — site JS

(function () {
  "use strict";

  // 1. Mobile nav toggle (same as PASSII)
  const navToggle = document.querySelector("[data-nav-toggle]");
  const nav = document.querySelector("[data-nav]");
  if (navToggle && nav) {
    navToggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(isOpen));
    });
    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        nav.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });
    document.addEventListener("click", (event) => {
      if (!nav.contains(event.target) && !navToggle.contains(event.target)) {
        nav.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  // 2. Scroll header state
  const header = document.querySelector("[data-header]");
  if (header) {
    const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  // 3. Scroll reveal
  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && revealEls.length) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealEls.forEach((el) => observer.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-visible"));
  }

  // 4. Social links from site config injected by the platform
  //    The platform injects window.__KSI_SITE__ = { whatsapp, instagram, tiktok, youtube, facebook, discord, email }
  //    via the custom site renderer using content_overrides from custom_site_assignments.
  const site = window.__KSI_SITE__ || {};
  const socialMap = {
    "[data-whatsapp]":        site.whatsapp    ? "https://wa.me/" + site.whatsapp.replace(/\D/g, "") : null,
    "[data-instagram]":       site.instagram   || null,
    "[data-tiktok]":          site.tiktok      || null,
    "[data-youtube]":         site.youtube     || null,
    "[data-facebook]":        site.facebook    || null,
    "[data-discord]":         site.discord     || null,
    "[data-footer-whatsapp]": site.whatsapp    ? "https://wa.me/" + site.whatsapp.replace(/\D/g, "") : null,
    "[data-footer-instagram]":site.instagram   || null,
    "[data-footer-tiktok]":   site.tiktok      || null,
    "[data-footer-discord]":  site.discord     || null,
  };
  Object.entries(socialMap).forEach(([selector, url]) => {
    if (!url) return;
    document.querySelectorAll(selector).forEach((el) => {
      el.href = url;
      el.closest(".social-link-wrap")?.classList.remove("is-hidden");
    });
  });

})();
```

---

## Task 2 — Migration: register package in DB

**File:** `supabase/migrations/20260817130000_ksi_custom_site_package.sql`

```sql
-- MB-116: Register KaiSync Institution custom site package

insert into public.custom_site_packages (
  package_key,
  version,
  name,
  description,
  category,
  asset_base_path,
  entry_page,
  manifest,
  editable_schema,
  reserved_paths,
  is_active
)
values (
  'kaisync-institution',
  1,
  'KaiSync Institution',
  'AI education platform public website — courses, tools, pricing, about.',
  'AI academy',
  '/custom-sites/kaisync-institution/v1',
  'index',
  '{
    "pages": [
      {"slug": "home",     "file": "index.html",    "label": "Home",     "path": "/"},
      {"slug": "about",    "file": "about.html",    "label": "About",    "path": "/about"},
      {"slug": "courses",  "file": "courses.html",  "label": "Courses",  "path": "/courses"},
      {"slug": "tools",    "file": "tools.html",    "label": "AI Tools", "path": "/tools"},
      {"slug": "pricing",  "file": "pricing.html",  "label": "Pricing",  "path": "/pricing"}
    ],
    "reservedLinks": {
      "login.html":  "/login",
      "signup.html": "/join-academy"
    }
  }'::jsonb,
  '[
    {"key": "announcement", "label": "Site announcement bar text",  "type": "text", "default": ""},
    {"key": "whatsapp",     "label": "WhatsApp number (digits only)","type": "text", "default": ""},
    {"key": "instagram",    "label": "Instagram URL",                "type": "url",  "default": ""},
    {"key": "tiktok",       "label": "TikTok URL",                   "type": "url",  "default": ""},
    {"key": "youtube",      "label": "YouTube channel URL",          "type": "url",  "default": ""},
    {"key": "facebook",     "label": "Facebook page URL",            "type": "url",  "default": ""},
    {"key": "discord",      "label": "Discord invite URL",           "type": "url",  "default": ""},
    {"key": "email",        "label": "Contact email",                "type": "text", "default": "kaisynctech@gmail.com"}
  ]'::jsonb,
  '["/login","/academy","/student","/join-academy","/dashboard","/admin","/api"]'::jsonb,
  true
)
on conflict (package_key, version)
do update set
  name            = excluded.name,
  description     = excluded.description,
  category        = excluded.category,
  asset_base_path = excluded.asset_base_path,
  entry_page      = excluded.entry_page,
  manifest        = excluded.manifest,
  editable_schema = excluded.editable_schema,
  reserved_paths  = excluded.reserved_paths,
  is_active       = true;

-- Route rules
insert into public.custom_site_route_rules (
  package_id, source_path, target_type, target_value, sort_order
)
select p.id, r.source_path, r.target_type, r.target_value, r.sort_order
from public.custom_site_packages p
cross join (values
  ('/login',       'kaimentors_route', '/login',       10),
  ('/academy',     'kaimentors_route', '/student',     20),
  ('/student',     'kaimentors_route', '/student',     30),
  ('/join-academy','kaimentors_route', '/join-academy', 40)
) as r(source_path, target_type, target_value, sort_order)
where p.package_key = 'kaisync-institution' and p.version = 1
on conflict (package_id, source_path)
do update set
  target_type  = excluded.target_type,
  target_value = excluded.target_value,
  sort_order   = excluded.sort_order,
  is_active    = true;
```

---

## Task 3 — Assign package to KSI portal

Run via `execute_sql` after the migration. Replace `[KSI_TRADER_ID]` and `[KSI_PORTAL_ID]` with actual values from MB-115.

```sql
insert into public.custom_site_assignments (
  trader_id,
  portal_id,
  package_id,
  status,
  content_overrides,
  show_powered_by,
  assigned_by,
  activated_at
)
select
  '[KSI_TRADER_ID]'::uuid,
  '[KSI_PORTAL_ID]'::uuid,
  p.id,
  'active',
  '{"email": "kaisynctech@gmail.com"}'::jsonb,
  false,
  (select id from public.profiles where email = 'kaisynctech@gmail.com'),
  now()
from public.custom_site_packages p
where p.package_key = 'kaisync-institution' and p.version = 1
on conflict (portal_id) do update set
  package_id       = excluded.package_id,
  status           = excluded.status,
  content_overrides = excluded.content_overrides,
  show_powered_by  = excluded.show_powered_by,
  activated_at     = coalesce(public.custom_site_assignments.activated_at, excluded.activated_at);

-- Switch portal to custom_package delivery mode
update public.portals
set website_delivery_mode = 'custom_package'
where id = '[KSI_PORTAL_ID]'::uuid;
```

---

## Acceptance Criteria

1. All 5 HTML files exist under `public/custom-sites/kaisync-institution/v1/`
2. `styles.css` and `app.js` exist in the same folder
3. `assets/kaisync-logo.png` exists and renders correctly on a dark background
4. Homepage loads at `kaimentors.vercel.app/portal/kaisync-institution` (core page preview) or the platform domain test URL — header, hero, ticker, build cards, tools, pricing, and footer all render correctly
5. `signup.html` href routes to `/join-academy`; `login.html` href routes to `/login`
6. Mobile nav toggle works
7. Scroll reveal animations fire on scroll
8. Pricing cards show R250 / R400 / R700 correctly
9. Migration applies with no errors: `custom_site_packages` row exists with `package_key = 'kaisync-institution'`
10. `custom_site_assignments` row exists for KSI portal with `show_powered_by = false`
11. `portals.website_delivery_mode = 'custom_package'` for KSI portal
12. TypeScript build passes (no TS changes in this Brief, but run `npx tsc --noEmit` to confirm)

---

## Notes

- `is_published` remains `false` on the portal until the domain is live and Nyarie confirms the site is ready. Do not publish.
- The `poweredByLabel` field is intentionally omitted from the manifest — KSI is Nyarie's own brand, not a white-label client. `show_powered_by = false` is already set in the assignment.
- Social link hrefs are placeholders — Nyarie will provide actual URLs via Admin → Site Settings once the site is live.
- Photo assets (team photos, event photos) are not included in this brief. Use CSS placeholder blocks (`background: var(--surface-2); border: 1px solid var(--line)`) wherever images would go. Nyarie will supply photos for a future update.
- The `window.__KSI_SITE__` injection pattern follows the same approach as other packages — the custom site renderer already injects `content_overrides` as a global JS object. Verify the exact variable name the renderer uses by reading `components/custom-site-renderer.tsx` or equivalent before writing the app.js injection code. Do not guess.
