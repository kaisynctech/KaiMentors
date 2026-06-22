-- Protected Courses Phase 1: structured curriculum, normalized media, access, and progress.
-- Preflight: fail before mutation if legacy tenant relationships are inconsistent.
do $$
begin
  if exists (
    select 1 from public.lessons l
    left join public.courses c on c.id = l.course_id and c.trader_id = l.trader_id
    where c.id is null
  ) then raise exception 'course migration preflight failed: orphaned lesson'; end if;
  if exists (
    select 1 from public.resources r
    left join public.courses c on c.id = r.course_id and c.trader_id = r.trader_id
    where r.course_id is not null and c.id is null
  ) then raise exception 'course migration preflight failed: orphaned resource course'; end if;
end $$;

create type public.course_access_mode as enum ('all_verified', 'restricted', 'one_to_one');
create type public.course_media_type as enum ('video', 'pdf', 'image');
create type public.course_media_state as enum (
  'uploading', 'processing', 'ready', 'failed', 'replaced', 'archived', 'deletion_blocked'
);
create type public.lesson_content_type as enum ('rich_text', 'video', 'pdf', 'image', 'gallery', 'link');

alter table public.courses
  add column access_mode public.course_access_mode not null default 'all_verified';
update public.courses set access_mode = case when access_scope = 'restricted' then 'restricted'::public.course_access_mode else 'all_verified'::public.course_access_mode end;

create table public.course_modules (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  course_id uuid not null,
  title text not null,
  description text,
  status public.content_status not null default 'draft',
  sort_order integer not null default 0 check (sort_order >= 0),
  is_required boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, trader_id),
  unique (course_id, id, trader_id),
  foreign key (course_id, trader_id) references public.courses(id, trader_id) on delete cascade,
  check (char_length(trim(title)) between 1 and 180)
);

insert into public.course_modules (trader_id, course_id, title, status, sort_order, created_by)
select c.trader_id, c.id, 'Course Content', c.status, 0, c.created_by
from public.courses c
where exists (select 1 from public.lessons l where l.course_id = c.id and l.trader_id = c.trader_id);

alter table public.lessons add column module_id uuid;
update public.lessons l set module_id = m.id
from public.course_modules m
where m.course_id = l.course_id and m.trader_id = l.trader_id;
alter table public.lessons
  add constraint lessons_module_tenant_fkey foreign key (course_id, module_id, trader_id)
    references public.course_modules(course_id, id, trader_id) on delete restrict;
alter table public.lessons
  add column is_required boolean not null default true,
  add constraint lessons_sort_order_nonnegative check (sort_order >= 0);

create table public.course_media (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  media_type public.course_media_type not null,
  title text not null,
  storage_path text not null,
  mime_type text not null,
  file_extension text not null,
  size_bytes bigint not null check (size_bytes > 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds > 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  processing_state public.course_media_state not null default 'uploading',
  replaced_by_media_id uuid,
  replaces_media_id uuid,
  failure_reason text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  ready_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, trader_id),
  unique (trader_id, storage_path),
  foreign key (replaced_by_media_id, trader_id) references public.course_media(id, trader_id) on delete restrict,
  foreign key (replaces_media_id, trader_id) references public.course_media(id, trader_id) on delete restrict,
  check (storage_path like trader_id::text || '/%'),
  check (char_length(trim(title)) between 1 and 180),
  check (failure_reason is null or char_length(failure_reason) <= 500)
);

create table public.lesson_content_blocks (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  course_id uuid not null,
  lesson_id uuid not null,
  block_type public.lesson_content_type not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  media_id uuid,
  content jsonb not null default '{}'::jsonb,
  is_required boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, trader_id),
  foreign key (course_id, trader_id) references public.courses(id, trader_id) on delete cascade,
  foreign key (lesson_id, trader_id) references public.lessons(id, trader_id) on delete cascade,
  foreign key (media_id, trader_id) references public.course_media(id, trader_id) on delete restrict,
  check (
    (block_type in ('video', 'pdf', 'image') and media_id is not null)
    or (block_type in ('rich_text', 'link', 'gallery') and media_id is null)
  )
);

create table public.lesson_content_block_media (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  course_id uuid not null,
  lesson_id uuid not null,
  block_id uuid not null,
  media_id uuid not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  caption text check (caption is null or char_length(caption) <= 500),
  created_at timestamptz not null default now(),
  unique (block_id, media_id),
  foreign key (course_id, trader_id) references public.courses(id, trader_id) on delete cascade,
  foreign key (lesson_id, trader_id) references public.lessons(id, trader_id) on delete cascade,
  foreign key (block_id, trader_id) references public.lesson_content_blocks(id, trader_id) on delete cascade,
  foreign key (media_id, trader_id) references public.course_media(id, trader_id) on delete restrict
);

alter table public.resources
  add column media_id uuid,
  add column sort_order integer not null default 0,
  add constraint resources_sort_order_nonnegative check (sort_order >= 0),
  add constraint resources_media_tenant_fkey foreign key (media_id, trader_id)
    references public.course_media(id, trader_id) on delete restrict;

-- Register legacy storage paths without changing course, lesson, or resource IDs.
insert into public.course_media (
  trader_id, media_type, title, storage_path, mime_type, file_extension,
  size_bytes, duration_seconds, processing_state, created_by, ready_at
)
select l.trader_id, 'video', l.title, l.video_path,
  case when lower(l.video_path) like '%.webm' then 'video/webm' else 'video/mp4' end,
  case when lower(l.video_path) like '%.webm' then 'webm' else 'mp4' end,
  1, l.duration_seconds, 'ready', l.created_by, coalesce(l.published_at, l.created_at)
from public.lessons l where l.video_path is not null
on conflict (trader_id, storage_path) do nothing;

insert into public.lesson_content_blocks (
  trader_id, course_id, lesson_id, block_type, sort_order, media_id, created_by
)
select l.trader_id, l.course_id, l.id, 'video', 0, m.id, l.created_by
from public.lessons l join public.course_media m
  on m.trader_id = l.trader_id and m.storage_path = l.video_path
where l.video_path is not null;

insert into public.course_media (
  trader_id, media_type, title, storage_path, mime_type, file_extension,
  size_bytes, processing_state, created_by, ready_at
)
select r.trader_id,
  case when r.type = 'video' then 'video'::public.course_media_type
       when r.type = 'pdf' then 'pdf'::public.course_media_type else 'image'::public.course_media_type end,
  r.title, r.storage_path,
  case
    when r.type = 'video' and lower(r.storage_path) like '%.webm' then 'video/webm'
    when r.type = 'video' then 'video/mp4'
    when r.type = 'pdf' then 'application/pdf'
    when lower(r.storage_path) like '%.png' then 'image/png'
    when lower(r.storage_path) like '%.webp' then 'image/webp'
    else 'image/jpeg'
  end,
  case
    when r.type = 'video' and lower(r.storage_path) like '%.webm' then 'webm'
    when r.type = 'video' then 'mp4'
    when r.type = 'pdf' then 'pdf'
    when lower(r.storage_path) like '%.png' then 'png'
    when lower(r.storage_path) like '%.webp' then 'webp'
    when lower(r.storage_path) like '%.jpeg' then 'jpeg'
    else 'jpg'
  end,
  1, 'ready', r.created_by, r.created_at
from public.resources r
where r.storage_path is not null
  and (
    r.type in ('video', 'pdf')
    or lower(r.storage_path) ~ '\.(png|jpe?g|webp)$'
  )
on conflict (trader_id, storage_path) do nothing;
update public.resources r set media_id = m.id
from public.course_media m
where m.trader_id = r.trader_id and m.storage_path = r.storage_path and r.storage_path is not null;

create table public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  student_user_id uuid not null references public.profiles(id) on delete restrict,
  course_id uuid not null,
  lesson_id uuid not null,
  position_seconds integer not null default 0 check (position_seconds >= 0),
  is_started boolean not null default false,
  is_completed boolean not null default false,
  first_started_at timestamptz,
  first_completed_at timestamptz,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trader_id, student_user_id, lesson_id),
  foreign key (course_id, trader_id) references public.courses(id, trader_id) on delete restrict,
  foreign key (lesson_id, trader_id) references public.lessons(id, trader_id) on delete restrict
);

create table public.course_media_access_sessions (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  student_user_id uuid not null references public.profiles(id) on delete restrict,
  course_id uuid not null,
  media_id uuid not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  foreign key (course_id, trader_id) references public.courses(id, trader_id) on delete restrict,
  foreign key (media_id, trader_id) references public.course_media(id, trader_id) on delete restrict,
  check (expires_at > issued_at and expires_at <= issued_at + interval '10 minutes')
);

create index course_modules_curriculum_idx on public.course_modules (trader_id, course_id, sort_order, created_at);
create index lessons_module_curriculum_idx on public.lessons (trader_id, course_id, module_id, sort_order, created_at);
create index lesson_blocks_order_idx on public.lesson_content_blocks (trader_id, lesson_id, sort_order, created_at);
create index lesson_blocks_media_idx on public.lesson_content_blocks (trader_id, media_id) where media_id is not null;
create index lesson_block_gallery_order_idx on public.lesson_content_block_media (trader_id, block_id, sort_order, created_at);
create index lesson_block_gallery_media_idx on public.lesson_content_block_media (trader_id, media_id);
create index resources_media_usage_idx on public.resources (trader_id, media_id) where media_id is not null;
create index course_media_library_idx on public.course_media (trader_id, processing_state, media_type, created_at desc);
create index lesson_progress_continue_idx on public.lesson_progress (student_user_id, trader_id, is_completed, last_activity_at desc);
create index lesson_progress_course_report_idx on public.lesson_progress (trader_id, course_id, student_user_id, is_completed);
create index course_media_sessions_retention_idx on public.course_media_access_sessions (issued_at);
create index course_media_sessions_student_idx on public.course_media_access_sessions (student_user_id, trader_id, issued_at desc);
create index content_grants_course_student_idx on public.content_access_grants (trader_id, entity_id, student_user_id) where entity_type = 'course';

create or replace function public.can_access_course(target_course_id uuid, target_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.courses c
    where c.id = target_course_id and c.status = 'published'
      and exists (
        select 1 from public.student_applications a
        where a.trader_id = c.trader_id and a.student_user_id = target_user_id and a.status = 'verified'
      )
      and (
        c.access_mode = 'all_verified'
        or (c.access_mode = 'restricted' and exists (
          select 1 from public.content_access_grants g
          where g.trader_id = c.trader_id and g.entity_type = 'course' and g.entity_id = c.id
            and (g.expires_at is null or g.expires_at > now())
            and (g.student_user_id = target_user_id or exists (
              select 1 from public.student_group_members gm
              join public.student_applications ga on ga.id = gm.application_id and ga.trader_id = gm.trader_id
              where gm.trader_id = c.trader_id and gm.group_id = g.group_id
                and ga.student_user_id = target_user_id and ga.status = 'verified'
            ))
        ))
        or (c.access_mode = 'one_to_one' and 1 = (
          select count(*) from public.content_access_grants g
          where g.trader_id = c.trader_id and g.entity_type = 'course' and g.entity_id = c.id
            and g.student_user_id = target_user_id and g.group_id is null
            and (g.expires_at is null or g.expires_at > now())
        ) and 1 = (
          select count(*) from public.content_access_grants g
          where g.trader_id = c.trader_id and g.entity_type = 'course' and g.entity_id = c.id
            and g.student_user_id is not null and g.group_id is null
            and (g.expires_at is null or g.expires_at > now())
        ))
      )
  );
$$;
revoke all on function public.can_access_course(uuid, uuid) from public, anon;
grant execute on function public.can_access_course(uuid, uuid) to authenticated, service_role;

create or replace function public.course_media_is_referenced(target_media_id uuid, target_trader_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_trader_member(target_trader_id) or public.is_super_admin()) then raise exception 'forbidden'; end if;
  return exists(select 1 from public.lesson_content_blocks b where b.media_id=target_media_id and b.trader_id=target_trader_id)
      or exists(select 1 from public.lesson_content_block_media bm where bm.media_id=target_media_id and bm.trader_id=target_trader_id)
      or exists(select 1 from public.resources r where r.media_id=target_media_id and r.trader_id=target_trader_id)
      or exists(select 1 from public.courses c join public.course_media m on m.storage_path=c.cover_path and m.trader_id=c.trader_id where m.id=target_media_id and c.trader_id=target_trader_id);
end $$;
revoke all on function public.course_media_is_referenced(uuid, uuid) from public, anon;
grant execute on function public.course_media_is_referenced(uuid, uuid) to authenticated, service_role;

create or replace function public.replace_course_media(target_old_media_id uuid, target_new_media_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare old_media public.course_media%rowtype; new_media public.course_media%rowtype;
begin
  if target_old_media_id = target_new_media_id then raise exception 'media cannot replace itself'; end if;
  select * into old_media from public.course_media where id=target_old_media_id for update;
  select * into new_media from public.course_media where id=target_new_media_id for update;
  if old_media.id is null or not (public.is_trader_member(old_media.trader_id) or public.is_super_admin()) then raise exception 'forbidden'; end if;
  if new_media.id is null or new_media.trader_id <> old_media.trader_id or new_media.processing_state <> 'ready' or new_media.replaces_media_id <> target_old_media_id then raise exception 'replacement media is not ready'; end if;
  if new_media.media_type <> old_media.media_type then raise exception 'replacement media type mismatch'; end if;
  update public.lesson_content_blocks set media_id=target_new_media_id,updated_at=now() where trader_id=old_media.trader_id and media_id=target_old_media_id;
  update public.lesson_content_block_media set media_id=target_new_media_id where trader_id=old_media.trader_id and media_id=target_old_media_id;
  update public.resources set media_id=target_new_media_id,storage_path=new_media.storage_path where trader_id=old_media.trader_id and media_id=target_old_media_id;
  update public.course_media set processing_state='replaced',replaced_by_media_id=target_new_media_id,archived_at=now(),updated_at=now() where id=target_old_media_id and trader_id=old_media.trader_id;
end $$;
revoke all on function public.replace_course_media(uuid, uuid) from public, anon, service_role;
grant execute on function public.replace_course_media(uuid, uuid) to authenticated;

create or replace function public.create_lesson_content_block(
  target_lesson_id uuid, target_block_type public.lesson_content_type,
  target_sort_order integer, target_content jsonb, target_is_required boolean,
  target_media_ids uuid[] default '{}'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare l public.lessons%rowtype; block_id uuid; media_id uuid; media_count integer;
begin
  select * into l from public.lessons where id=target_lesson_id for update;
  if l.id is null or not (public.is_trader_member(l.trader_id) or public.is_super_admin()) then raise exception 'forbidden'; end if;
  if target_sort_order < 0 then raise exception 'invalid sort order'; end if;
  media_count := cardinality(target_media_ids);
  if target_block_type in ('video','pdf','image') and media_count <> 1 then raise exception 'single media block requires one asset'; end if;
  if target_block_type = 'gallery' and media_count < 1 then raise exception 'gallery requires at least one image'; end if;
  if target_block_type in ('rich_text','link') and media_count <> 0 then raise exception 'non-media block cannot contain media'; end if;
  if exists (
    select 1 from unnest(target_media_ids) requested_id
    where not exists (
      select 1 from public.course_media m where m.id=requested_id and m.trader_id=l.trader_id
        and m.processing_state='ready'
        and ((target_block_type='gallery' and m.media_type='image') or target_block_type::text=m.media_type::text)
    )
  ) then raise exception 'media unavailable or incompatible'; end if;
  insert into public.lesson_content_blocks(trader_id,course_id,lesson_id,block_type,sort_order,media_id,content,is_required,created_by)
  values(l.trader_id,l.course_id,l.id,target_block_type,target_sort_order,
    case when target_block_type in ('video','pdf','image') then target_media_ids[1] end,
    coalesce(target_content,'{}'::jsonb),target_is_required,auth.uid()) returning id into block_id;
  if target_block_type='gallery' then
    insert into public.lesson_content_block_media(trader_id,course_id,lesson_id,block_id,media_id,sort_order)
    select l.trader_id,l.course_id,l.id,block_id,item.media_id,item.ordinality-1
    from unnest(target_media_ids) with ordinality item(media_id,ordinality);
  end if;
  return block_id;
end $$;
revoke all on function public.create_lesson_content_block(uuid,public.lesson_content_type,integer,jsonb,boolean,uuid[]) from public,anon,service_role;
grant execute on function public.create_lesson_content_block(uuid,public.lesson_content_type,integer,jsonb,boolean,uuid[]) to authenticated;

create or replace function public.issue_course_media_session(target_media_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.course_media%rowtype; cid uuid; expires timestamptz := now()+interval '5 minutes';
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

create or replace function public.validate_course_media_transition()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.processing_state=new.processing_state then return new; end if;
  if not (
    (old.processing_state='uploading' and new.processing_state in ('processing','ready','failed','archived')) or
    (old.processing_state='processing' and new.processing_state in ('ready','failed','archived')) or
    (old.processing_state='ready' and new.processing_state in ('replaced','archived','deletion_blocked')) or
    (old.processing_state='failed' and new.processing_state='archived') or
    (old.processing_state='deletion_blocked' and new.processing_state in ('ready','replaced','archived'))
  ) then raise exception 'invalid media lifecycle transition'; end if;
  return new;
end $$;

create or replace function public.reorder_course_curriculum(target_course_id uuid,target_modules jsonb,target_lessons jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare tid uuid; item jsonb;
begin
  select trader_id into tid from public.courses where id=target_course_id for update;
  if tid is null or not(public.is_trader_member(tid) or public.is_super_admin()) then raise exception 'forbidden'; end if;
  for item in select * from jsonb_array_elements(target_modules) loop
    update public.course_modules set sort_order=(item->>'sort_order')::integer,status=(item->>'status')::public.content_status,updated_at=now()
      where id=(item->>'id')::uuid and course_id=target_course_id and trader_id=tid;
    if not found then raise exception 'invalid module'; end if;
  end loop;
  for item in select * from jsonb_array_elements(target_lessons) loop
    update public.lessons set sort_order=(item->>'sort_order')::integer,status=(item->>'status')::public.content_status,published_at=case when (item->>'status')='published' then coalesce(published_at,now()) else published_at end,updated_at=now()
      where id=(item->>'id')::uuid and course_id=target_course_id and trader_id=tid;
    if not found then raise exception 'invalid lesson'; end if;
  end loop;
  insert into public.audit_logs(trader_id,actor_user_id,actor_role,action,entity_type,entity_id,new_data)
    values(tid,auth.uid(),public.current_app_role(),'curriculum_reordered','course',target_course_id::text,jsonb_build_object('modules',target_modules,'lessons',target_lessons));
end $$;
revoke all on function public.reorder_course_curriculum(uuid,jsonb,jsonb) from public,anon,service_role;
grant execute on function public.reorder_course_curriculum(uuid,jsonb,jsonb) to authenticated;

create or replace function public.record_lesson_progress(
  target_lesson_id uuid, target_position_seconds integer, target_completed boolean default false
) returns public.lesson_progress language plpgsql security definer set search_path = '' as $$
declare l public.lessons%rowtype; result public.lesson_progress; clamped integer;
begin
  select * into l from public.lessons where id=target_lesson_id and status='published';
  if l.id is null or not public.can_access_course(l.course_id, auth.uid()) then raise exception 'lesson unavailable'; end if;
  clamped := greatest(0, least(coalesce(target_position_seconds,0), coalesce(l.duration_seconds, greatest(target_position_seconds,0))));
  insert into public.lesson_progress (trader_id,student_user_id,course_id,lesson_id,position_seconds,is_started,is_completed,first_started_at,first_completed_at,last_activity_at)
  values (l.trader_id,auth.uid(),l.course_id,l.id,clamped,true,target_completed,now(),case when target_completed then now() end,now())
  on conflict (trader_id,student_user_id,lesson_id) do update set
    position_seconds=excluded.position_seconds,is_started=true,
    is_completed=public.lesson_progress.is_completed or excluded.is_completed,
    first_started_at=coalesce(public.lesson_progress.first_started_at,now()),
    first_completed_at=coalesce(public.lesson_progress.first_completed_at,excluded.first_completed_at),
    last_activity_at=now(),updated_at=now()
  returning * into result;
  return result;
end $$;
revoke all on function public.record_lesson_progress(uuid, integer, boolean) from public, anon, service_role;
grant execute on function public.record_lesson_progress(uuid, integer, boolean) to authenticated;

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
  update public.courses set access_mode=target_mode,access_scope=case when target_mode='all_verified' then 'all_verified' else 'restricted' end,updated_at=now() where id=target_course_id;
  insert into public.content_access_grants(trader_id,entity_type,entity_id,group_id,granted_by)
    select tid,'course',target_course_id,gid,auth.uid() from (select distinct unnest(target_group_ids) gid) deduped_groups;
  insert into public.content_access_grants(trader_id,entity_type,entity_id,student_user_id,granted_by)
    select tid,'course',target_course_id,uid,auth.uid() from (select distinct unnest(target_student_ids) uid) deduped_students;
end $$;
revoke all on function public.set_course_access(uuid, public.course_access_mode, uuid[], uuid[]) from public, anon;
grant execute on function public.set_course_access(uuid, public.course_access_mode, uuid[], uuid[]) to authenticated;

create or replace function public.update_course_curriculum_settings(
  target_course_id uuid, target_title text, target_description text,
  target_status public.content_status, target_sort_order integer, target_cover_path text,
  target_mode public.course_access_mode, target_group_ids uuid[] default '{}', target_student_ids uuid[] default '{}'
) returns void language plpgsql security definer set search_path = '' as $$
declare tid uuid;
begin
  select trader_id into tid from public.courses where id=target_course_id for update;
  if tid is null or not (public.is_trader_member(tid) or public.is_super_admin()) then raise exception 'forbidden'; end if;
  update public.courses set title=trim(target_title),description=nullif(trim(target_description),''),status=target_status,sort_order=target_sort_order,cover_path=target_cover_path,updated_at=now() where id=target_course_id;
  perform public.set_course_access(target_course_id,target_mode,target_group_ids,target_student_ids);
end $$;
revoke all on function public.update_course_curriculum_settings(uuid,text,text,public.content_status,integer,text,public.course_access_mode,uuid[],uuid[]) from public, anon;
grant execute on function public.update_course_curriculum_settings(uuid,text,text,public.content_status,integer,text,public.course_access_mode,uuid[],uuid[]) to authenticated;

alter table public.course_modules enable row level security;
alter table public.course_media enable row level security;
alter table public.lesson_content_blocks enable row level security;
alter table public.lesson_content_block_media enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.course_media_access_sessions enable row level security;

create policy "staff manage course modules" on public.course_modules for all using(public.is_super_admin() or public.is_trader_member(trader_id)) with check(public.is_super_admin() or public.is_trader_member(trader_id));
create policy "students read accessible published modules" on public.course_modules for select using(status='published' and public.can_access_course(course_id,auth.uid()));
create policy "staff manage course media" on public.course_media for all using(public.is_super_admin() or public.is_trader_member(trader_id)) with check(public.is_super_admin() or public.is_trader_member(trader_id));
create policy "students read referenced ready media metadata" on public.course_media for select using(processing_state='ready' and (
  exists(select 1 from public.lesson_content_blocks b join public.lessons l on l.id=b.lesson_id and l.trader_id=b.trader_id where b.media_id=course_media.id and b.trader_id=course_media.trader_id and l.status='published' and public.can_access_course(l.course_id,auth.uid()))
  or exists(select 1 from public.lesson_content_block_media bm join public.lessons l on l.id=bm.lesson_id and l.trader_id=bm.trader_id where bm.media_id=course_media.id and bm.trader_id=course_media.trader_id and l.status='published' and public.can_access_course(l.course_id,auth.uid()))
  or exists(select 1 from public.resources r where r.media_id=course_media.id and r.trader_id=course_media.trader_id and r.status='published' and r.course_id is not null and public.can_access_course(r.course_id,auth.uid()))
));
create policy "staff manage lesson content blocks" on public.lesson_content_blocks for all using(public.is_super_admin() or public.is_trader_member(trader_id)) with check(public.is_super_admin() or public.is_trader_member(trader_id));
create policy "students read accessible lesson blocks" on public.lesson_content_blocks for select using(exists(select 1 from public.lessons l where l.id=lesson_id and l.trader_id=lesson_content_blocks.trader_id and l.status='published' and public.can_access_course(l.course_id,auth.uid())));
create policy "staff manage lesson gallery media" on public.lesson_content_block_media for all using(public.is_super_admin() or public.is_trader_member(trader_id)) with check(public.is_super_admin() or public.is_trader_member(trader_id));
create policy "students read accessible lesson gallery media" on public.lesson_content_block_media for select using(exists(select 1 from public.lessons l where l.id=lesson_id and l.trader_id=lesson_content_block_media.trader_id and l.status='published' and public.can_access_course(l.course_id,auth.uid())));
create policy "students read own lesson progress" on public.lesson_progress for select using(student_user_id=auth.uid());
create policy "tenant staff read lesson progress" on public.lesson_progress for select using(public.is_super_admin() or public.is_trader_member(trader_id));
create policy "students read own media sessions" on public.course_media_access_sessions for select using(student_user_id=auth.uid());
create policy "tenant staff read media sessions" on public.course_media_access_sessions for select using(public.is_super_admin() or public.is_trader_member(trader_id));

drop policy "entitled students read published courses" on public.courses;
create policy "students read accessible published courses" on public.courses for select using(status='published' and public.can_access_course(id,auth.uid()));
drop policy "entitled students read published lessons" on public.lessons;
create policy "students read accessible published lessons" on public.lessons for select using(status='published' and public.can_access_course(course_id,auth.uid()));
drop policy "entitled students read published resources" on public.resources;
create policy "students read accessible published resources" on public.resources for select using(
  status='published' and (
    (course_id is not null and public.can_access_course(course_id,auth.uid()))
    or (course_id is null and public.can_access_content(trader_id,'resource',id,access_scope))
  )
);

drop policy if exists "entitled users read tenant course content" on storage.objects;
drop policy if exists "tenant members manage course content" on storage.objects;
create policy "staff manage protected course content" on storage.objects for all
using(bucket_id='course-content' and (public.is_super_admin() or public.is_trader_member((storage.foldername(name))[1]::uuid)))
with check(bucket_id='course-content' and (public.is_super_admin() or public.is_trader_member((storage.foldername(name))[1]::uuid)));
-- Students receive short-lived server-issued media sessions; direct storage SELECT is intentionally absent.

create trigger set_course_modules_updated_at before update on public.course_modules for each row execute function public.set_updated_at();
create trigger set_course_media_updated_at before update on public.course_media for each row execute function public.set_updated_at();
create trigger set_lesson_content_blocks_updated_at before update on public.lesson_content_blocks for each row execute function public.set_updated_at();
create trigger set_lesson_progress_updated_at before update on public.lesson_progress for each row execute function public.set_updated_at();
create trigger validate_course_media_transition before update of processing_state on public.course_media for each row execute function public.validate_course_media_transition();
create trigger audit_course_modules after insert or update or delete on public.course_modules for each row execute function public.write_audit_log();
create trigger audit_course_media after insert or update or delete on public.course_media for each row execute function public.write_audit_log();
create trigger audit_lesson_content_blocks after insert or update or delete on public.lesson_content_blocks for each row execute function public.write_audit_log();
create trigger audit_lesson_content_block_media after insert or update or delete on public.lesson_content_block_media for each row execute function public.write_audit_log();

-- Postflight: every legacy lesson must have exactly one tenant-consistent module.
do $$ begin
  if exists(select 1 from public.lessons where module_id is null) then raise exception 'course migration postflight failed: lesson without module'; end if;
end $$;
alter table public.lessons alter column module_id set not null;

comment on table public.course_media is 'Tenant-owned normalized protected media; storage objects are never public.';
comment on table public.lesson_content_block_media is 'Ordered tenant-owned media items for an image gallery lesson block.';
comment on table public.lesson_progress is 'Durable per-student progress retained across access loss and curriculum reorder.';
