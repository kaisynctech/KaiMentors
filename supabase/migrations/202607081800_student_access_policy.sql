-- MB-124: Flexible student access policy and broker_verified tag.

alter table public.portals
  add column if not exists require_broker_verification_for_modules boolean not null default true,
  add column if not exists allow_full_access_without_verification boolean not null default false;

alter table public.portals
  drop constraint if exists portals_student_access_policy_valid;

alter table public.portals
  add constraint portals_student_access_policy_valid
    check (
      require_broker_verification_for_modules
      or allow_full_access_without_verification
    );

alter table public.student_applications
  add column if not exists broker_verified boolean not null default false,
  add column if not exists broker_verified_at timestamptz;

update public.student_applications
set
  broker_verified = true,
  broker_verified_at = coalesce(verified_at, reviewed_at, submitted_at, now())
where status = 'verified'
  and broker_verified = false;

update public.portals
set
  require_broker_verification_for_modules = true,
  allow_full_access_without_verification = false;

create or replace function public.has_student_module_access(target_trader_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.student_applications application
    join public.portals portal on portal.id = application.portal_id
    where application.trader_id = target_trader_id
      and application.student_user_id = auth.uid()
      and application.status <> 'rejected'
      and (
        portal.allow_full_access_without_verification
        or (
          portal.require_broker_verification_for_modules
          and (
            application.broker_verified
            or application.status = 'verified'
          )
        )
      )
  );
$$;

create or replace function public.has_verified_access(target_trader_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.student_applications
    where trader_id = target_trader_id
      and student_user_id = auth.uid()
      and (
        broker_verified
        or status = 'verified'
      )
  );
$$;

create or replace function public.can_access_course(
  target_course_id uuid,
  target_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.courses c
    where c.id = target_course_id
      and c.status = 'published'
      and public.has_student_module_access(c.trader_id)
      and (
        c.access_mode = 'all_verified'
        or (
          c.access_mode = 'restricted'
          and exists (
            select 1
            from public.content_access_grants g
            where g.trader_id = c.trader_id
              and g.entity_type = 'course'
              and g.entity_id = c.id
              and (g.expires_at is null or g.expires_at > now())
              and (
                g.student_user_id = target_user_id
                or exists (
                  select 1
                  from public.student_group_members gm
                  join public.student_applications ga
                    on ga.id = gm.application_id
                    and ga.trader_id = gm.trader_id
                  where gm.trader_id = c.trader_id
                    and gm.group_id = g.group_id
                    and ga.student_user_id = target_user_id
                    and ga.status <> 'rejected'
                    and public.has_student_module_access(ga.trader_id)
                )
              )
          )
        )
        or (
          c.access_mode = 'one_to_one'
          and 1 = (
            select count(*)
            from public.content_access_grants g
            where g.trader_id = c.trader_id
              and g.entity_type = 'course'
              and g.entity_id = c.id
              and g.student_user_id = target_user_id
              and g.group_id is null
              and (g.expires_at is null or g.expires_at > now())
          )
          and 1 = (
            select count(*)
            from public.content_access_grants g
            where g.trader_id = c.trader_id
              and g.entity_type = 'course'
              and g.entity_id = c.id
              and g.student_user_id is not null
              and g.group_id is null
              and (g.expires_at is null or g.expires_at > now())
          )
        )
      )
  );
$$;

create or replace function public.can_access_content(
  target_trader_id uuid,
  target_entity_type text,
  target_entity_id uuid,
  target_scope public.content_access_scope
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_student_module_access(target_trader_id)
    and (
      target_scope = 'all_verified'
      or exists (
        select 1
        from public.content_access_grants grant_row
        where grant_row.trader_id = target_trader_id
          and grant_row.entity_type = target_entity_type
          and grant_row.entity_id = target_entity_id
          and (
            grant_row.expires_at is null
            or grant_row.expires_at > now()
          )
          and (
            grant_row.student_user_id = auth.uid()
            or exists (
              select 1
              from public.student_group_members group_member
              join public.student_applications application
                on application.id = group_member.application_id
                and application.trader_id = group_member.trader_id
              where group_member.group_id = grant_row.group_id
                and application.student_user_id = auth.uid()
                and application.status <> 'rejected'
                and public.has_student_module_access(application.trader_id)
            )
          )
      )
    );
$$;

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
    broker_verified = case
      when target_status = 'verified' then true
      else application.broker_verified
    end,
    broker_verified_at = case
      when target_status = 'verified' then now()
      else application.broker_verified_at
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
  where attempt.application_id = any(target_application_ids)
    and attempt.status in (
      'pending'::public.verification_status,
      'processing'::public.verification_status,
      'manual_review'::public.verification_status,
      'needs_more_information'::public.verification_status
    );

  return jsonb_build_object(
    'batchId', batch_id,
    'updatedCount', requested_count,
    'status', target_status
  );
end;
$$;

drop policy if exists "verified students read published courses" on public.courses;
create policy "verified students read published courses"
on public.courses for select
using (status = 'published' and public.has_student_module_access(trader_id));

drop policy if exists "verified students read published lessons" on public.lessons;
create policy "verified students read published lessons"
on public.lessons for select
using (status = 'published' and public.has_student_module_access(trader_id));

drop policy if exists "verified students read published resources" on public.resources;
create policy "verified students read published resources"
on public.resources for select
using (status = 'published' and public.has_student_module_access(trader_id));

drop policy if exists "verified students read published announcements" on public.announcements;
create policy "verified students read published announcements"
on public.announcements for select
using (
  status = 'published'
  and (expires_at is null or expires_at > now())
  and public.has_student_module_access(trader_id)
);

drop policy if exists "verified students read published live classes" on public.live_classes;
create policy "verified students read published live classes"
on public.live_classes for select
using (status = 'published' and public.has_student_module_access(trader_id));

drop policy if exists "verified students read daily signals" on public.daily_signals;
create policy "verified students read daily signals"
on public.daily_signals for select
using (public.has_student_module_access(trader_id));

drop policy if exists "students_select_resource_items" on public.resource_items;
create policy "students_select_resource_items"
on public.resource_items for select
using (
  status = 'published'
  and (
    (
      access_scope = 'all_students'
      and exists (
        select 1
        from public.student_applications sa
        where sa.trader_id = resource_items.trader_id
          and sa.student_user_id = auth.uid()
          and sa.status <> 'rejected'
      )
    )
    or (
      access_scope = 'all_verified'
      and public.has_student_module_access(resource_items.trader_id)
    )
  )
);

grant execute on function public.has_student_module_access(uuid) to authenticated, service_role;

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
      or concat_ws(
        ' ',
        coalesce(application.full_name, profile.full_name),
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

grant execute on function public.get_student_applications_page(
  uuid, public.verification_status[], text, uuid, public.verification_method, integer, integer
) to authenticated;
