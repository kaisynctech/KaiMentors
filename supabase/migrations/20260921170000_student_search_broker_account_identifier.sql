-- Mentor student search must match XM / broker IDs on every workspace, not
-- only names, emails, phones, and the older account-number columns.
create or replace function public.get_student_applications_page(
  target_trader_id uuid,
  target_statuses public.verification_status[] default null,
  target_search text default null,
  target_broker_id uuid default null,
  target_verification_method public.verification_method default null,
  target_limit integer default 25,
  target_offset integer default 0
)
returns table (
  application_id uuid,
  application_status public.verification_status,
  status_reason text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  review_version integer,
  phone_number text,
  trading_account_number text,
  platform_account_number text,
  screenshot_path text,
  student_name text,
  student_email text,
  profile_phone text,
  broker_id uuid,
  broker_name text,
  verification_method public.verification_method,
  trading_level text,
  broker_verified boolean,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    application.id,
    application.status,
    application.status_reason,
    application.submitted_at,
    application.reviewed_at,
    application.review_version,
    application.phone_number,
    application.trading_account_number,
    application.platform_account_number,
    application.screenshot_path,
    coalesce(application.full_name, profile.full_name),
    profile.email,
    profile.phone,
    broker.id,
    broker.name,
    connection.verification_method,
    application.trading_level,
    application.broker_verified,
    count(*) over()
  from public.student_applications application
  join public.profiles profile
    on profile.id = application.student_user_id
  left join public.trader_broker_accounts connection
    on connection.id = application.trader_broker_account_id
    and connection.trader_id = application.trader_id
  left join public.brokers broker
    on broker.id = connection.broker_id
  where application.trader_id = target_trader_id
    and (
      public.is_super_admin()
      or public.is_trader_member(target_trader_id)
    )
    and (
      target_statuses is null
      or application.status = any(target_statuses)
    )
    and (
      target_broker_id is null
      or broker.id = target_broker_id
    )
    and (
      target_verification_method is null
      or connection.verification_method = target_verification_method
    )
    and (
      nullif(trim(target_search), '') is null
      or position(
        lower(trim(target_search))
        in lower(concat_ws(
          ' ',
          application.full_name,
          profile.full_name,
          profile.email,
          profile.phone,
          application.phone_number,
          application.trading_account_number,
          application.platform_account_number,
          application.broker_account_identifier
        ))
      ) > 0
    )
  order by application.submitted_at desc, application.id desc
  limit least(greatest(target_limit, 1), 100)
  offset greatest(target_offset, 0);
$$;

grant execute on function public.get_student_applications_page(
  uuid, public.verification_status[], text, uuid, public.verification_method, integer, integer
) to authenticated;
