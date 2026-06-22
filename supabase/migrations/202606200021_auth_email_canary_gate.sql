insert into public.platform_settings (key, value, is_public)
values (
  'auth_email_delivery_policy',
  jsonb_build_object(
    'mode', 'canary_only',
    'canary_environment', 'acceptance_test',
    'reason', 'hosted_template_content_unverified',
    'changed_at', now()
  ),
  false
)
on conflict (key) do update
set value = excluded.value,
    is_public = false,
    updated_at = now();

insert into public.audit_logs (
  action,
  entity_type,
  entity_id,
  metadata
)
select
  'hosted_auth_policy_verification_failed',
  'platform_setting',
  'auth_email_delivery_policy',
  jsonb_build_object(
    'reason', 'received_authentication_link_after_cli_only_verification',
    'previous_verifier_retracted', true,
    'production_delivery_blocked', true
  )
where not exists (
  select 1
  from public.audit_logs
  where action = 'hosted_auth_policy_verification_failed'
    and entity_type = 'platform_setting'
    and entity_id = 'auth_email_delivery_policy'
);

comment on column public.platform_settings.value is
  'Platform configuration JSON. auth_email_delivery_policy gates production sends until an acceptance-test canary is approved.';
