create or replace function public.reconcile_auth_challenge_verification(
  target_request_event_id bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_event public.auth_challenge_events%rowtype;
  provider_confirmed_at timestamptz;
  verified_event_id bigint;
begin
  if not public.is_super_admin() then
    raise exception 'super admin access is required';
  end if;

  select * into request_event
  from public.auth_challenge_events
  where id = target_request_event_id
    and purpose = 'signup'
    and event_type in ('requested', 'resend_requested')
    and user_id is not null
  for update;

  if request_event.id is null then
    raise exception 'eligible signup request event was not found';
  end if;

  select email_confirmed_at into provider_confirmed_at
  from auth.users
  where id = request_event.user_id
    and encode(extensions.digest(lower(email), 'sha256'), 'hex') = request_event.email_hash;

  if provider_confirmed_at is null
    or provider_confirmed_at < request_event.created_at
    or provider_confirmed_at > request_event.created_at + interval '15 minutes' then
    raise exception 'provider confirmation does not match the challenge window';
  end if;

  if not exists (
    select 1
    from public.student_applications application
    join public.traders trader on trader.id = application.trader_id
    join public.portals portal on portal.id = application.portal_id
    where application.student_user_id = request_event.user_id
      and trader.environment = 'acceptance_test'
      and portal.slug = 'kaitrades'
  ) then
    raise exception 'request is not associated with the KaiTrades canary';
  end if;

  select id into verified_event_id
  from public.auth_challenge_events
  where user_id = request_event.user_id
    and purpose = request_event.purpose
    and event_type = 'verified'
    and created_at >= request_event.created_at
  order by created_at
  limit 1;

  if verified_event_id is not null then
    return verified_event_id;
  end if;

  insert into public.auth_challenge_events (
    user_id, purpose, event_type, email_hash, metadata, created_at
  ) values (
    request_event.user_id,
    request_event.purpose,
    'verified',
    request_event.email_hash,
    jsonb_build_object(
      'reconciled', true,
      'evidence_source', 'auth.users.email_confirmed_at',
      'request_event_id', request_event.id,
      'reconciled_by', auth.uid()
    ),
    provider_confirmed_at
  ) returning id into verified_event_id;

  insert into public.audit_logs (
    actor_user_id, actor_role, action, entity_type, entity_id, metadata
  ) values (
    auth.uid(), 'super_admin', 'auth_challenge_verification_reconciled',
    'auth_challenge_event', verified_event_id::text,
    jsonb_build_object(
      'request_event_id', request_event.id,
      'evidence_source', 'auth.users.email_confirmed_at',
      'provider_confirmed_at', provider_confirmed_at,
      'portal_slug', 'kaitrades'
    )
  );

  return verified_event_id;
end;
$$;

revoke all on function public.reconcile_auth_challenge_verification(bigint)
  from public, anon, service_role;
grant execute on function public.reconcile_auth_challenge_verification(bigint)
  to authenticated;

comment on function public.reconcile_auth_challenge_verification(bigint) is
  'Reconciles a missing KaiTrades signup completion only from matching auth.users confirmation evidence within the original challenge window.';
