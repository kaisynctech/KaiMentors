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
    min(application.trader_id::text)::uuid
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
