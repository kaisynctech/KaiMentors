-- MB-118: Direct messages are strictly two-party (one mentor + one student).

alter table public.conversations
  add column if not exists direct_mentor_user_id uuid references public.profiles(id) on delete set null;

-- Backfill mentor on existing direct threads before index/constraint changes.
update public.conversations c
set direct_mentor_user_id = coalesce(
  (
    select cm.user_id
    from public.conversation_members cm
    join public.trader_members tm
      on tm.user_id = cm.user_id
      and tm.trader_id = c.trader_id
    where cm.conversation_id = c.id
      and cm.user_id <> c.direct_student_user_id
    order by case when cm.user_id = c.created_by then 0 else 1 end,
             cm.joined_at
    limit 1
  ),
  c.created_by
)
where c.type = 'direct'
  and c.direct_mentor_user_id is null;

delete from public.conversation_members cm
using public.conversations c
where cm.conversation_id = c.id
  and c.type = 'direct'
  and cm.user_id not in (c.direct_mentor_user_id, c.direct_student_user_id);

drop index if exists public.conversations_one_direct_thread_per_student;

create unique index conversations_one_direct_thread_per_pair
  on public.conversations (trader_id, direct_mentor_user_id, direct_student_user_id)
  where type = 'direct'
    and direct_mentor_user_id is not null
    and direct_student_user_id is not null;

alter table public.conversations
  drop constraint if exists conversations_direct_pair_required;

alter table public.conversations
  add constraint conversations_direct_pair_required
    check (
      type <> 'direct'
      or (direct_mentor_user_id is not null and direct_student_user_id is not null)
    );

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
  mentor_user_id uuid := auth.uid();
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
    direct_mentor_user_id,
    created_by
  )
  values (
    resolved_trader_id,
    'direct',
    target_student_name,
    target_student_id,
    mentor_user_id,
    mentor_user_id
  )
  on conflict (trader_id, direct_mentor_user_id, direct_student_user_id)
    where type = 'direct'
      and direct_mentor_user_id is not null
      and direct_student_user_id is not null
  do update set title = excluded.title
  returning id into created_conversation_id;

  insert into public.conversation_members (
    trader_id,
    conversation_id,
    user_id,
    member_role
  )
  values
    (resolved_trader_id, created_conversation_id, mentor_user_id, 'owner'),
    (resolved_trader_id, created_conversation_id, target_student_id, 'member')
  on conflict (conversation_id, user_id) do nothing;

  return created_conversation_id;
end;
$$;

drop function if exists public.create_student_conversation(uuid);

create or replace function public.create_student_conversation(
  target_application_id uuid,
  target_mentor_user_id uuid default null
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
  resolved_mentor_user_id uuid;
  mentor_count integer;
  created_conversation_id uuid;
begin
  select application.trader_id, application.student_user_id, profile.full_name
  into resolved_trader_id, target_student_id, target_student_name
  from public.student_applications application
  join public.profiles profile on profile.id = application.student_user_id
  where application.id = target_application_id
    and application.status = 'verified'
    and application.student_user_id = auth.uid();

  if resolved_trader_id is null then
    raise exception 'forbidden';
  end if;

  select count(*)
  into mentor_count
  from public.trader_members member
  where member.trader_id = resolved_trader_id;

  if target_mentor_user_id is not null then
    if not exists (
      select 1
      from public.trader_members member
      where member.trader_id = resolved_trader_id
        and member.user_id = target_mentor_user_id
    ) then
      raise exception 'invalid mentor';
    end if;
    resolved_mentor_user_id := target_mentor_user_id;
  elsif mentor_count = 1 then
    select member.user_id
    into resolved_mentor_user_id
    from public.trader_members member
    where member.trader_id = resolved_trader_id
    limit 1;
  elsif mentor_count = 0 then
    raise exception 'no mentor available';
  else
    raise exception 'mentor required';
  end if;

  insert into public.conversations (
    trader_id,
    type,
    title,
    direct_student_user_id,
    direct_mentor_user_id,
    created_by
  )
  values (
    resolved_trader_id,
    'direct',
    target_student_name,
    target_student_id,
    resolved_mentor_user_id,
    auth.uid()
  )
  on conflict (trader_id, direct_mentor_user_id, direct_student_user_id)
    where type = 'direct'
      and direct_mentor_user_id is not null
      and direct_student_user_id is not null
  do update set title = excluded.title
  returning id into created_conversation_id;

  insert into public.conversation_members (
    trader_id,
    conversation_id,
    user_id,
    member_role
  )
  values
    (resolved_trader_id, created_conversation_id, resolved_mentor_user_id, 'moderator'),
    (resolved_trader_id, created_conversation_id, target_student_id, 'member')
  on conflict (conversation_id, user_id) do nothing;

  return created_conversation_id;
end;
$$;

create or replace function public.create_group_conversation(
  target_title text,
  target_application_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_trader_id uuid := public.current_trader_id();
  creator_user_id uuid := auth.uid();
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
    'group',
    trim(target_title),
    creator_user_id
  )
  returning id into created_conversation_id;

  insert into public.conversation_members (
    trader_id,
    conversation_id,
    user_id,
    member_role
  )
  values (
    resolved_trader_id,
    created_conversation_id,
    creator_user_id,
    'owner'
  );

  insert into public.conversation_members (
    trader_id,
    conversation_id,
    user_id,
    member_role
  )
  select
    resolved_trader_id,
    created_conversation_id,
    application.student_user_id,
    'member'
  from public.student_applications application
  where application.id = any(target_application_ids)
    and application.trader_id = resolved_trader_id
    and application.status = 'verified'
  on conflict (conversation_id, user_id) do nothing;

  return created_conversation_id;
end;
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
  creator_user_id uuid := auth.uid();
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
    creator_user_id
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
    creator_user_id
  )
  returning id into created_conversation_id;

  insert into public.conversation_members (
    trader_id,
    conversation_id,
    user_id,
    member_role
  )
  values (
    resolved_trader_id,
    created_conversation_id,
    creator_user_id,
    'owner'
  );

  return created_group_id;
end;
$$;

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
    left join public.student_groups student_group
      on student_group.id = conversation.group_id
    where conversation.trader_id = new.trader_id
      and (
        conversation.type = 'announcement'
        or student_group.system_key = 'all_students'
      )
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

drop policy if exists "participants read conversations" on public.conversations;
create policy "participants read conversations"
on public.conversations for select
using (
  public.is_super_admin()
  or public.is_conversation_member(id)
);

drop policy if exists "participants read conversation membership" on public.conversation_members;
create policy "participants read conversation membership"
on public.conversation_members for select
using (
  public.is_super_admin()
  or public.is_conversation_member(conversation_id)
);

drop policy if exists "participants read messages" on public.messages;
create policy "participants read messages"
on public.messages for select
using (
  public.is_super_admin()
  or public.is_conversation_member(conversation_id)
);

drop policy if exists "participants read message attachments" on public.message_attachments;
create policy "participants read message attachments"
on public.message_attachments for select
using (
  exists (
    select 1
    from public.messages message
    where message.id = message_attachments.message_id
      and (
        public.is_super_admin()
        or public.is_conversation_member(message.conversation_id)
      )
  )
);

drop policy if exists "conversation participants read message files" on storage.objects;
create policy "conversation participants read message files"
on storage.objects for select
using (
  bucket_id = 'message-attachments'
  and (
    public.is_super_admin()
    or public.is_conversation_member(
      (storage.foldername(name))[2]::uuid
    )
  )
);

revoke all on function public.create_student_conversation(uuid, uuid) from public, anon;
grant execute on function public.create_student_conversation(uuid, uuid) to authenticated;
