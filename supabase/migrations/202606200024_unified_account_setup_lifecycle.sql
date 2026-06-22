alter table public.auth_challenge_events
  drop constraint auth_challenge_events_purpose_check;

alter table public.auth_challenge_events
  add constraint auth_challenge_events_purpose_check
  check (purpose in ('invitation', 'signup', 'recovery', 'email_change', 'account_setup'));

create table public.account_setup_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid references public.profiles(id) on delete cascade,
  invitation_id uuid references public.academy_invitations(id) on delete restrict,
  state text not null check (state in (
    'new_identity', 'unverified_identity', 'active_invitation', 'expired_invitation',
    'verified_awaiting_password', 'completed_account', 'role_conflict',
    'email_correction', 'inconsistent_state', 'verified', 'completed', 'expired'
  )),
  purpose text not null default 'account_setup' check (purpose = 'account_setup'),
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  verified_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (invitation_id is null or user_id is not null),
  check (completed_at is null or verified_at is not null)
);

create table public.academy_owner_email_corrections (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  invitation_id uuid references public.academy_invitations(id) on delete restrict,
  old_email text not null check (old_email = lower(old_email)),
  new_email text not null check (new_email = lower(new_email) and old_email <> new_email),
  status text not null default 'pending_verification' check (status in ('pending_verification', 'completed', 'cancelled')),
  reason text not null check (length(trim(reason)) >= 10),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  verified_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index academy_owner_email_corrections_one_pending_idx
  on public.academy_owner_email_corrections (trader_id)
  where status = 'pending_verification';

create index account_setup_sessions_email_created_idx
  on public.account_setup_sessions (email_hash, created_at desc);
create index account_setup_sessions_user_state_idx
  on public.account_setup_sessions (user_id, state, created_at desc)
  where user_id is not null;

create unique index academy_invitations_one_pending_user_idx
  on public.academy_invitations (invited_user_id)
  where status = 'pending' and invited_user_id is not null;
create unique index academy_invitations_one_pending_trader_idx
  on public.academy_invitations (trader_id)
  where status = 'pending' and trader_id is not null;
create unique index trader_members_one_owner_idx
  on public.trader_members (trader_id)
  where role = 'owner';

create trigger set_account_setup_sessions_updated_at
  before update on public.account_setup_sessions
  for each row execute function public.set_updated_at();
create trigger set_academy_owner_email_corrections_updated_at
  before update on public.academy_owner_email_corrections
  for each row execute function public.set_updated_at();

alter table public.account_setup_sessions enable row level security;
alter table public.academy_owner_email_corrections enable row level security;
revoke all on public.account_setup_sessions from public, anon, authenticated;
grant all on public.account_setup_sessions to service_role;
revoke all on public.academy_owner_email_corrections from public, anon, authenticated;
grant select on public.academy_owner_email_corrections to authenticated;
grant all on public.academy_owner_email_corrections to service_role;
create policy "platform admins and corrected owners read email corrections"
on public.academy_owner_email_corrections for select
using (public.is_super_admin() or user_id = auth.uid());

create or replace function public.begin_academy_owner_email_correction(
  target_trader_id uuid,
  target_new_email text,
  target_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  trader public.traders%rowtype;
  profile public.profiles%rowtype;
  invitation public.academy_invitations%rowtype;
  correction_id uuid;
  normalized_email text := lower(trim(target_new_email));
begin
  if not public.is_super_admin() then raise exception 'super admin access is required'; end if;
  if length(trim(target_reason)) < 10 then raise exception 'correction reason is required'; end if;
  select * into trader from public.traders where id = target_trader_id for update;
  if trader.id is null then raise exception 'academy not found'; end if;
  select * into profile from public.profiles where id = trader.owner_user_id for update;
  if profile.id is null or profile.role <> 'trader' then raise exception 'academy owner profile is invalid'; end if;
  if exists (select 1 from public.profiles where lower(email) = normalized_email and id <> profile.id) then
    raise exception 'corrected email is already assigned';
  end if;
  if not exists (
    select 1 from public.trader_members
    where trader_id = trader.id and user_id = profile.id and role = 'owner'
  ) then raise exception 'academy owner membership is invalid'; end if;
  if not exists (
    select 1 from auth.users
    where id = profile.id and lower(email) = normalized_email and email_confirmed_at is null
  ) then raise exception 'auth identity must be moved to the unverified corrected email first'; end if;

  select * into invitation
  from public.academy_invitations
  where trader_id = trader.id and invited_user_id = profile.id
  order by created_at desc limit 1 for update;

  insert into public.academy_owner_email_corrections (
    trader_id, user_id, invitation_id, old_email, new_email, reason, requested_by
  ) values (
    trader.id, profile.id, invitation.id, lower(profile.email), normalized_email,
    trim(target_reason), auth.uid()
  ) returning id into correction_id;

  update public.profiles set email = normalized_email where id = profile.id;
  if invitation.id is not null then
    update public.academy_invitations set email = normalized_email where id = invitation.id;
  end if;
  delete from auth.sessions where user_id = profile.id;

  insert into public.audit_logs (
    trader_id, actor_user_id, actor_role, action, entity_type, entity_id, old_data, new_data, metadata
  ) values (
    trader.id, auth.uid(), 'super_admin', 'academy_owner_email_correction_started',
    'academy_owner_email_correction', correction_id::text,
    jsonb_build_object('email_hash', encode(extensions.digest(lower(profile.email), 'sha256'), 'hex')),
    jsonb_build_object('email_hash', encode(extensions.digest(normalized_email, 'sha256'), 'hex')),
    jsonb_build_object('reason', trim(target_reason), 'sessions_revoked', true)
  );
  return correction_id;
end;
$$;

revoke all on function public.begin_academy_owner_email_correction(uuid, text, text)
  from public, anon, service_role;
grant execute on function public.begin_academy_owner_email_correction(uuid, text, text)
  to authenticated;

create or replace function public.complete_account_setup(
  target_setup_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  setup_session public.account_setup_sessions%rowtype;
  invitation public.academy_invitations%rowtype;
  resolved_role public.app_role;
  password_ready boolean;
  destination text;
begin
  select * into setup_session
  from public.account_setup_sessions
  where token_hash = encode(extensions.digest(target_setup_token, 'sha256'), 'hex')
    and user_id = auth.uid()
  for update;

  if setup_session.id is null
    or setup_session.verified_at is null
    or setup_session.expires_at <= now()
    or setup_session.completed_at is not null then
    raise exception 'verified account setup session not found';
  end if;

  select role into resolved_role from public.profiles where id = auth.uid();
  select email_confirmed_at is not null
      and coalesce(encrypted_password, '') <> ''
    into password_ready
  from auth.users
  where id = auth.uid();
  if password_ready is not true then
    raise exception 'verified email and password are required';
  end if;

  if setup_session.invitation_id is not null then
    select * into invitation
    from public.academy_invitations
    where id = setup_session.invitation_id
    for update;

    if invitation.id is null
      or invitation.invited_user_id <> auth.uid()
      or invitation.status <> 'pending'
      or invitation.expires_at <= now()
      or resolved_role <> 'trader'
      or not exists (
        select 1
        from public.traders trader
        join public.trader_members member
          on member.trader_id = trader.id
          and member.user_id = auth.uid()
          and member.role = 'owner'
        where trader.id = invitation.trader_id
          and trader.owner_user_id = auth.uid()
      ) then
      raise exception 'active invitation ownership validation failed';
    end if;

    if not exists (
      select 1 from auth.users
      where id = auth.uid() and lower(email) = lower(invitation.email)
    ) then
      raise exception 'invitation email validation failed';
    end if;

    update public.academy_invitations
    set status = 'accepted', accepted_at = now()
    where id = invitation.id;
    destination := '/dashboard';
  else
    destination := case resolved_role
      when 'super_admin' then '/admin'
      when 'trader' then '/dashboard'
      when 'student' then '/student'
    end;
  end if;

  update public.account_setup_sessions
  set state = 'completed', completed_at = now()
  where id = setup_session.id;

  update public.academy_owner_email_corrections
  set status = 'completed', verified_at = coalesce(verified_at, setup_session.verified_at), completed_at = now()
  where user_id = auth.uid() and status = 'pending_verification';

  insert into public.audit_logs (
    trader_id, actor_user_id, actor_role, action, entity_type, entity_id, metadata
  ) values (
    invitation.trader_id,
    auth.uid(), resolved_role, 'account_setup_completed',
    'account_setup_session', setup_session.id::text,
    jsonb_build_object(
      'invitation_id', setup_session.invitation_id,
      'destination', destination
    )
  );

  return jsonb_build_object('status', 'completed', 'destination', destination);
end;
$$;

revoke all on function public.complete_account_setup(text) from public, anon, service_role;
grant execute on function public.complete_account_setup(text) to authenticated;

create or replace function public.renew_academy_invitation(
  target_invitation_id uuid,
  target_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.academy_invitations%rowtype;
  renewed_at timestamptz := now();
begin
  if not public.is_super_admin() then
    raise exception 'super admin access is required';
  end if;
  if length(trim(target_reason)) < 10 then
    raise exception 'renewal reason is required';
  end if;

  select * into invitation
  from public.academy_invitations
  where id = target_invitation_id
  for update;
  if invitation.id is null or invitation.status in ('accepted', 'revoked') then
    raise exception 'invitation cannot be renewed';
  end if;
  if invitation.invited_user_id is null or invitation.trader_id is null
    or not exists (
      select 1
      from public.traders trader
      join public.trader_members member
        on member.trader_id = trader.id
        and member.user_id = invitation.invited_user_id
        and member.role = 'owner'
      where trader.id = invitation.trader_id
        and trader.owner_user_id = invitation.invited_user_id
    ) then
    raise exception 'invitation ownership validation failed';
  end if;

  update public.academy_invitations
  set status = 'pending', expires_at = renewed_at + interval '7 days', accepted_at = null
  where id = invitation.id;

  insert into public.audit_logs (
    trader_id, actor_user_id, actor_role, action, entity_type, entity_id, metadata
  ) values (
    invitation.trader_id, auth.uid(), 'super_admin', 'academy_invitation_renewed',
    'academy_invitation', invitation.id::text,
    jsonb_build_object(
      'previous_status', invitation.status,
      'previous_expires_at', invitation.expires_at,
      'new_expires_at', renewed_at + interval '7 days',
      'reason', trim(target_reason)
    )
  );

  return jsonb_build_object(
    'invitation_id', invitation.id,
    'status', 'pending',
    'expires_at', renewed_at + interval '7 days'
  );
end;
$$;

revoke all on function public.renew_academy_invitation(uuid, text)
  from public, anon, service_role;
grant execute on function public.renew_academy_invitation(uuid, text)
  to authenticated;

comment on table public.account_setup_sessions is
  'Private, short-lived account continuation state. Opaque token and email values are stored only as SHA-256 hashes; OTPs are never stored.';
comment on table public.academy_owner_email_corrections is
  'Super-admin-authorized owner email corrections completed only after verification of the corrected Auth identity.';
comment on function public.complete_account_setup(text) is
  'Authenticated, replay-safe account completion and invitation acceptance against immutable identity and tenant ownership.';
comment on function public.renew_academy_invitation(uuid, text) is
  'Super-admin-only invitation renewal that preserves the existing identity, tenant, portal, package, membership, and assignment.';
