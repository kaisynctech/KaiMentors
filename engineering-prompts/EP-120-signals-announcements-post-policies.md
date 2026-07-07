# EP-120 — Signals, announcements & group post policies (MB-120)

Implementer checklist for the three-lane mentor/student communication model.

## Migration

Apply `supabase/migrations/202607071200_signals_announcements_post_policy.sql` to production:

```bash
npx supabase db query --linked --file supabase/migrations/202607071200_signals_announcements_post_policy.sql
```

Verify after apply:

```sql
-- Post policy column exists
select id, type, post_policy from conversations limit 5;

-- Custom groups include all mentors (not creator-only)
select c.id, c.title, count(cm.user_id) filter (where tm.user_id is not null) as mentor_count
from conversations c
join conversation_members cm on cm.conversation_id = c.id
left join trader_members tm on tm.trader_id = c.trader_id and tm.user_id = cm.user_id
where c.type = 'group'
group by c.id, c.title
order by c.created_at desc
limit 10;
```

## App changes

- `supabase/migrations/202607071200_signals_announcements_post_policy.sql` — post_policy, daily_signals, RPCs, backfill
- `app/api/signals/route.ts` — POST signal
- `app/api/signals/today/route.ts` — GET today's signal
- `app/api/announcements/route.ts` — mentor list/create
- `app/api/announcements/[id]/route.ts` — edit/publish/delete
- `app/api/conversations/post-policy/route.ts` — toggle allow student replies
- `app/api/messages/conversations/route.ts` — group `allowStudentReplies`; no new announcement type
- `app/api/messages/route.ts` — returns `canPost`, `postPolicy`
- `components/messages-workspace.tsx` — Post signal, post policy toggle, strip
- `components/dashboard-announcements-panel.tsx` — Overview CRUD
- `app/dashboard/page.tsx` — announcements panel
- `app/student/page.tsx` — Signal for today card
- `app/student/messages/page.tsx` — signal strip props
- `lib/community.ts`, `lib/community-server.ts` — types + loaders

## Tests

1. Mentor posts signal → appears in All Students thread + student home + Messages strip
2. Second signal same day replaces highlight (not thread history)
3. Mentor creates announcement on Overview → student home Announcements section
4. **New announcement channel** button removed from Messages
5. Custom group includes all mentors; secondary mentor can post
6. Group creator toggles **Allow student replies**; All Students toggle works for any mentor
7. Student read-only in mentors-only group; can post when policy = everyone
8. Legacy announcement conversations still readable, labeled Legacy

## Deploy

1. Apply migration to Supabase
2. Deploy Vercel
3. PO confirms on Traders Confidence
