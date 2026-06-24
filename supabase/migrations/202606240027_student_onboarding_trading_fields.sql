-- Add three new experience fields to student_applications.
-- All columns are nullable; no backfill is required.
alter table public.student_applications
  add column trading_level text
    check (trading_level in ('beginner', 'intermediate', 'advanced', 'funded'))
    default null,
  add column years_trading text
    check (years_trading in ('less_than_1', '1_to_3', '3_to_5', '5_plus'))
    default null,
  add column trading_challenge text
    check (char_length(trading_challenge) <= 500)
    default null;

-- Drop and recreate get_student_applications_page with the new trading_level column.
-- Return type changed (new column), so create or replace is not allowed.
drop function if exists public.get_student_applications_page(
  uuid,
  public.verification_status[],
  text,
  uuid,
  public.verification_method,
  integer,
  integer
);

create function public.get_student_applications_page(
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
    profile.full_name,
    profile.email,
    profile.phone,
    broker.id,
    broker.name,
    connection.verification_method,
    application.trading_level,
    count(*) over()
  from public.student_applications application
  join public.profiles profile
    on profile.id = application.student_user_id
  join public.trader_broker_accounts connection
    on connection.id = application.trader_broker_account_id
    and connection.trader_id = application.trader_id
  join public.brokers broker
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
      or concat_ws(
        ' ',
        profile.full_name,
        profile.email,
        profile.phone,
        application.phone_number,
        application.trading_account_number,
        application.platform_account_number
      ) ilike '%' || trim(target_search) || '%'
    )
  order by application.submitted_at desc, application.id desc
  limit least(greatest(target_limit, 1), 100)
  offset greatest(target_offset, 0);
$$;
