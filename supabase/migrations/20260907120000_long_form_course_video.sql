-- Hour-long lessons: 2 GB objects and media sessions that last a full watch.

update storage.buckets
set file_size_limit = 2147483648
where id in ('course-content', 'academy-media');

drop policy if exists "mentors can update academy media" on storage.objects;
create policy "mentors can update academy media"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'academy-media'
  and exists (
    select 1
    from public.trader_members tm
    where tm.user_id = auth.uid()
      and tm.trader_id::text = split_part(name, '/', 1)
  )
)
with check (
  bucket_id = 'academy-media'
  and exists (
    select 1
    from public.trader_members tm
    where tm.user_id = auth.uid()
      and tm.trader_id::text = split_part(name, '/', 1)
  )
);

create or replace function public.issue_course_media_session(target_media_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.course_media%rowtype; cid uuid; expires timestamptz := now()+interval '2 hours';
begin
  select * into m from public.course_media where id=target_media_id and processing_state='ready';
  if m.id is null then raise exception 'media unavailable'; end if;
  select refs.course_id into cid from (
    select l.course_id from public.lesson_content_blocks b join public.lessons l on l.id=b.lesson_id and l.trader_id=b.trader_id
      where b.media_id=m.id and l.status='published'
    union
    select l.course_id from public.lesson_content_block_media bm join public.lessons l on l.id=bm.lesson_id and l.trader_id=bm.trader_id
      where bm.media_id=m.id and l.status='published'
    union
    select r.course_id from public.resources r where r.media_id=m.id and r.status='published' and r.course_id is not null
  ) refs where public.can_access_course(refs.course_id,auth.uid()) limit 1;
  if cid is null then raise exception 'media unavailable'; end if;
  insert into public.course_media_access_sessions(trader_id,student_user_id,course_id,media_id,expires_at) values(m.trader_id,auth.uid(),cid,m.id,expires);
  return jsonb_build_object('storage_path',m.storage_path,'mime_type',m.mime_type,'expires_at',expires,'course_id',cid);
end $$;
revoke all on function public.issue_course_media_session(uuid) from public, anon, service_role;
grant execute on function public.issue_course_media_session(uuid) to authenticated;
