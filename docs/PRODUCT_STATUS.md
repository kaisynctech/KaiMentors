# Product Status

Last updated: 2026-06-24

This file tracks implemented product state. `Planned` and `In Progress` items are not production behavior until their implementation and validation are complete.

| Product area | Status | Current implementation |
| --- | --- | --- |
| Multi-tenant foundation | Complete | `traders` tenant root, memberships, composite ownership constraints, and RLS-backed isolation. |
| Multi-academy foundation | Complete | KaiTrades, Traders Confidence, and Milkers FX have distinct owners, tenants, portals, packages, assignments and asset roots. |
| Core Academy Page | Complete | Default delivery mode with approved mentor-editable identity, contact, social and risk fields. |
| Website Builder | Deprecated | Legacy data/rendering retained; mentor-facing creation and editing routes redirect to Academy Page. |
| Milkers FX owner activation | In Progress | Existing workspace/package/invitation are preserved and the audited OTP resend was accepted. Owner code entry and invitation acceptance remain. |
| Traders Confidence custom domain | Partially Complete | Runtime/provider architecture is complete; DNS for apex and `www` is not yet resolving, so no domain was registered. |
| Mentor authentication and workspace provisioning | Complete | Password login, role routing, onboarding API, and atomic trader provisioning. |
| Unified Resume Account Setup | Partially Complete | Migration `024` and the matching Next.js application are deployed. Production routes, RLS grants, tenant integrity, enumeration safety, code delivery acceptance and responsive HTTP behavior pass; final mailbox-held code entry and visual browser acceptance remain pending. |
| OTP-only email challenges | Complete | Six hosted bodies pass genuine Management API inspection; KaiTrades passed received-email/code-entry canary; production is `production_enabled` through audited super-admin promotion; Milkers FX resend was authorized and accepted. |
| Academy Website Entry System Phase 1 | Complete | Branded Join Academy and Sign In across portal slugs and custom domains with server-resolved registration tenancy. |
| Website Builder foundation | Complete | Templates, pages, sections, themes, navigation, media, preview, releases, and publications. |
| Custom website packages | Complete | Platform package registry, admin assignment, editable overrides, reserved routes, and custom rendering. |
| Custom domains | Partially Complete | Resolution and Vercel automation architecture exist; each client domain still requires provisioning and verification. |
| KaiTrades acceptance-test tenant | Complete | Independent package, assets, centralized routing, tests, admin classification, remote migrations, and production RLS verification are complete. |
| Student registration and verification | Complete | Tenant-aware registration, verification attempts, review workflows, status states, and audit logs. |
| Student Onboarding 3-Step Flow | Complete | 3-step join-academy form (Profile → Experience → Review); broker step removed; `trader_broker_account_id` and `broker_account_identifier` nullable at registration; migration `029`. |
| Dashboard Broker Verification | Complete | Unverified students see a verify form on the student dashboard; account number submission triggers the `verify-broker-account` Edge Function for API brokers or transitions to `manual_review`; rate-limited at 5 attempts per hour; `POST /api/student/verify` route; migration `029`. |
| Broker accounts and verification | Complete | Multiple tenant broker accounts with API, manual review, and screenshot verification methods. `verification_instructions` field added (EP-014); inline edit in broker accounts manager; `get_student_broker_guide` RPC now returns all active connections including `partner_code` (EP-015). |
| Student portal redesign | Complete | Persistent sidebar shell (StudentShell), ContentGate blur-overlay replacing redirects, full dashboard rewrite (status, continue-learning, live classes, announcements, broker guide, verification form), new live-classes and groups pages, screenshot resubmission via VerificationScreenshotUpload + PATCH /api/student/verification-screenshot. Migrations `028`, `029`. |
| Protected courses Phase 1 | Partially Complete | Structured curriculum, mixed media, Media Library, access modes, progress and student learning views are implemented and UI-redesigned. Migrations `025` and `026` (`fix_set_course_access_enum_cast`) are deployed at `https://kaimentors.vercel.app`. UI redesign (card library, detail tabs, student My Learning, lesson player) is implemented locally; tests, typecheck, and build pass. Acceptance runner passes fully: all scenarios (all-verified, group, individual, one-to-one, revoke/restore, lifecycle), security, media, and progress assertions pass. Authenticated browser acceptance screenshots (desktop and mobile) remain open. |
| Groups, entitlements, and messaging | Complete | System all-students group, custom groups, content grants, direct/group/announcement conversations, and attachments. |
| Platform administration | Complete | Super-admin overview, mentors, custom sites, brokers, subscriptions, audit logs, and settings shells/workflows. |

## Acceptance-Test Fixture Policy

KaiTrades is not a client tenant. It is a permanent acceptance-test tenant identified by `traders.environment = acceptance_test`. It must never share tenant-owned runtime records, package IDs, asset paths, domains, assignments, releases, media paths, students, broker accounts, groups, conversations, or content with a production client.
