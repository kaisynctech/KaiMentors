# Multi-Tenancy

## Deployed Academy Matrix

| Academy | Environment | Owner email | Portal slug | Package |
| --- | --- | --- | --- | --- |
| KaiTrades | `acceptance_test` | `kaisynctech@gmail.com` | `kaitrades` | `kaitrades` v1 |
| Traders Confidence | `production` | `nyaristo01@gmail.com` | `traders-confidence` | `traders-confidence` v1 |
| Milkers FX | `production` | `nyaradzondoro1@gmail.com` | `milkers-fx` | `milkers-fx` v1 |

All rows use different user, trader, portal, assignment and package IDs. Package asset roots are also distinct. No domain record currently exists. Milkers FX invitation state is pending; its tenant data is already isolated by the same RLS and composite constraints as active owners.

Ownership corrections update an existing trader and portal in place. The ownership-transfer ledger changes only the owner relation and membership roles; it does not move or recreate tenant-owned data. Package assignments and domains are platform-managed, while mentors may edit only approved portal content and package overrides.

Account setup never provisions a second tenant to recover an incomplete identity. Server-side state resolution follows immutable Auth user, invitation, owner membership, portal and application relationships. Invitation renewal and owner-email correction preserve those IDs; role conflicts and inconsistent ownership graphs fail closed for operator review.

Last updated: 2026-06-20

## Tenant Model

KaiMentors uses `traders` as the tenant root. A trader represents one mentor business, academy, or client workspace.

Most tenant-owned tables include `trader_id`. Where a table is connected through a portal or child record, composite foreign keys preserve tenant ownership.

`traders.environment` classifies a tenant as `production` or `acceptance_test`. Classification changes administration and operational meaning only; acceptance-test tenants receive no RLS bypass and use the same ownership constraints as production tenants.

## Workspace Ownership

- `traders.owner_user_id` identifies the workspace owner.
- `trader_members` grants additional mentor workspace access.
- `trader_members.role` supports `owner`, `admin`, `editor`, and `support`.
- `super_admin` is platform-level and not tenant-scoped, although a super admin may also have trader membership for a workspace.

## Data Separation

Tenant records are separated by:

- Direct `trader_id` columns.
- Portal ownership through `portals.trader_id`.
- Composite uniqueness and foreign keys such as `(portal_id, trader_id)` and `(application_id, trader_id)`.
- RLS helper functions that compare the current user to tenant membership.

## RLS Design

Core helpers:

- `is_trader_member(target_trader_id)`
- `is_trader_owner(target_trader_id)`
- `has_verified_access(target_trader_id)`
- `is_super_admin()`
- `current_trader_id()`

Policy pattern:

- Tenant members manage their own tenant records.
- Verified students read only published and entitled tenant content.
- Public users read only intentionally public website/portal records.
- Platform admins manage cross-tenant platform data.

## Public Access

Public website routes can read published portal and website records. Public registration uses server APIs and safe database functions instead of exposing tenant internals.

## Custom Domains

Custom domains are resolved through `website_domains` and middleware host detection:

- Known KaiMentors platform hostnames are treated as platform routes.
- Unknown hostnames are rewritten to `/domain-sites/[hostname]`.
- `/academy` on a custom domain maps to the student portal.
- Dashboard/admin/onboarding requests on custom domains redirect to the platform host.

## Academy Entry Tenant Resolution

Student entry is tenant-aware across website types:

- Platform builder and portal routes resolve tenant context from `/portal/[slug]`.
- Custom domains resolve tenant context from `website_domains` through `resolve_public_website_domain`.
- Approved external websites must link into the KaiMentors-controlled `/portal/[slug]/join-academy` and `/portal/[slug]/login` routes, or to the academy's verified custom domain routes.
- Student registration uses the resolved portal and trader on the server. Hidden browser fields are not trusted as tenant identity.
- Student status, courses, lessons, and messages use the branded academy context when a portal query or custom-domain hostname is present.
- `lib/academy-routes.ts` centralizes platform-slug and custom-domain URL generation. Custom package HTML is rewritten with this context, so page navigation and student entry cannot fall back to unscoped platform-root URLs.

## KaiTrades Acceptance Fixture

- Portal identity: `kaitrades`.
- Tenant classification: `acceptance_test` after migration `202606180014_kaitrades_acceptance_test_fixture.sql` is applied.
- Package identity: `kaitrades` version 1 under `/custom-sites/kaitrades/v1`.
- The fixture has its own assignment, package ID, asset path, release history, students, broker accounts, groups, conversations, and content records.
- The migration resolves the fixture by unique portal slug and derives ownership through foreign keys. It contains no tenant UUID and does not update the Traders Confidence package or any client tenant.

## Security Assumptions

## Course Isolation

Course modules, lessons, content blocks, gallery media, resources, progress, media metadata, and media sessions carry `trader_id`. Composite foreign keys require referenced course, lesson, block, and media rows to belong to the same tenant. `can_access_course` also requires a verified application in that exact tenant before evaluating all-verified, group, direct, or one-to-one grants. Storage paths start with the owning `trader_id`; students receive only server-issued short-lived URLs after database authorization.

- Client-side route checks are not trusted as the only security boundary.
- RLS must remain enabled on all business tables.
- Service-role operations must stay server-only.
- Platform admins assign custom website packages; mentors cannot self-assign arbitrary packages.
- Documentation must be updated whenever tenant ownership or RLS behavior changes.
