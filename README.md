# KaiMentors

KaiMentors is a multi-tenant SaaS foundation for forex mentors, trading
educators, and affiliate academies. Each mentor receives an isolated branded
portal, while student access is controlled by server-side broker verification.

## Stack

- Next.js App Router, React, and TypeScript
- Supabase Auth, PostgreSQL, Storage, and Edge Functions
- PostgreSQL row-level security for tenant and verified-student isolation
- Broker adapter registry with credentials loaded from Supabase Vault

## Local setup

1. Copy `.env.example` to `.env.local` and add the Supabase project values.
2. Install dependencies with `npm install`.
3. Start local Supabase with `supabase start`.
4. Apply the schema with `supabase db reset`.
5. Serve the app with `npm run dev`.

The service-role key is used only by Next.js route handlers. Never prefix it
with `NEXT_PUBLIC_` or expose it to browser code.

## Tenant and storage conventions

- Every owned domain table includes `trader_id`.
- Tenant storage objects begin with the trader UUID:
  `course-content/<trader_id>/...`.
- Avatar objects begin with the user UUID:
  `avatars/<user_id>/...`.
- Broker credentials are stored as encrypted JSON in Supabase Vault. Only the
  Vault secret UUID is persisted on `trader_broker_accounts`.

## Authentication flow

- New mentors and students create an email and password during registration.
- A six-digit email code is used once to verify and activate the account.
- Returning users sign in with email and password; routine login does not send
  an OTP.
- Repeating mentor onboarding with an existing mentor email resumes the
  verification step, allowing legacy passwordless accounts to establish a
  password after proving email ownership.

## Broker adapters

`supabase/functions/verify-broker-account/adapters/registry.ts` maps a broker's
`adapter_key` to an implementation. New brokers are added as adapters and
database configuration, without changing portal or dashboard code.

The included `http-json-v1` adapter is a generic contract for brokers that
provide a partner-verification endpoint. Production broker adapters should
normalize their responses to `VerificationResult` and must never return raw
credentials or unnecessarily sensitive broker data.

## Website Builder

The public mentor website is template-driven. `website_templates` stores global
metadata and JSON blueprints; tenant-owned pages, sections, theme settings,
media, and navigation remain normalized and protected by RLS.

- Add future templates by inserting a blueprint composed from supported section
  types. Core page-loading logic does not need to change.
- Mentor drafts are previewed at `/dashboard/website-builder/preview`.
- Publishing creates an immutable release; draft edits are not exposed until
  the next release is created. Previous releases can be restored without
  overwriting the current draft.
- Published home pages remain available at `/portal/<slug>` and enabled child
  pages at `/portal/<slug>/<page-slug>`.
- Public course listings expose published course metadata only. Lessons, videos,
  and private course storage remain restricted to verified students.
- Website assets use `website-media/<trader_id>/...`.

## Custom domains

Custom domains use one multi-tenant deployment. A verified hostname maps to one
portal through `website_domains`; middleware resolves the request host and
serves the portal's current immutable website release.

- The public website is served at `https://client-domain.example/`.
- Student login is served at `/login`.
- Authenticated student pages are served at `/academy`, `/academy/courses`, and
  `/academy/messages`.
- `/portal/<slug>` remains the fallback address.
- Non-primary active domains redirect to the primary hostname to prevent
  duplicate content.

Domain automation uses the Vercel project-domain API. Configure
`NEXT_PUBLIC_SITE_URL`, `KAIMENTORS_PLATFORM_HOSTNAMES`, `VERCEL_TOKEN`,
`VERCEL_PROJECT_ID`, and optionally `VERCEL_TEAM_ID` in the deployment
environment. These values are server-side except for `NEXT_PUBLIC_SITE_URL`.
Without provider credentials, domain creation fails closed and no domain is
marked connected.

The domain lifecycle is recorded as requested, ownership verification, DNS,
SSL, authentication readiness, and active state. Every transition is retained
in `website_domain_events`, while table mutations also create standard audit
logs.

For the current password and in-page email OTP flow, authentication remains on
the client domain and does not require a redirect. Add exact custom-domain
callback URLs to Supabase Auth before introducing password recovery, OAuth, or
other redirect-based flows.

## Security notes

- RLS is enabled on every application table.
- Published portal metadata and active broker choices are the only anonymous
  tenant reads.
- Course content, lessons, resources, announcements, live classes, and private
  storage require a verified application for the same trader.
- Audit rows are trigger-generated and immutable to browser roles.
- Admin and onboarding mutations use server-only credentials.
- Add edge rate limiting and bot protection at the deployment layer before
  opening public registration in production.
