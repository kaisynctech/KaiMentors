# EP-118 — Direct message privacy (MB-118)

Implementer checklist for private mentor–student direct messaging.

## Migration

Apply `supabase/migrations/202607061400_direct_message_privacy.sql` to production.

Verify after apply:

```sql
select c.id, c.direct_mentor_user_id, c.direct_student_user_id,
       array_agg(cm.user_id order by cm.user_id) as members
from conversations c
join conversation_members cm on cm.conversation_id = c.id
join student_applications sa on sa.student_user_id = c.direct_student_user_id
join portals p on p.trader_id = c.trader_id and p.slug = 'traders-confidence'
where c.type = 'direct'
group by c.id, c.direct_mentor_user_id, c.direct_student_user_id;
```

Each direct row must have exactly **2** members.

## App changes

- `app/api/messages/conversations/route.ts` — optional `mentorUserId` on `student_direct`
- `components/messages-workspace.tsx` — mentor picker for multi-mentor workspaces
- `app/student/messages/page.tsx` — pass `workspaceMentors`
- `lib/community-server.ts` — `loadWorkspaceMentors()`

## Tests

1. Mentor A DMs student — Mentor B cannot see thread
2. Owner cannot see Mentor B's DM with same student
3. Student + single mentor auto-resolves
4. Student + multiple mentors shows picker
5. New mentor join does not backfill into existing direct threads
6. Private group hidden from non-members
7. All Students / announcement still visible to all mentors

## Deploy

1. Apply migration to Supabase
2. Deploy Vercel
3. PO confirms on Traders Confidence
