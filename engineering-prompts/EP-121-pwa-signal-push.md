# EP-121 — PWA install and signal web push (MB-121)

Implementer checklist for installable academy portals and signal push notifications.

## Migration

Apply `supabase/migrations/202607071400_pwa_push_subscriptions.sql` to production:

```bash
npx supabase db query --linked --file supabase/migrations/202607071400_pwa_push_subscriptions.sql
```

Verify after apply:

```sql
select count(*) from push_subscriptions;
select column_name from information_schema.columns
where table_name = 'notifications' and column_name in ('metadata', 'conversation_id');
```

## Environment (Vercel production)

Generate VAPID keys once:

```bash
npx web-push generate-vapid-keys
```

Set on Vercel:

| Variable | Example |
|---|---|
| `VAPID_PUBLIC_KEY` | from generate output |
| `VAPID_PRIVATE_KEY` | from generate output |
| `VAPID_SUBJECT` | `mailto:ops@kaisync.tech` |

Push delivery is skipped gracefully when keys are missing (install still works).

## App changes

- `supabase/migrations/202607071400_pwa_push_subscriptions.sql`
- `public/sw.js` — push + notificationclick handlers
- `app/manifest.webmanifest/route.ts` — dynamic portal manifest
- `app/api/pwa/icon/[size]/route.ts` — branded icon PNG
- `app/api/push/subscribe/route.ts` — save/remove subscriptions
- `app/api/push/vapid-public-key/route.ts`
- `lib/pwa-portal.ts`, `lib/web-push.ts`, `lib/push-client.ts`, `lib/signal-notifications.ts`
- `components/pwa-registrar.tsx`, `pwa-install-card.tsx`, `signal-alerts-prompt.tsx`
- `app/api/signals/route.ts` — fan-out in-app + web push after `post_daily_signal`
- `components/notification-bell.tsx` — `daily_signal` deep link
- `app/student/page.tsx`, `app/student/messages/page.tsx`, `app/dashboard/page.tsx`

## Device tests

1. Custom domain manifest shows portal name (not KaiMentors)
2. Android Chrome install → standalone launch
3. iOS Safari Add to Home Screen → standalone launch
4. Student enables signal alerts → row in `push_subscriptions`
5. Mentor posts signal → phone notification within ~30s
6. Tap notification → Messages with All Students conversation
7. In-app bell shows `daily_signal` entry
8. iOS in-browser tab shows install-first copy (no broken permission loop)
9. Unsubscribe removes push subscription

## Deploy

1. Apply migration to Supabase
2. Set VAPID env vars on Vercel production
3. Deploy Vercel
4. PO confirms on real Android + iPhone hardware
