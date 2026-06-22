# Broker Integrations

## Multi-Academy Validation

Broker account rows remain owned by `trader_id`; academy provisioning does not clone or share broker connections. The deployed matrix contains one KaiTrades test broker account and none for Traders Confidence or Milkers FX. Public broker options and student registration continue to resolve the portal server-side, so a custom package or Core Academy Page cannot select another academy's broker connection.

Last updated: 2026-06-17

## Architecture

KaiMentors separates broker configuration from verification execution.

- `brokers` stores platform-level broker catalog records.
- `trader_broker_accounts` stores tenant-specific partner codes, affiliate links, and verification method.
- `student_applications` stores selected broker and account details.
- `verification_attempts` stores verification evidence and outcomes.
- Supabase Edge Function `verify-broker-account` runs broker API checks server-side.

## Adapter Pattern

Broker API calls are handled through an Edge Function adapter registry:

- `supabase/functions/verify-broker-account/adapters/registry.ts`
- `supabase/functions/verify-broker-account/adapters/http-json.ts`
- `supabase/functions/verify-broker-account/adapters/types.ts`

This keeps broker-specific logic out of the browser and allows additional broker adapters to be added without changing public registration forms.

## Verification Methods

Supported methods:

- `api`: API verification through the Edge Function.
- `manual_review`: mentor reviews the application.
- `screenshot_upload`: student uploads proof, mentor reviews it.

## API Verification Flow

1. Student submits broker account details.
2. Server resolves the academy tenant from the branded entry route or custom domain.
3. Server validates that the selected broker account belongs to that tenant.
4. Server creates a verification attempt.
5. Server/Edge Function loads broker adapter configuration securely.
6. Broker API is called from the Edge Function.
7. The verification attempt and student application are updated.
8. Audit logs record the decision.

## Manual Review Flow

1. Student submits registration details.
2. Application is marked pending or manual review.
3. Mentor reviews details in `/dashboard/students`.
4. Mentor approves, rejects, or requests more information.
5. Database functions update status and create audit logs.

## Screenshot Verification Flow

1. Student uploads screenshot proof during registration or review.
2. File is stored in the `verification-proofs` bucket.
3. `verification_attempts.proof_path` records the file path.
4. Tenant reviewers and the owning student can access the proof under RLS/storage policies.
5. Mentor reviews and updates status.

## Security Rules

- Broker APIs are never called from frontend code.
- Broker credentials and API secrets must stay server-side.
- Verification proof files are private and policy-protected.
- All review decisions should be auditable.
