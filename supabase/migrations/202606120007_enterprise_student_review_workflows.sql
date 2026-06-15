alter table public.student_applications
  add column review_version integer not null default 0;

alter table public.student_applications
  add constraint student_applications_review_version_nonnegative
    check (review_version >= 0);

create index student_applications_trader_status_submitted_idx
  on public.student_applications (trader_id, status, submitted_at desc, id);

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

revoke all on function public.get_student_applications_page(
  uuid,
  public.verification_status[],
  text,
  uuid,
  public.verification_method,
  integer,
  integer
) from public, anon;
grant execute on function public.get_student_applications_page(
  uuid,
  public.verification_status[],
  text,
  uuid,
  public.verification_method,
  integer,
  integer
) to authenticated;

create or replace function public.review_student_applications(
  target_application_ids uuid[],
  target_expected_versions integer[],
  target_status public.verification_status,
  target_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_count integer;
  eligible_count integer;
  application_trader_id uuid;
  normalized_reason text := nullif(trim(target_reason), '');
  batch_id uuid := gen_random_uuid();
begin
  requested_count := cardinality(target_application_ids);

  if requested_count is null
    or requested_count < 1
    or requested_count > 100
    or requested_count <> cardinality(target_expected_versions) then
    raise exception 'invalid review batch';
  end if;

  if requested_count <> (
    select count(distinct application_id)
    from unnest(target_application_ids) application_id
  ) then
    raise exception 'duplicate applications are not allowed';
  end if;

  if target_status not in (
    'verified'::public.verification_status,
    'rejected'::public.verification_status,
    'needs_more_information'::public.verification_status
  ) then
    raise exception 'unsupported review status';
  end if;

  if target_status in (
    'rejected'::public.verification_status,
    'needs_more_information'::public.verification_status
  ) and (normalized_reason is null or char_length(normalized_reason) < 3) then
    raise exception 'a review reason is required';
  end if;

  perform 1
  from public.student_applications application
  where application.id = any(target_application_ids)
  for update;

  select
    count(*),
    min(application.trader_id)
  into eligible_count, application_trader_id
  from public.student_applications application
  join unnest(
    target_application_ids,
    target_expected_versions
  ) expected(application_id, review_version)
    on expected.application_id = application.id
    and expected.review_version = application.review_version
  where application.status in (
    'pending'::public.verification_status,
    'manual_review'::public.verification_status,
    'needs_more_information'::public.verification_status
  )
    and application.status <> target_status;

  if eligible_count <> requested_count then
    raise exception 'one or more applications changed; refresh and try again';
  end if;

  if (
    select count(distinct application.trader_id)
    from public.student_applications application
    where application.id = any(target_application_ids)
  ) <> 1 then
    raise exception 'applications must belong to one workspace';
  end if;

  if not public.is_super_admin()
    and not public.is_trader_member(application_trader_id) then
    raise exception 'forbidden';
  end if;

  update public.student_applications application
  set
    status = target_status,
    status_reason = normalized_reason,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    verified_at = case
      when target_status = 'verified' then now()
      else null
    end,
    review_version = application.review_version + 1
  where application.id = any(target_application_ids)
    and application.trader_id = application_trader_id;

  update public.verification_attempts attempt
  set
    status = target_status,
    response_code = case
      when target_status = 'verified' then 'MENTOR_APPROVED'
      when target_status = 'rejected' then 'MENTOR_REJECTED'
      else 'MORE_INFORMATION_REQUESTED'
    end,
    response_summary = jsonb_build_object(
      'reviewedBy', auth.uid(),
      'reason', normalized_reason,
      'batchId', batch_id
    ),
    completed_at = case
      when target_status = 'needs_more_information' then null
      else now()
    end
  where attempt.id in (
    select distinct on (latest.application_id) latest.id
    from public.verification_attempts latest
    where latest.application_id = any(target_application_ids)
      and latest.trader_id = application_trader_id
    order by latest.application_id, latest.created_at desc
  );

  insert into public.audit_logs (
    trader_id,
    actor_user_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    application_trader_id,
    auth.uid(),
    public.current_app_role(),
    'bulk_review',
    'student_applications',
    batch_id::text,
    jsonb_build_object(
      'applicationIds', target_application_ids,
      'status', target_status,
      'reason', normalized_reason,
      'count', requested_count
    )
  );

  return jsonb_build_object(
    'batchId', batch_id,
    'updatedCount', requested_count,
    'status', target_status
  );
end;
$$;

revoke all on function public.review_student_applications(
  uuid[],
  integer[],
  public.verification_status,
  text
) from public, anon;
grant execute on function public.review_student_applications(
  uuid[],
  integer[],
  public.verification_status,
  text
) to authenticated;

create or replace function public.review_student_application(
  target_application_id uuid,
  target_status public.verification_status,
  target_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_version integer;
begin
  select review_version
  into current_version
  from public.student_applications
  where id = target_application_id;

  if current_version is null then
    raise exception 'application not found';
  end if;

  perform public.review_student_applications(
    array[target_application_id],
    array[current_version],
    target_status,
    target_reason
  );
end;
$$;

revoke all on function public.review_student_application(
  uuid,
  public.verification_status,
  text
) from public, anon;
grant execute on function public.review_student_application(
  uuid,
  public.verification_status,
  text
) to authenticated;
