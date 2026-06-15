create type public.content_access_scope as enum (
  'all_verified',
  'restricted'
);

create type public.conversation_type as enum (
  'direct',
  'group',
  'announcement'
);

alter table public.courses
  add column access_scope public.content_access_scope
    not null default 'all_verified';

alter table public.resources
  add column access_scope public.content_access_scope
    not null default 'all_verified';

alter table public.announcements
  add column access_scope public.content_access_scope
    not null default 'all_verified';

alter table public.live_classes
  add column access_scope public.content_access_scope
    not null default 'all_verified';

create table public.student_groups (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  name text not null,
  description text,
  color text not null default '#111315',
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, trader_id),
  check (char_length(trim(name)) between 2 and 80),
  check (description is null or char_length(description) <= 500),
  check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create unique index student_groups_trader_name_unique
  on public.student_groups (trader_id, lower(name));

create table public.student_group_members (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  group_id uuid not null,
  application_id uuid not null,
  added_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (group_id, application_id),
  foreign key (group_id, trader_id)
    references public.student_groups(id, trader_id) on delete cascade,
  foreign key (application_id, trader_id)
    references public.student_applications(id, trader_id) on delete cascade
);

create table public.content_access_grants (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  entity_type text not null
    check (entity_type in ('course', 'resource', 'announcement', 'live_class')),
  entity_id uuid not null,
  group_id uuid,
  student_user_id uuid references public.profiles(id) on delete cascade,
  granted_by uuid not null references public.profiles(id) on delete restrict,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (group_id, trader_id)
    references public.student_groups(id, trader_id) on delete cascade,
  check (num_nonnulls(group_id, student_user_id) = 1)
);

create or replace function public.validate_content_access_grant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.entity_type = 'course'
    and not exists (
      select 1 from public.courses
      where id = new.entity_id and trader_id = new.trader_id
    ) then
    raise exception 'course access target does not exist';
  elsif new.entity_type = 'resource'
    and not exists (
      select 1 from public.resources
      where id = new.entity_id and trader_id = new.trader_id
    ) then
    raise exception 'resource access target does not exist';
  elsif new.entity_type = 'announcement'
    and not exists (
      select 1 from public.announcements
      where id = new.entity_id and trader_id = new.trader_id
    ) then
    raise exception 'announcement access target does not exist';
  elsif new.entity_type = 'live_class'
    and not exists (
      select 1 from public.live_classes
      where id = new.entity_id and trader_id = new.trader_id
    ) then
    raise exception 'live class access target does not exist';
  end if;

  if new.student_user_id is not null
    and not exists (
      select 1
      from public.student_applications application
      where application.trader_id = new.trader_id
        and application.student_user_id = new.student_user_id
        and application.status = 'verified'
    ) then
    raise exception 'student access recipient is not verified for this workspace';
  end if;

  return new;
end;
$$;

create trigger validate_content_access_grants
  before insert or update on public.content_access_grants
  for each row execute function public.validate_content_access_grant();

create unique index content_access_group_grant_unique
  on public.content_access_grants (
    trader_id,
    entity_type,
    entity_id,
    group_id
  )
  where group_id is not null;

create unique index content_access_student_grant_unique
  on public.content_access_grants (
    trader_id,
    entity_type,
    entity_id,
    student_user_id
  )
  where student_user_id is not null;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  type public.conversation_type not null,
  title text,
  group_id uuid,
  direct_student_user_id uuid references public.profiles(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  is_archived boolean not null default false,
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, trader_id),
  foreign key (group_id, trader_id)
    references public.student_groups(id, trader_id) on delete cascade,
  check (title is null or char_length(title) <= 160),
  check (
    (type = 'group' and group_id is not null)
    or (type <> 'group' and group_id is null)
  ),
  check (
    (type = 'direct' and direct_student_user_id is not null)
    or (type <> 'direct' and direct_student_user_id is null)
  )
);

create unique index conversations_one_group_thread
  on public.conversations (group_id)
  where type = 'group';

create unique index conversations_one_direct_thread_per_student
  on public.conversations (trader_id, direct_student_user_id)
  where type = 'direct';

create table public.conversation_members (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  conversation_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'member'
    check (member_role in ('owner', 'moderator', 'member')),
  last_read_at timestamptz,
  is_muted boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (conversation_id, user_id),
  foreign key (conversation_id, trader_id)
    references public.conversations(id, trader_id) on delete cascade
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  conversation_id uuid not null,
  sender_user_id uuid not null references public.profiles(id) on delete restrict,
  client_message_id uuid not null,
  body text not null,
  reply_to_id uuid references public.messages(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, trader_id),
  unique (conversation_id, sender_user_id, client_message_id),
  foreign key (conversation_id, trader_id)
    references public.conversations(id, trader_id) on delete cascade,
  check (char_length(trim(body)) between 1 and 5000)
);

create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  message_id uuid not null,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null,
  created_at timestamptz not null default now(),
  unique (message_id),
  foreign key (message_id, trader_id)
    references public.messages(id, trader_id) on delete cascade,
  check (file_size > 0 and file_size <= 26214400),
  check (char_length(file_name) between 1 and 255),
  check (char_length(storage_path) <= 1000)
);

create index student_group_members_application_idx
  on public.student_group_members (application_id, group_id);
create index content_access_grants_entity_idx
  on public.content_access_grants (trader_id, entity_type, entity_id);
create index conversation_members_user_idx
  on public.conversation_members (user_id, conversation_id);
create index conversations_trader_activity_idx
  on public.conversations (trader_id, last_message_at desc nulls last);
create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);

create trigger set_student_groups_updated_at
  before update on public.student_groups
  for each row execute function public.set_updated_at();
create trigger set_conversations_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();
create trigger set_messages_updated_at
  before update on public.messages
  for each row execute function public.set_updated_at();

create trigger audit_student_groups
  after insert or update or delete on public.student_groups
  for each row execute function public.write_audit_log();
create trigger audit_student_group_members
  after insert or update or delete on public.student_group_members
  for each row execute function public.write_audit_log();
create trigger audit_content_access_grants
  after insert or update or delete on public.content_access_grants
  for each row execute function public.write_audit_log();
create trigger audit_conversations
  after insert or update or delete on public.conversations
  for each row execute function public.write_audit_log();

create or replace function public.is_conversation_member(
  target_conversation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_members member
    where member.conversation_id = target_conversation_id
      and member.user_id = auth.uid()
  );
$$;

create or replace function public.shares_conversation_with(
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_members current_member
    join public.conversation_members target_member
      on target_member.conversation_id = current_member.conversation_id
    where current_member.user_id = auth.uid()
      and target_member.user_id = target_user_id
  );
$$;

create or replace function public.can_post_to_conversation(
  target_conversation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations conversation
    join public.conversation_members member
      on member.conversation_id = conversation.id
    where conversation.id = target_conversation_id
      and member.user_id = auth.uid()
      and not conversation.is_archived
      and (
        conversation.type <> 'announcement'
        or public.is_trader_member(conversation.trader_id)
      )
  );
$$;

create or replace function public.can_access_content(
  target_trader_id uuid,
  target_entity_type text,
  target_entity_id uuid,
  target_scope public.content_access_scope
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_verified_access(target_trader_id)
    and (
      target_scope = 'all_verified'
      or exists (
        select 1
        from public.content_access_grants grant_row
        where grant_row.trader_id = target_trader_id
          and grant_row.entity_type = target_entity_type
          and grant_row.entity_id = target_entity_id
          and (
            grant_row.expires_at is null
            or grant_row.expires_at > now()
          )
          and (
            grant_row.student_user_id = auth.uid()
            or exists (
              select 1
              from public.student_group_members group_member
              join public.student_applications application
                on application.id = group_member.application_id
                and application.trader_id = group_member.trader_id
              where group_member.group_id = grant_row.group_id
                and application.student_user_id = auth.uid()
                and application.status = 'verified'
            )
          )
      )
    );
$$;

create or replace function public.create_student_group(
  target_name text,
  target_description text default null,
  target_color text default '#111315'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_trader_id uuid := public.current_trader_id();
  created_group_id uuid;
  created_conversation_id uuid;
begin
  if resolved_trader_id is null then
    raise exception 'mentor workspace not found';
  end if;

  insert into public.student_groups (
    trader_id,
    name,
    description,
    color,
    created_by
  )
  values (
    resolved_trader_id,
    trim(target_name),
    nullif(trim(target_description), ''),
    target_color,
    auth.uid()
  )
  returning id into created_group_id;

  insert into public.conversations (
    trader_id,
    type,
    title,
    group_id,
    created_by
  )
  values (
    resolved_trader_id,
    'group',
    trim(target_name),
    created_group_id,
    auth.uid()
  )
  returning id into created_conversation_id;

  insert into public.conversation_members (
    trader_id,
    conversation_id,
    user_id,
    member_role
  )
  select
    resolved_trader_id,
    created_conversation_id,
    member.user_id,
    case when member.role = 'owner' then 'owner' else 'moderator' end
  from public.trader_members member
  where member.trader_id = resolved_trader_id
  on conflict (conversation_id, user_id) do nothing;

  return created_group_id;
end;
$$;

create or replace function public.set_student_group_members(
  target_group_id uuid,
  target_application_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_trader_id uuid;
  group_conversation_id uuid;
  invalid_count integer;
begin
  select trader_id
  into resolved_trader_id
  from public.student_groups
  where id = target_group_id;

  if resolved_trader_id is null
    or (
      not public.is_super_admin()
      and not public.is_trader_member(resolved_trader_id)
    ) then
    raise exception 'forbidden';
  end if;

  select count(*)
  into invalid_count
  from unnest(coalesce(target_application_ids, array[]::uuid[])) requested(id)
  left join public.student_applications application
    on application.id = requested.id
    and application.trader_id = resolved_trader_id
    and application.status = 'verified'
  where application.id is null;

  if invalid_count > 0 then
    raise exception 'invalid or unverified student selection';
  end if;

  delete from public.student_group_members member
  where member.group_id = target_group_id
    and not (
      member.application_id = any(
        coalesce(target_application_ids, array[]::uuid[])
      )
    );

  insert into public.student_group_members (
    trader_id,
    group_id,
    application_id,
    added_by
  )
  select
    resolved_trader_id,
    target_group_id,
    requested.id,
    auth.uid()
  from unnest(coalesce(target_application_ids, array[]::uuid[])) requested(id)
  on conflict (group_id, application_id) do nothing;

  select id
  into group_conversation_id
  from public.conversations
  where group_id = target_group_id
    and type = 'group';

  delete from public.conversation_members member
  where member.conversation_id = group_conversation_id
    and member.member_role = 'member'
    and not exists (
      select 1
      from public.student_group_members group_member
      join public.student_applications application
        on application.id = group_member.application_id
      where group_member.group_id = target_group_id
        and application.student_user_id = member.user_id
    );

  insert into public.conversation_members (
    trader_id,
    conversation_id,
    user_id,
    member_role
  )
  select
    resolved_trader_id,
    group_conversation_id,
    application.student_user_id,
    'member'
  from public.student_group_members group_member
  join public.student_applications application
    on application.id = group_member.application_id
    and application.trader_id = group_member.trader_id
  where group_member.group_id = target_group_id
  on conflict (conversation_id, user_id) do nothing;

  return cardinality(coalesce(target_application_ids, array[]::uuid[]));
end;
$$;

create or replace function public.create_direct_conversation(
  target_application_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_trader_id uuid;
  target_student_id uuid;
  target_student_name text;
  created_conversation_id uuid;
begin
  select application.trader_id, application.student_user_id, profile.full_name
  into resolved_trader_id, target_student_id, target_student_name
  from public.student_applications application
  join public.profiles profile on profile.id = application.student_user_id
  where application.id = target_application_id
    and application.status = 'verified';

  if resolved_trader_id is null
    or (
      not public.is_super_admin()
      and not public.is_trader_member(resolved_trader_id)
    ) then
    raise exception 'forbidden';
  end if;

  insert into public.conversations (
    trader_id,
    type,
    title,
    direct_student_user_id,
    created_by
  )
  values (
    resolved_trader_id,
    'direct',
    target_student_name,
    target_student_id,
    auth.uid()
  )
  on conflict (trader_id, direct_student_user_id)
    where type = 'direct'
  do update set title = excluded.title
  returning id into created_conversation_id;

  insert into public.conversation_members (
    trader_id,
    conversation_id,
    user_id,
    member_role
  )
  select
    resolved_trader_id,
    created_conversation_id,
    member.user_id,
    case when member.role = 'owner' then 'owner' else 'moderator' end
  from public.trader_members member
  where member.trader_id = resolved_trader_id
  union all
  select
    resolved_trader_id,
    created_conversation_id,
    target_student_id,
    'member'
  on conflict (conversation_id, user_id) do nothing;

  return created_conversation_id;
end;
$$;

create or replace function public.create_conversation_message(
  target_conversation_id uuid,
  target_client_message_id uuid,
  target_body text,
  target_attachment_path text default null,
  target_attachment_name text default null,
  target_attachment_mime_type text default null,
  target_attachment_size bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_trader_id uuid;
  created_message_id uuid;
  normalized_body text := nullif(trim(target_body), '');
  attachment_count integer := num_nonnulls(
    target_attachment_path,
    target_attachment_name,
    target_attachment_mime_type,
    target_attachment_size
  );
begin
  select trader_id
  into resolved_trader_id
  from public.conversations
  where id = target_conversation_id;

  if resolved_trader_id is null
    or not public.can_post_to_conversation(target_conversation_id) then
    raise exception 'forbidden';
  end if;

  if attachment_count not in (0, 4) then
    raise exception 'incomplete attachment metadata';
  end if;

  if normalized_body is null and attachment_count = 0 then
    raise exception 'message content is required';
  end if;

  if normalized_body is not null and char_length(normalized_body) > 5000 then
    raise exception 'message is too long';
  end if;

  if attachment_count = 4 then
    if target_attachment_size <= 0
      or target_attachment_size > 26214400
      or target_attachment_mime_type not in (
        'image/png',
        'image/jpeg',
        'image/webp',
        'application/pdf',
        'audio/mpeg',
        'audio/mp4',
        'audio/webm'
      )
      or target_attachment_path not like
        resolved_trader_id::text || '/' ||
        target_conversation_id::text || '/' ||
        target_client_message_id::text || '/%' then
      raise exception 'invalid attachment metadata';
    end if;
  end if;

  insert into public.messages (
    trader_id,
    conversation_id,
    sender_user_id,
    client_message_id,
    body
  )
  values (
    resolved_trader_id,
    target_conversation_id,
    auth.uid(),
    target_client_message_id,
    coalesce(normalized_body, 'Attachment')
  )
  on conflict (
    conversation_id,
    sender_user_id,
    client_message_id
  )
  do update set client_message_id = excluded.client_message_id
  returning id into created_message_id;

  if attachment_count = 4 then
    insert into public.message_attachments (
      trader_id,
      message_id,
      storage_path,
      file_name,
      mime_type,
      file_size
    )
    values (
      resolved_trader_id,
      created_message_id,
      target_attachment_path,
      target_attachment_name,
      target_attachment_mime_type,
      target_attachment_size
    )
    on conflict do nothing;
  end if;

  return created_message_id;
end;
$$;

create or replace function public.mark_conversation_read(
  target_conversation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversation_members
  set last_read_at = now()
  where conversation_id = target_conversation_id
    and user_id = auth.uid();

  if not found then
    raise exception 'conversation membership not found';
  end if;
end;
$$;

create or replace function public.create_announcement_conversation(
  target_title text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_trader_id uuid := public.current_trader_id();
  created_conversation_id uuid;
begin
  if resolved_trader_id is null then
    raise exception 'mentor workspace not found';
  end if;

  insert into public.conversations (
    trader_id,
    type,
    title,
    created_by
  )
  values (
    resolved_trader_id,
    'announcement',
    trim(target_title),
    auth.uid()
  )
  returning id into created_conversation_id;

  insert into public.conversation_members (
    trader_id,
    conversation_id,
    user_id,
    member_role
  )
  select
    resolved_trader_id,
    created_conversation_id,
    member.user_id,
    case when member.role = 'owner' then 'owner' else 'moderator' end
  from public.trader_members member
  where member.trader_id = resolved_trader_id
  union
  select
    resolved_trader_id,
    created_conversation_id,
    application.student_user_id,
    'member'
  from public.student_applications application
  where application.trader_id = resolved_trader_id
    and application.status = 'verified'
  on conflict (conversation_id, user_id) do nothing;

  return created_conversation_id;
end;
$$;

create or replace function public.set_course_access(
  target_course_id uuid,
  target_scope public.content_access_scope,
  target_group_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_trader_id uuid;
  invalid_count integer;
begin
  select trader_id
  into resolved_trader_id
  from public.courses
  where id = target_course_id;

  if resolved_trader_id is null
    or (
      not public.is_super_admin()
      and not public.is_trader_member(resolved_trader_id)
    ) then
    raise exception 'forbidden';
  end if;

  select count(*)
  into invalid_count
  from unnest(coalesce(target_group_ids, array[]::uuid[])) requested(id)
  left join public.student_groups group_row
    on group_row.id = requested.id
    and group_row.trader_id = resolved_trader_id
  where group_row.id is null;

  if invalid_count > 0 then
    raise exception 'invalid group selection';
  end if;

  if target_scope = 'restricted'
    and cardinality(coalesce(target_group_ids, array[]::uuid[])) = 0 then
    raise exception 'restricted content requires at least one group';
  end if;

  update public.courses
  set access_scope = target_scope
  where id = target_course_id
    and trader_id = resolved_trader_id;

  delete from public.content_access_grants
  where trader_id = resolved_trader_id
    and entity_type = 'course'
    and entity_id = target_course_id
    and group_id is not null;

  if target_scope = 'restricted' then
    insert into public.content_access_grants (
      trader_id,
      entity_type,
      entity_id,
      group_id,
      granted_by
    )
    select
      resolved_trader_id,
      'course',
      target_course_id,
      requested.id,
      auth.uid()
    from unnest(target_group_ids) requested(id);
  end if;
end;
$$;

create or replace function public.update_course_with_access(
  target_course_id uuid,
  target_title text,
  target_description text,
  target_status public.content_status,
  target_sort_order integer,
  target_cover_path text,
  target_scope public.content_access_scope,
  target_group_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_trader_id uuid;
begin
  select trader_id
  into resolved_trader_id
  from public.courses
  where id = target_course_id
  for update;

  if resolved_trader_id is null
    or (
      not public.is_super_admin()
      and not public.is_trader_member(resolved_trader_id)
    ) then
    raise exception 'forbidden';
  end if;

  if char_length(trim(target_title)) < 2
    or char_length(trim(target_title)) > 160
    or target_sort_order < 0
    or target_sort_order > 100000
    or (
      target_description is not null
      and char_length(target_description) > 1200
    ) then
    raise exception 'invalid course details';
  end if;

  perform public.set_course_access(
    target_course_id,
    target_scope,
    target_group_ids
  );

  update public.courses
  set
    title = trim(target_title),
    description = nullif(trim(target_description), ''),
    status = target_status,
    sort_order = target_sort_order,
    cover_path = target_cover_path
  where id = target_course_id
    and trader_id = resolved_trader_id;
end;
$$;

create or replace function public.update_conversation_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set
    last_message_at = new.created_at,
    last_message_preview = left(new.body, 240)
  where id = new.conversation_id
    and trader_id = new.trader_id;
  return new;
end;
$$;

create or replace function public.cleanup_content_access_grants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.content_access_grants
  where trader_id = old.trader_id
    and entity_type = tg_argv[0]
    and entity_id = old.id;
  return old;
end;
$$;

create trigger courses_cleanup_content_access_grants
  after delete on public.courses
  for each row execute function public.cleanup_content_access_grants('course');
create trigger resources_cleanup_content_access_grants
  after delete on public.resources
  for each row execute function public.cleanup_content_access_grants('resource');
create trigger announcements_cleanup_content_access_grants
  after delete on public.announcements
  for each row execute function public.cleanup_content_access_grants('announcement');
create trigger live_classes_cleanup_content_access_grants
  after delete on public.live_classes
  for each row execute function public.cleanup_content_access_grants('live_class');

create trigger messages_update_conversation_activity
  after insert on public.messages
  for each row execute function public.update_conversation_activity();

create or replace function public.sync_verified_announcement_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'verified'
    and old.status is distinct from new.status then
    insert into public.conversation_members (
      trader_id,
      conversation_id,
      user_id,
      member_role
    )
    select
      new.trader_id,
      conversation.id,
      new.student_user_id,
      'member'
    from public.conversations conversation
    where conversation.trader_id = new.trader_id
      and conversation.type = 'announcement'
      and conversation.group_id is null
    on conflict (conversation_id, user_id) do nothing;

    insert into public.conversation_members (
      trader_id,
      conversation_id,
      user_id,
      member_role
    )
    select
      new.trader_id,
      conversation.id,
      new.student_user_id,
      'member'
    from public.student_group_members group_member
    join public.conversations conversation
      on conversation.group_id = group_member.group_id
      and conversation.trader_id = group_member.trader_id
      and conversation.type = 'group'
    where group_member.application_id = new.id
    on conflict (conversation_id, user_id) do nothing;

    insert into public.conversation_members (
      trader_id,
      conversation_id,
      user_id,
      member_role
    )
    select
      new.trader_id,
      conversation.id,
      new.student_user_id,
      'member'
    from public.conversations conversation
    where conversation.trader_id = new.trader_id
      and conversation.type = 'direct'
      and conversation.direct_student_user_id = new.student_user_id
    on conflict (conversation_id, user_id) do nothing;
  elsif old.status = 'verified'
    and new.status is distinct from old.status then
    delete from public.conversation_members member
    using public.conversations conversation
    where member.conversation_id = conversation.id
      and conversation.trader_id = new.trader_id
      and member.user_id = new.student_user_id
      and member.member_role = 'member';
  end if;
  return new;
end;
$$;

create trigger student_applications_sync_announcement_members
  after update of status on public.student_applications
  for each row execute function public.sync_verified_announcement_members();

create or replace function public.sync_trader_conversation_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.conversation_members (
      trader_id,
      conversation_id,
      user_id,
      member_role
    )
    select
      new.trader_id,
      conversation.id,
      new.user_id,
      case when new.role = 'owner' then 'owner' else 'moderator' end
    from public.conversations conversation
    where conversation.trader_id = new.trader_id
    on conflict (conversation_id, user_id)
    do update set member_role = excluded.member_role;
    return new;
  end if;

  delete from public.conversation_members member
  using public.conversations conversation
  where member.conversation_id = conversation.id
    and conversation.trader_id = old.trader_id
    and member.user_id = old.user_id;
  return old;
end;
$$;

create trigger trader_members_sync_conversations
  after insert or delete on public.trader_members
  for each row execute function public.sync_trader_conversation_membership();

alter table public.student_groups enable row level security;
alter table public.student_group_members enable row level security;
alter table public.content_access_grants enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_attachments enable row level security;

create policy "conversation participants read member profiles"
on public.profiles for select
using (public.shares_conversation_with(id));

create policy "tenant members manage student groups"
on public.student_groups for all
using (public.is_super_admin() or public.is_trader_member(trader_id))
with check (public.is_super_admin() or public.is_trader_member(trader_id));

create policy "students read assigned groups"
on public.student_groups for select
using (
  exists (
    select 1
    from public.student_group_members member
    join public.student_applications application
      on application.id = member.application_id
    where member.group_id = student_groups.id
      and application.student_user_id = auth.uid()
      and application.status = 'verified'
  )
);

create policy "tenant members manage group membership"
on public.student_group_members for all
using (public.is_super_admin() or public.is_trader_member(trader_id))
with check (public.is_super_admin() or public.is_trader_member(trader_id));

create policy "students read own group membership"
on public.student_group_members for select
using (
  exists (
    select 1
    from public.student_applications application
    where application.id = student_group_members.application_id
      and application.student_user_id = auth.uid()
      and application.status = 'verified'
  )
);

create policy "tenant members manage content grants"
on public.content_access_grants for all
using (public.is_super_admin() or public.is_trader_member(trader_id))
with check (public.is_super_admin() or public.is_trader_member(trader_id));

create policy "participants read conversations"
on public.conversations for select
using (
  public.is_super_admin()
  or public.is_trader_member(trader_id)
  or public.is_conversation_member(id)
);

create policy "tenant members manage conversations"
on public.conversations for all
using (public.is_super_admin() or public.is_trader_member(trader_id))
with check (public.is_super_admin() or public.is_trader_member(trader_id));

create policy "participants read conversation membership"
on public.conversation_members for select
using (
  public.is_super_admin()
  or public.is_trader_member(trader_id)
  or public.is_conversation_member(conversation_id)
);

create policy "tenant members manage conversation membership"
on public.conversation_members for all
using (public.is_super_admin() or public.is_trader_member(trader_id))
with check (public.is_super_admin() or public.is_trader_member(trader_id));

create policy "participants read messages"
on public.messages for select
using (
  public.is_super_admin()
  or public.is_trader_member(trader_id)
  or public.is_conversation_member(conversation_id)
);

create policy "participants read message attachments"
on public.message_attachments for select
using (
  exists (
    select 1
    from public.messages message
    where message.id = message_attachments.message_id
      and (
        public.is_super_admin()
        or public.is_trader_member(message.trader_id)
        or public.is_conversation_member(message.conversation_id)
      )
  )
);

drop policy "verified students read published courses" on public.courses;
create policy "entitled students read published courses"
on public.courses for select
using (
  status = 'published'
  and public.can_access_content(
    trader_id,
    'course',
    id,
    access_scope
  )
);

drop policy "verified students read published lessons" on public.lessons;
create policy "entitled students read published lessons"
on public.lessons for select
using (
  status = 'published'
  and exists (
    select 1
    from public.courses course
    where course.id = lessons.course_id
      and course.trader_id = lessons.trader_id
      and course.status = 'published'
      and public.can_access_content(
        course.trader_id,
        'course',
        course.id,
        course.access_scope
      )
  )
);

drop policy "verified students read published resources" on public.resources;
create policy "entitled students read published resources"
on public.resources for select
using (
  status = 'published'
  and public.can_access_content(
    trader_id,
    'resource',
    id,
    access_scope
  )
);

drop policy "verified students read published announcements"
  on public.announcements;
create policy "entitled students read published announcements"
on public.announcements for select
using (
  status = 'published'
  and (expires_at is null or expires_at > now())
  and public.can_access_content(
    trader_id,
    'announcement',
    id,
    access_scope
  )
);

drop policy "verified students read published live classes"
  on public.live_classes;
create policy "entitled students read published live classes"
on public.live_classes for select
using (
  status = 'published'
  and public.can_access_content(
    trader_id,
    'live_class',
    id,
    access_scope
  )
);

drop policy "verified users read tenant course content" on storage.objects;
create policy "entitled users read tenant course content"
on storage.objects for select
using (
  bucket_id = 'course-content'
  and (
    public.is_super_admin()
    or public.is_trader_member((storage.foldername(name))[1]::uuid)
    or exists (
      select 1
      from public.courses course
      where course.id = (storage.foldername(name))[2]::uuid
        and course.trader_id = (storage.foldername(name))[1]::uuid
        and course.status = 'published'
        and public.can_access_content(
          course.trader_id,
          'course',
          course.id,
          course.access_scope
        )
    )
  )
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'message-attachments',
  'message-attachments',
  false,
  26214400,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf',
    'audio/mpeg',
    'audio/mp4',
    'audio/webm'
  ]
)
on conflict (id) do nothing;

create policy "conversation participants read message files"
on storage.objects for select
using (
  bucket_id = 'message-attachments'
  and (
    public.is_super_admin()
    or public.is_trader_member((storage.foldername(name))[1]::uuid)
    or public.is_conversation_member(
      (storage.foldername(name))[2]::uuid
    )
  )
);

revoke all on function public.create_student_group(text, text, text)
  from public, anon;
grant execute on function public.create_student_group(text, text, text)
  to authenticated;
revoke all on function public.set_student_group_members(uuid, uuid[])
  from public, anon;
grant execute on function public.set_student_group_members(uuid, uuid[])
  to authenticated;
revoke all on function public.create_direct_conversation(uuid)
  from public, anon;
grant execute on function public.create_direct_conversation(uuid)
  to authenticated;
revoke all on function public.create_announcement_conversation(text)
  from public, anon;
grant execute on function public.create_announcement_conversation(text)
  to authenticated;
revoke all on function public.create_conversation_message(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  bigint
) from public, anon;
grant execute on function public.create_conversation_message(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  bigint
) to authenticated;
revoke all on function public.mark_conversation_read(uuid)
  from public, anon;
grant execute on function public.mark_conversation_read(uuid)
  to authenticated;
revoke all on function public.set_course_access(
  uuid,
  public.content_access_scope,
  uuid[]
) from public, anon;
grant execute on function public.set_course_access(
  uuid,
  public.content_access_scope,
  uuid[]
) to authenticated;
revoke all on function public.update_course_with_access(
  uuid,
  text,
  text,
  public.content_status,
  integer,
  text,
  public.content_access_scope,
  uuid[]
) from public, anon;
grant execute on function public.update_course_with_access(
  uuid,
  text,
  text,
  public.content_status,
  integer,
  text,
  public.content_access_scope,
  uuid[]
) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversation_members'
  ) then
    execute 'alter publication supabase_realtime add table public.conversation_members';
  end if;
end;
$$;
