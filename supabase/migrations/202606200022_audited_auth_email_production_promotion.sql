alter table public.auth_challenge_events
  drop constraint auth_challenge_events_event_type_check;

alter table public.auth_challenge_events
  add constraint auth_challenge_events_event_type_check
  check (event_type in (
    'requested', 'resend_requested', 'resend_authorized', 'rate_limited',
    'suppressed', 'provider_error', 'verified'
  ));

create or replace function public.promote_auth_email_delivery(
  target_canary_event_id bigint,
  target_hosted_policy jsonb,
  target_received_code_only boolean,
  target_code_accepted boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_policy public.platform_settings%rowtype;
  canary_event public.auth_challenge_events%rowtype;
  hosted_verified_at timestamptz;
  required_template text;
  promoted_at timestamptz := now();
begin
  if not public.is_super_admin() then
    raise exception 'super admin access is required';
  end if;

  perform pg_advisory_xact_lock(hashtext('auth_email_delivery_policy'));

  select * into current_policy
  from public.platform_settings
  where key = 'auth_email_delivery_policy'
  for update;

  if current_policy.key is null then
    raise exception 'authentication email delivery policy is missing';
  end if;

  if current_policy.value ->> 'mode' = 'production_enabled' then
    return jsonb_build_object(
      'mode', 'production_enabled',
      'already_promoted', true,
      'promoted_at', current_policy.value ->> 'promoted_at'
    );
  end if;

  if target_hosted_policy ->> 'verificationMethod' <> 'management_api_content_inspection' then
    raise exception 'hosted template content inspection evidence is required';
  end if;

  begin
    hosted_verified_at := (target_hosted_policy ->> 'verifiedAt')::timestamptz;
  exception when others then
    raise exception 'hosted verification timestamp is invalid';
  end;

  if hosted_verified_at < now() - interval '10 minutes'
    or hosted_verified_at > now() + interval '1 minute' then
    raise exception 'hosted verification evidence is stale';
  end if;

  if (target_hosted_policy ->> 'otpLength')::integer <> 6
    or (target_hosted_policy ->> 'otpExpirySeconds')::integer <> 900
    or (target_hosted_policy ->> 'secureEmailChange')::boolean is not true then
    raise exception 'hosted OTP policy does not meet production requirements';
  end if;

  foreach required_template in array array[
    'confirmation', 'invite', 'recovery', 'magic_link', 'email_change', 'reauthentication'
  ] loop
    if coalesce((target_hosted_policy #>> array['templates', required_template, 'present'])::boolean, false) is not true
      or coalesce((target_hosted_policy #>> array['templates', required_template, 'hasOtpToken'])::boolean, false) is not true
      or coalesce((target_hosted_policy #>> array['templates', required_template, 'hasAuthenticationLink'])::boolean, true) is not false then
      raise exception 'hosted template % does not meet production requirements', required_template;
    end if;
  end loop;

  if target_received_code_only is not true or target_code_accepted is not true then
    raise exception 'received-email and successful code-entry attestations are required';
  end if;

  select * into canary_event
  from public.auth_challenge_events
  where id = target_canary_event_id
    and purpose = 'signup'
    and event_type = 'verified'
    and user_id is not null;

  if canary_event.id is null or not exists (
    select 1
    from public.student_applications application
    join public.traders trader on trader.id = application.trader_id
    join public.portals portal on portal.id = application.portal_id
    where application.student_user_id = canary_event.user_id
      and trader.environment = 'acceptance_test'
      and portal.slug = 'kaitrades'
  ) then
    raise exception 'verified KaiTrades canary evidence was not found';
  end if;

  insert into public.audit_logs (
    actor_user_id, actor_role, action, entity_type, entity_id, metadata
  ) values
  (
    auth.uid(), 'super_admin', 'hosted_auth_policy_verified', 'platform_setting',
    'auth_email_delivery_policy',
    jsonb_build_object(
      'verification_method', 'management_api_content_inspection',
      'verified_at', hosted_verified_at,
      'otp_length', 6,
      'otp_expiry_seconds', 900,
      'template_count', 6
    )
  ),
  (
    auth.uid(), 'super_admin', 'auth_email_canary_accepted', 'auth_challenge_event',
    canary_event.id::text,
    jsonb_build_object(
      'canary_environment', 'acceptance_test',
      'portal_slug', 'kaitrades',
      'received_code_only', true,
      'code_accepted', true
    )
  );

  update public.platform_settings
  set value = jsonb_build_object(
        'mode', 'production_enabled',
        'canary_environment', 'acceptance_test',
        'reason', 'hosted_policy_and_kaitrades_canary_verified',
        'hosted_verified_at', hosted_verified_at,
        'canary_event_id', canary_event.id,
        'promoted_by', auth.uid(),
        'promoted_at', promoted_at
      ),
      is_public = false,
      updated_at = promoted_at
  where key = 'auth_email_delivery_policy';

  insert into public.audit_logs (
    actor_user_id, actor_role, action, entity_type, entity_id, old_data, new_data, metadata
  ) values (
    auth.uid(), 'super_admin', 'auth_email_delivery_promoted', 'platform_setting',
    'auth_email_delivery_policy', current_policy.value,
    (select value from public.platform_settings where key = 'auth_email_delivery_policy'),
    jsonb_build_object('canary_event_id', canary_event.id)
  );

  return jsonb_build_object(
    'mode', 'production_enabled',
    'already_promoted', false,
    'promoted_at', promoted_at,
    'canary_event_id', canary_event.id
  );
end;
$$;

revoke all on function public.promote_auth_email_delivery(bigint, jsonb, boolean, boolean)
  from public, anon, service_role;
grant execute on function public.promote_auth_email_delivery(bigint, jsonb, boolean, boolean)
  to authenticated;

create or replace function public.authorize_academy_invitation_resend(
  target_invitation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.academy_invitations%rowtype;
  resolved_email_hash text;
  authorization_event_id bigint;
  retry_after_seconds integer;
begin
  if not public.is_super_admin() then
    raise exception 'super admin access is required';
  end if;

  if coalesce((
    select value ->> 'mode'
    from public.platform_settings
    where key = 'auth_email_delivery_policy'
  ), 'canary_only') <> 'production_enabled' then
    raise exception 'production authentication email delivery is not enabled';
  end if;

  select * into invitation
  from public.academy_invitations
  where id = target_invitation_id
  for update;

  if invitation.id is null
    or invitation.status <> 'pending'
    or invitation.expires_at <= now() then
    raise exception 'active pending invitation was not found';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    join public.trader_members member
      on member.user_id = profile.id
      and member.trader_id = invitation.trader_id
      and member.role = 'owner'
    join public.traders trader
      on trader.id = invitation.trader_id
      and trader.owner_user_id = profile.id
    where profile.id = invitation.invited_user_id
      and profile.role = 'trader'
      and lower(profile.email) = lower(invitation.email)
  ) then
    raise exception 'invitation identity and academy ownership do not match';
  end if;

  resolved_email_hash := encode(extensions.digest(lower(invitation.email), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtext(resolved_email_hash || ':invitation'));

  select greatest(
    1,
    60 - floor(extract(epoch from (now() - created_at)))::integer
  ) into retry_after_seconds
  from public.auth_challenge_events
  where auth_challenge_events.email_hash = resolved_email_hash
    and purpose = 'invitation'
    and event_type in ('requested', 'resend_requested', 'resend_authorized')
    and created_at >= now() - interval '60 seconds'
  order by created_at desc
  limit 1;

  if retry_after_seconds is not null then
    raise exception 'invitation resend cooldown is active for % seconds', retry_after_seconds;
  end if;

  insert into public.auth_challenge_events (
    user_id, purpose, event_type, email_hash, metadata
  ) values (
    invitation.invited_user_id,
    'invitation',
    'resend_authorized',
    resolved_email_hash,
    jsonb_build_object(
      'invitation_id', invitation.id,
      'authorized_by', auth.uid(),
      'policy_mode', 'production_enabled'
    )
  ) returning id into authorization_event_id;

  insert into public.audit_logs (
    trader_id, actor_user_id, actor_role, action, entity_type, entity_id, metadata
  ) values (
    invitation.trader_id, auth.uid(), 'super_admin',
    'academy_invitation_resend_authorized', 'academy_invitation', invitation.id::text,
    jsonb_build_object('authorization_event_id', authorization_event_id)
  );

  return jsonb_build_object(
    'authorization_event_id', authorization_event_id,
    'invitation_id', invitation.id,
    'invited_user_id', invitation.invited_user_id,
    'trader_id', invitation.trader_id
  );
end;
$$;

revoke all on function public.authorize_academy_invitation_resend(uuid)
  from public, anon, service_role;
grant execute on function public.authorize_academy_invitation_resend(uuid)
  to authenticated;

comment on function public.promote_auth_email_delivery(bigint, jsonb, boolean, boolean) is
  'Super-admin-only transactional promotion requiring fresh hosted-content verification and a verified KaiTrades canary.';
comment on function public.authorize_academy_invitation_resend(uuid) is
  'Super-admin-only production resend authorization enforcing policy, identity ownership, and cooldown.';
