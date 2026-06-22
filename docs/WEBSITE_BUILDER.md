# Website Builder

## Current Direction

Website Builder is a **legacy delivery mode**, not the active customer-facing direction. Its templates, pages, sections, themes, navigation, media, releases and publications remain stored and renderable for existing sites. Mentor-facing builder, preview, package and domain entry points redirect to `/dashboard/branding`; no legacy records are deleted.

Legacy builder save, media and release mutation APIs require super-admin authorization. The custom-package content endpoint remains mentor accessible only for fields declared in the assigned package's editable schema; it cannot change package identity, files, routes or layout.

`core_page` is the default delivery mode. It renders approved portal identity fields, logo, description, colours, contact/social links, Join Academy, Sign In and a platform-approved risk disclosure. It works at `/portal/[slug]` and on a verified custom domain. `custom_package` is assigned only by KaiMentors super admins and can replace presentation while continuing to use centralized academy entry routes. Pausing a package returns the portal to `core_page`.

All delivery modes delegate incomplete student identity setup to the shared `/account-setup` lifecycle. Website packages and templates may render entry links but cannot implement or duplicate OTP verification, password creation, invitation acceptance, tenant resolution, or account recovery.

Mentors edit Academy Page content at `/dashboard/branding`; routing slug, package layout and domains remain platform-managed. Domain administration lives at `/admin/domains` and requires provider/DNS verification before activation.

Last updated: 2026-06-20

## Purpose

The retained Website Builder engine renders existing template-driven academy sites. New academies use Core Academy Page unless a super admin assigns a custom package.

## Delivery Modes

Portals support website delivery through `website_delivery_mode`:

- `core_page`: default academy identity and entry page.
- `builder_template`: render the template-driven Website Builder.
- `custom_package`: render a platform-assigned custom website package.
- `external_website`: point to an external website URL when configured.

Only platform admins can assign custom site packages, switch delivery modes, manage domains, or mutate legacy builder layouts and releases.

## Template Engine

Templates are stored in `website_templates` with metadata:

- Name
- Description
- Thumbnail
- Category
- Active status
- Version
- Blueprint JSON
- Renderer key
- Editable schema
- Visibility

The template blueprint defines pages, sections, navigation, and theme defaults. `apply_website_template` applies a template to a portal after checking tenant/admin permissions.

Current initial templates:

- Professional Academy
- Luxury Trader
- Market Trader

## Page Architecture

`website_pages` stores pages for a portal. Current supported pages include home, about, why join, courses, testimonials, community, FAQ, contact, and join academy. The schema supports future pages through slug-based records.

Fields include title, description, sort order, home-page flag, enabled flag, and SEO fields.

## Section Architecture

`website_sections` stores reusable page blocks. Supported section types:

- `hero`
- `about`
- `features`
- `courses`
- `testimonials`
- `community`
- `cta`
- `faq`
- `contact`
- `join_academy`

Each section has JSON content and settings. This allows templates to be assembled from reusable sections without rewriting page logic.

## Theme Architecture

`website_theme_settings` stores portal theme settings such as colors, typography, and layout JSON. The public renderer consumes these values to keep generated sites brand-specific.

## Media

`website_media` stores metadata for uploaded website assets. Files are stored in the `website-media` Supabase Storage bucket.

## Navigation

`website_navigation` stores navigation items by portal, location, label, href, sort order, and enabled status.

## Draft, Preview, and Publishing

Mentors can edit builder content in `/dashboard/website-builder` and preview it through `/dashboard/website-builder/preview`.

Publishing creates immutable `website_releases` snapshots. `website_publications` points to the currently published release. Rollback and unpublish functions operate on releases rather than mutating historical snapshots.

## Custom Domains

`website_domains` stores connected domains and provisioning state. `website_domain_events` tracks DNS/SSL events. Domain automation uses Vercel configuration when `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, and optional `VERCEL_TEAM_ID` are configured.

## Custom Website Packages

KaiMentors supports custom-built client websites while preserving the central SaaS engine:

- `custom_site_packages` registers custom site packages under `public/custom-sites/...`.
- `custom_site_route_rules` maps custom site paths.
- `custom_site_assignments` assigns one package to a tenant portal.
- Mentors can update safe content overrides for their assigned package.
- Platform admins control assignment and delivery mode.

This supports the business model where KaiMentors builds bespoke client websites while students still authenticate into the KaiMentors-powered portal.

Custom site assignment statuses are `draft`, `active`, and `paused`.

Custom packages must reserve and route student access links back into KaiMentors:

- `/join-academy`
- `/login`
- `/academy`

The renderer also injects standard Join Academy and Sign In actions so every custom academy website exposes the canonical entry paths.

Custom-package HTML never owns tenant routing. `lib/academy-routes.ts` resolves home, internal package pages, Join Academy, Sign In, and authenticated academy destinations for either the platform portal route or a verified custom domain. Package manifests map source filenames to logical page paths and reserved student-entry destinations.

## KaiTrades Acceptance Package

KaiTrades is a permanent non-client fixture for validating the custom website experience:

- Package: `kaitrades` version 1.
- Asset path: `/custom-sites/kaitrades/v1`.
- Structure: Home, About, Signals, Mentorship, Events, and Broker Setup.
- Reserved links: package `signup.html` references resolve to Join Academy; `login.html` references resolve to Sign In.
- Branding and content identify KaiTrades as test data and contain no Traders Confidence names, contact details, affiliate URLs, logo paths, or forms.
- The package mirrors the approved premium structure without sharing the Traders Confidence package row, route rules, assignment, or assets.

## Public Rendering

Published websites are served at:

- `/portal/[slug]`
- `/portal/[slug]/[pageSlug]`
- custom hostnames rewritten through `/domain-sites/[hostname]`

Every public website type exposes:

- Primary CTA: Join Academy
- Secondary CTA: Sign In

Builder CTAs route to `/portal/[slug]/join-academy` and `/portal/[slug]/login` on platform domains, or `/join-academy` and `/login` on custom domains.

Approved external websites should link to the same KaiMentors-controlled routes for their academy. They must not duplicate authentication, registration, verification, student management, course access, messaging, or permission systems.

Professional custom websites can include a "Powered by KaiMentors" footer while keeping the client's own domain and brand experience.

## Future Template Strategy

New templates should be added through database template metadata and reusable section blueprints. Core renderer logic should not be rewritten for each template.
