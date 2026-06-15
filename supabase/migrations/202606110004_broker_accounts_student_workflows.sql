create type public.verification_method as enum (
  'api',
  'manual_review',
  'screenshot_upload'
);

alter table public.trader_broker_accounts
  add column affiliate_link text,
  add column verification_method public.verification_method
    not null default 'manual_review';

alter table public.trader_broker_accounts
  add constraint trader_broker_accounts_affiliate_link_length
    check (affiliate_link is null or char_length(affiliate_link) <= 1000);

alter table public.student_applications
  add column phone_number text not null default '',
  add column trading_account_number text,
  add column platform_account_number text,
  add column screenshot_path text;

alter table public.student_applications
  add constraint student_applications_phone_number_length
    check (char_length(phone_number) <= 32),
  add constraint student_applications_trading_account_length
    check (
      trading_account_number is null
      or char_length(trading_account_number) <= 120
    ),
  add constraint student_applications_platform_account_length
    check (
      platform_account_number is null
      or char_length(platform_account_number) <= 120
    ),
  add constraint student_applications_screenshot_path_length
    check (screenshot_path is null or char_length(screenshot_path) <= 1000);

alter table public.verification_attempts
  add column verification_method public.verification_method
    not null default 'manual_review';

drop function if exists public.get_public_portal_broker_options(text);

create function public.get_public_portal_broker_options(
  target_portal_slug text
)
returns table (
  connection_id uuid,
  broker_id uuid,
  broker_name text,
  broker_slug text,
  broker_logo_path text,
  affiliate_link text,
  verification_method public.verification_method
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    connection.id,
    broker.id,
    broker.name,
    broker.slug,
    broker.logo_path,
    connection.affiliate_link,
    connection.verification_method
  from public.portals portal
  join public.trader_broker_accounts connection
    on connection.trader_id = portal.trader_id
  join public.brokers broker
    on broker.id = connection.broker_id
  where portal.slug = target_portal_slug
    and portal.is_published
    and connection.is_active
    and broker.is_active;
$$;

grant execute on function public.get_public_portal_broker_options(text)
  to anon, authenticated;

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
  application_trader_id uuid;
begin
  if target_status not in (
    'verified'::public.verification_status,
    'rejected'::public.verification_status,
    'needs_more_information'::public.verification_status
  ) then
    raise exception 'unsupported review status';
  end if;

  select trader_id
  into application_trader_id
  from public.student_applications
  where id = target_application_id;

  if application_trader_id is null then
    raise exception 'application not found';
  end if;

  if not public.is_super_admin()
    and not public.is_trader_member(application_trader_id) then
    raise exception 'forbidden';
  end if;

  update public.student_applications
  set
    status = target_status,
    status_reason = nullif(trim(target_reason), ''),
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    verified_at = case
      when target_status = 'verified' then now()
      else null
    end
  where id = target_application_id
    and trader_id = application_trader_id;

  update public.verification_attempts
  set
    status = target_status,
    response_code = case
      when target_status = 'verified' then 'MENTOR_APPROVED'
      when target_status = 'rejected' then 'MENTOR_REJECTED'
      else 'MORE_INFORMATION_REQUESTED'
    end,
    response_summary = jsonb_build_object(
      'reviewedBy', auth.uid(),
      'reason', nullif(trim(target_reason), '')
    ),
    completed_at = case
      when target_status = 'needs_more_information' then null
      else now()
    end
  where id = (
    select id
    from public.verification_attempts
    where application_id = target_application_id
      and trader_id = application_trader_id
    order by created_at desc
    limit 1
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

create trigger audit_verification_attempts
  after insert or update or delete on public.verification_attempts
  for each row execute function public.write_audit_log();

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'verification-proofs',
  'verification-proofs',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

create policy "students and tenant reviewers read verification proofs"
on storage.objects for select
using (
  bucket_id = 'verification-proofs'
  and exists (
    select 1
    from public.student_applications application
    where application.trader_id =
        (storage.foldername(name))[1]::uuid
      and application.id =
        (storage.foldername(name))[2]::uuid
      and (
        application.student_user_id = auth.uid()
        or public.is_trader_member(application.trader_id)
        or public.is_super_admin()
      )
  )
);

create policy "students upload own verification proofs"
on storage.objects for insert
with check (
  bucket_id = 'verification-proofs'
  and exists (
    select 1
    from public.student_applications application
    where application.trader_id =
        (storage.foldername(name))[1]::uuid
      and application.id =
        (storage.foldername(name))[2]::uuid
      and application.student_user_id = auth.uid()
  )
);

create policy "tenant reviewers manage verification proofs"
on storage.objects for all
using (
  bucket_id = 'verification-proofs'
  and public.is_trader_member(
    (storage.foldername(name))[1]::uuid
  )
)
with check (
  bucket_id = 'verification-proofs'
  and public.is_trader_member(
    (storage.foldername(name))[1]::uuid
  )
);
