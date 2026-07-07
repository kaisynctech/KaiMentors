# EP-122 — Platform subscriptions & feature entitlements (MB-122)

Implementer checklist for R400/month platform billing and entitlement foundation.

## Commercial rules (do not change)

| Rule | Value |
|---|---|
| Base price | **R400/month ZAR** |
| Existing mentors | Free until **2026-07-31** |
| New mentors | **30-day trial** from **`go_live_at`** (not signup) |
| Custom site mentors | Trial starts at **go-live** only |
| Add-on features | **None in v1** — tables + helpers only |
| Payment v1 | **Manual** admin mark-paid |
| Payment v2 | **Paystack** (MB-122b — separate deploy) |

## Migration

Apply `supabase/migrations/202607081200_platform_subscriptions_entitlements.sql`

Verify grandfather:

```sql
select t.display_name, s.status, s.trial_ends_at, s.plan_key, s.currency, s.monthly_amount_cents
from subscriptions s
join traders t on t.id = s.trader_id
order by t.display_name;
```

All live mentors must show `trialing` with `trial_ends_at = 2026-07-31`.

## App changes (v1)

- `lib/entitlements.ts` — `isAcademyActive`, `hasFeature`, `getFeatureState`
- Academy pause gate — mentor dashboard + student routes + API guards
- `components/subscription-required.tsx`, `components/academy-unavailable.tsx`
- `components/feature-gate.tsx` — locked preview (no production usage yet)
- `/admin/traders/[traderId]/billing` or drawer — mark paid, extend trial, set go-live
- Fix `/admin/subscriptions` — use `plan_key`, `current_period_ends_at`
- `/dashboard/settings?tab=billing` — status, trial countdown, EFT instructions
- `POST/PATCH /api/admin/subscriptions/[traderId]`
- `GET /api/mentor/billing`

## Paystack (v2 — MB-122b, not this deploy)

- Plan: R400/month (`amount: 40000`)
- Webhook: `/api/webhooks/paystack`
- Env: `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_WEBHOOK_SECRET`

## Tests

1. Grandfather — live mentor active through July, no pause on deploy
2. Go-live + 30 day trial for new mentor
3. Expired trial → mentor paywall + student unavailable
4. Admin mark paid → academy restored
5. Super-admin never gated
6. Acceptance test tenant not accidentally paused
7. FeatureGate smoke (dev only)
8. `npm run build`

## Deploy order

1. Migration + backfill
2. Pause gate + admin UI
3. Mentor billing page
4. Verify before **2026-08-01**
5. Paystack (MB-122b) when PO ready
