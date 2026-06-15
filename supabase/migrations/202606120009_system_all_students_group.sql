alter table public.student_groups
  add column system_key text;

alter table public.student_groups
  add constraint student_groups_system_key_valid
    check (system_key is null or system_key = 'all_students');

create unique index student_groups_trader_system_key_unique
  on public.student_groups (trader_id, system_key)
  where system_key is not null;

update public.student_groups
set name = 'All Students (Custom ' || left(id::text, 8) || ')'
where system_key is null
  and lower(trim(name)) = 'all students';

create or replace function public.ensure_all_students_group(
  target_trader_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_owner_id uuid;
  resolved_group_id uuid;
  resolved_conversation_id uuid;
begin
  select owner_user_id
  into resolved_owner_id
  from public.traders
  where id = target_trader_id;

  if resolved_owner_id is null then
    raise exception 'workspace not found';
  end if;

  insert into public.student_groups (
    trader_id,
    name,
    description,
    color,
    system_key,
    created_by
  )
  values (
    target_trader_id,
    'All Students',
    'Every verified student in this workspace. Membership is managed automatically.',
    '#111315',
    'all_students',
    resolved_owner_id
  )
  on conflict (trader_id, system_key)
    where system_key is not null
  do update set
    name = excluded.name,
    description = excluded.description,
    is_active = true
  returning id into resolved_group_id;

  insert into public.conversations (
    trader_id,
    type,
    title,
    group_id,
    created_by
  )
  values (
    target_trader_id,
    'group',
    'All Students',
    resolved_group_id,
    resolved_owner_id
  )
  on conflict (group_id)
    where type = 'group'
  do update set
    title = excluded.title,
    is_archived = false
  returning id into resolved_conversation_id;

  insert into public.student_group_members (
    trader_id,
    group_id,
    application_id,
    added_by
  )
  select
    target_trader_id,
    resolved_group_id,
    application.id,
    resolved_owner_id
  from public.student_applications application
  where application.trader_id = target_trader_id
    and application.status = 'verified'
  on conflict (group_id, application_id) do nothing;

  insert into public.conversation_members (
    trader_id,
    conversation_id,
    user_id,
    member_role
  )
  select
    target_trader_id,
    resolved_conversation_id,
    member.user_id,
    case when member.role = 'owner' then 'owner' else 'moderator' end
  from public.trader_members member
  where member.trader_id = target_trader_id
  union
  select
    target_trader_id,
    resolved_conversation_id,
    application.student_user_id,
    'member'
  from public.student_applications application
  where application.trader_id = target_trader_id
    and application.status = 'verified'
  on conflict (conversation_id, user_id) do nothing;

  return resolved_group_id;
end;
$$;

do $$
declare
  workspace record;
begin
  for workspace in select id from public.traders
  loop
    perform public.ensure_all_students_group(workspace.id);
  end loop;
end;
$$;

create or replace function public.create_all_students_group_for_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.ensure_all_students_group(new.id);
  return new;
end;
$$;

create trigger traders_create_all_students_group
  after insert on public.traders
  for each row execute function public.create_all_students_group_for_workspace();

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
  resolved_system_key text;
  group_conversation_id uuid;
  invalid_count integer;
begin
  select trader_id, system_key
  into resolved_trader_id, resolved_system_key
  from public.student_groups
  where id = target_group_id
  for update;

  if resolved_trader_id is null
    or (
      not public.is_super_admin()
      and not public.is_trader_member(resolved_trader_id)
    ) then
    raise exception 'forbidden';
  end if;

  if resolved_system_key is not null then
    raise exception 'system group membership is managed automatically';
  end if;

  if cardinality(coalesce(target_application_ids, array[]::uuid[]))
    <> (
      select count(distinct application_id)
      from unnest(
        coalesce(target_application_ids, array[]::uuid[])
      ) requested(application_id)
    ) then
    raise exception 'duplicate student selection';
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

create or replace function public.create_student_group_with_members(
  target_name text,
  target_description text,
  target_color text,
  target_application_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_group_id uuid;
begin
  created_group_id := public.create_student_group(
    target_name,
    target_description,
    target_color
  );

  perform public.set_student_group_members(
    created_group_id,
    coalesce(target_application_ids, array[]::uuid[])
  );

  return created_group_id;
end;
$$;

create or replace function public.sync_verified_announcement_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  all_students_group_id uuid;
  all_students_conversation_id uuid;
begin
  if new.status = 'verified'
    and old.status is distinct from new.status then
    all_students_group_id := public.ensure_all_students_group(new.trader_id);

    insert into public.student_group_members (
      trader_id,
      group_id,
      application_id,
      added_by
    )
    values (
      new.trader_id,
      all_students_group_id,
      new.id,
      coalesce(new.reviewed_by, new.student_user_id)
    )
    on conflict (group_id, application_id) do nothing;

    select id
    into all_students_conversation_id
    from public.conversations
    where group_id = all_students_group_id
      and type = 'group';

    insert into public.conversation_members (
      trader_id,
      conversation_id,
      user_id,
      member_role
    )
    values (
      new.trader_id,
      all_students_conversation_id,
      new.student_user_id,
      'member'
    )
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
    delete from public.student_group_members
    where application_id = new.id
      and trader_id = new.trader_id;

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

revoke all on function public.ensure_all_students_group(uuid)
  from public, anon, authenticated;
revoke all on function public.create_student_group_with_members(
  text,
  text,
  text,
  uuid[]
) from public, anon;
grant execute on function public.create_student_group_with_members(
  text,
  text,
  text,
  uuid[]
) to authenticated;
