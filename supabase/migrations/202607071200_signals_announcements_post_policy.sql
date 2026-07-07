-- MB-120: Signals, overview announcements, group post policies.

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'conversation_post_policy'
  ) then
    create type public.conversation_post_policy as enum ('mentors_only', 'everyone');
  end if;
end;
$$;

alter table public.conversations
  add column if not exists post_policy public.conversation_post_policy not null default 'mentors_only';

update public.conversations
set post_policy = 'mentors_only'
where post_policy is null;

create table if not exists public.daily_signals (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  signal_date date not null,
  title text not null check (char_length(title) <= 120),
  body text not null,
  message_id uuid not null,
  conversation_id uuid not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (trader_id, signal_date),
  foreign key (message_id, trader_id)
    references public.messages(id, trader_id) on delete cascade,
  foreign key (conversation_id, trader_id)
    references public.conversations(id, trader_id) on delete cascade
);

create index if not exists daily_signals_trader_date_idx
  on public.daily_signals (trader_id, signal_date desc);

alter table public.daily_signals enable row level security;

drop policy if exists "mentors read daily signals" on public.daily_signals;
create policy "mentors read daily signals"
on public.daily_signals for select
using (public.is_super_admin() or public.is_trader_member(trader_id));

drop policy if exists "verified students read daily signals" on public.daily_signals;
create policy "verified students read daily signals"
on public.daily_signals for select
using (public.has_verified_access(trader_id));

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
        conversation.post_policy = 'everyone'
        or public.is_trader_member(conversation.trader_id)
      )
  );
$$;

drop function if exists public.create_group_conversation(text, uuid[]);

create or replace function public.create_group_conversation(
  target_title text,
  target_application_ids uuid[],
  target_post_policy public.conversation_post_policy default 'mentors_only'
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
    post_policy,
    created_by
  )
  values (
    resolved_trader_id,
    'group',
    trim(target_title),
    target_post_policy,
    creator_user_id
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
    case
      when member.user_id = creator_user_id then 'owner'
      when member.role = 'owner' then 'moderator'
      else 'moderator'
    end
  from public.trader_members member
  where member.trader_id = resolved_trader_id
  on conflict (conversation_id, user_id) do nothing;

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
    post_policy,
    created_by
  )
  values (
    resolved_trader_id,
    'group',
    trim(target_name),
    created_group_id,
    'mentors_only',
    creator_user_id
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
    case
      when member.user_id = creator_user_id then 'owner'
      when member.role = 'owner' then 'moderator'
      else 'moderator'
    end
  from public.trader_members member
  where member.trader_id = resolved_trader_id
  on conflict (conversation_id, user_id) do nothing;

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
    where conversation.trader_id = new.trader_id
      and conversation.type <> 'direct'
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

-- Backfill: add missing mentors to existing group conversations.
insert into public.conversation_members (
  trader_id,
  conversation_id,
  user_id,
  member_role
)
select
  conversation.trader_id,
  conversation.id,
  member.user_id,
  case
    when member.user_id = conversation.created_by then 'owner'
    else 'moderator'
  end
from public.conversations conversation
join public.trader_members member
  on member.trader_id = conversation.trader_id
where conversation.type = 'group'
  and not exists (
    select 1
    from public.conversation_members existing
    where existing.conversation_id = conversation.id
      and existing.user_id = member.user_id
  )
on conflict (conversation_id, user_id) do nothing;

create or replace function public.set_conversation_post_policy(
  target_conversation_id uuid,
  target_post_policy public.conversation_post_policy
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_trader_id uuid;
  is_all_students boolean;
begin
  select
    conversation.trader_id,
    coalesce(student_group.system_key = 'all_students', false)
  into resolved_trader_id, is_all_students
  from public.conversations conversation
  left join public.student_groups student_group
    on student_group.id = conversation.group_id
  where conversation.id = target_conversation_id;

  if resolved_trader_id is null
    or not public.is_trader_member(resolved_trader_id) then
    raise exception 'forbidden';
  end if;

  if is_all_students then
    null;
  elsif exists (
    select 1
    from public.conversations conversation
    where conversation.id = target_conversation_id
      and conversation.type = 'group'
      and conversation.created_by = auth.uid()
  ) then
    null;
  else
    raise exception 'forbidden';
  end if;

  update public.conversations
  set post_policy = target_post_policy
  where id = target_conversation_id;
end;
$$;

create or replace function public.post_daily_signal(
  target_title text,
  target_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_trader_id uuid := public.current_trader_id();
  all_students_group_id uuid;
  all_students_conversation_id uuid;
  workspace_timezone text := 'UTC';
  signal_date_value date;
  normalized_title text := left(trim(target_title), 120);
  normalized_body text := trim(target_body);
  message_body text;
  created_message_id uuid;
  created_signal_id uuid;
  client_message_id uuid := gen_random_uuid();
begin
  if resolved_trader_id is null
    or not public.is_trader_member(resolved_trader_id) then
    raise exception 'forbidden';
  end if;

  if normalized_title is null
    or char_length(normalized_title) = 0
    or normalized_body is null
    or char_length(normalized_body) = 0 then
    raise exception 'title and body are required';
  end if;

  select coalesce(trader.timezone, 'UTC')
  into workspace_timezone
  from public.traders trader
  where trader.id = resolved_trader_id;

  signal_date_value := (now() at time zone workspace_timezone)::date;

  all_students_group_id := public.ensure_all_students_group(resolved_trader_id);

  select conversation.id
  into all_students_conversation_id
  from public.conversations conversation
  where conversation.group_id = all_students_group_id
    and conversation.type = 'group'
  limit 1;

  if all_students_conversation_id is null then
    raise exception 'all students conversation not found';
  end if;

  message_body := normalized_title || E'\n\n' || normalized_body;

  insert into public.messages (
    trader_id,
    conversation_id,
    sender_user_id,
    client_message_id,
    body
  )
  values (
    resolved_trader_id,
    all_students_conversation_id,
    auth.uid(),
    client_message_id,
    message_body
  )
  returning id into created_message_id;

  insert into public.daily_signals (
    trader_id,
    signal_date,
    title,
    body,
    message_id,
    conversation_id,
    created_by
  )
  values (
    resolved_trader_id,
    signal_date_value,
    normalized_title,
    normalized_body,
    created_message_id,
    all_students_conversation_id,
    auth.uid()
  )
  on conflict (trader_id, signal_date)
  do update set
    title = excluded.title,
    body = excluded.body,
    message_id = excluded.message_id,
    conversation_id = excluded.conversation_id,
    created_by = excluded.created_by,
    created_at = now()
  returning id into created_signal_id;

  return created_signal_id;
end;
$$;

revoke all on function public.create_group_conversation(
  text,
  uuid[],
  public.conversation_post_policy
) from public, anon;
grant execute on function public.create_group_conversation(
  text,
  uuid[],
  public.conversation_post_policy
) to authenticated;

revoke all on function public.set_conversation_post_policy(
  uuid,
  public.conversation_post_policy
) from public, anon;
grant execute on function public.set_conversation_post_policy(
  uuid,
  public.conversation_post_policy
) to authenticated;

revoke all on function public.post_daily_signal(text, text) from public, anon;
grant execute on function public.post_daily_signal(text, text) to authenticated;
