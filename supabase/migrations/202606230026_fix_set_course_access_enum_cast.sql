-- Fix: CASE expression in set_course_access returns text, but access_scope is
-- public.content_access_scope. PostgreSQL does not apply the implicit
-- literal→enum assignment cast inside CASE branches. Add explicit casts.

create or replace function public.set_course_access(
  target_course_id uuid, target_mode public.course_access_mode,
  target_group_ids uuid[] default '{}', target_student_ids uuid[] default '{}'
) returns void language plpgsql security definer set search_path = '' as $$
declare tid uuid;
begin
  select trader_id into tid from public.courses where id=target_course_id for update;
  if tid is null or not (public.is_trader_member(tid) or public.is_super_admin()) then raise exception 'forbidden'; end if;
  if target_mode='one_to_one' and cardinality(target_student_ids)<>1 then raise exception 'one-to-one requires exactly one student'; end if;
  if target_mode='restricted' and cardinality(target_group_ids)+cardinality(target_student_ids)=0 then raise exception 'restricted access requires recipients'; end if;
  if target_mode='all_verified' and cardinality(target_group_ids)+cardinality(target_student_ids)>0 then raise exception 'all-verified access cannot contain grants'; end if;
  if exists(select 1 from unnest(target_group_ids) gid where not exists(select 1 from public.student_groups g where g.id=gid and g.trader_id=tid and g.is_active)) then raise exception 'invalid group'; end if;
  if exists(select 1 from unnest(target_student_ids) uid where not exists(select 1 from public.student_applications a where a.student_user_id=uid and a.trader_id=tid and a.status='verified')) then raise exception 'invalid student'; end if;
  delete from public.content_access_grants where trader_id=tid and entity_type='course' and entity_id=target_course_id;
  update public.courses
    set access_mode=target_mode,
        access_scope=(case when target_mode='all_verified'
                          then 'all_verified'::public.content_access_scope
                          else 'restricted'::public.content_access_scope
                     end),
        updated_at=now()
    where id=target_course_id;
  insert into public.content_access_grants(trader_id,entity_type,entity_id,group_id,granted_by)
    select tid,'course',target_course_id,gid,auth.uid() from (select distinct unnest(target_group_ids) gid) deduped_groups;
  insert into public.content_access_grants(trader_id,entity_type,entity_id,student_user_id,granted_by)
    select tid,'course',target_course_id,uid,auth.uid() from (select distinct unnest(target_student_ids) uid) deduped_students;
end $$;
