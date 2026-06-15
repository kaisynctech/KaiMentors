create extension if not exists pgcrypto;

create type public.app_role as enum ('super_admin', 'trader', 'student');
create type public.trader_status as enum ('onboarding', 'active', 'suspended');
create type public.verification_status as enum (
  'pending',
  'processing',
  'verified',
  'rejected',
  'manual_review'
);
create type public.content_status as enum ('draft', 'published', 'archived');
create type public.resource_type as enum ('video', 'pdf', 'file', 'link');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'student',
  full_name text not null default '',
  email text,
  avatar_path text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.traders (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references public.profiles(id) on delete restrict,
  legal_name text not null,
  display_name text not null,
  status public.trader_status not null default 'onboarding',
  timezone text not null default 'UTC',
  support_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trader_members (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'editor', 'support')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trader_id, user_id)
);

create table public.portals (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null unique references public.traders(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  portal_name text not null,
  hero_title text not null,
  hero_subtitle text,
  logo_path text,
  favicon_path text,
  primary_color text not null default '#111315' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color text not null default '#D8FF59' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  cta_label text not null default 'Join the academy',
  custom_domain text unique,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, trader_id)
);

create table public.brokers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  adapter_key text not null,
  logo_path text,
  documentation_url text,
  is_active boolean not null default true,
  configuration_schema jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trader_broker_accounts (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  broker_id uuid not null references public.brokers(id) on delete restrict,
  partner_code text not null,
  account_label text not null,
  vault_secret_id uuid,
  public_config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  last_health_check_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trader_id, broker_id, partner_code),
  unique (id, trader_id)
);

create table public.student_applications (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  portal_id uuid not null,
  student_user_id uuid not null references public.profiles(id) on delete cascade,
  trader_broker_account_id uuid not null,
  broker_account_identifier text not null,
  status public.verification_status not null default 'pending',
  status_reason text,
  consented_at timestamptz not null,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trader_id, student_user_id),
  unique (id, trader_id),
  foreign key (portal_id, trader_id)
    references public.portals(id, trader_id) on delete cascade,
  foreign key (trader_broker_account_id, trader_id)
    references public.trader_broker_accounts(id, trader_id) on delete restrict
);

create table public.verification_attempts (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  application_id uuid not null,
  broker_id uuid not null references public.brokers(id) on delete restrict,
  request_id text not null unique,
  status public.verification_status not null default 'processing',
  adapter_key text not null,
  response_code text,
  response_summary jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (application_id, trader_id)
    references public.student_applications(id, trader_id) on delete cascade
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  title text not null,
  slug text not null,
  description text,
  cover_path text,
  status public.content_status not null default 'draft',
  sort_order integer not null default 0,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trader_id, slug),
  unique (id, trader_id)
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  course_id uuid not null,
  title text not null,
  description text,
  body jsonb not null default '{}'::jsonb,
  video_path text,
  status public.content_status not null default 'draft',
  sort_order integer not null default 0,
  published_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, trader_id),
  foreign key (course_id, trader_id)
    references public.courses(id, trader_id) on delete cascade
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  course_id uuid,
  lesson_id uuid,
  title text not null,
  type public.resource_type not null,
  storage_path text,
  external_url text,
  status public.content_status not null default 'draft',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (storage_path is not null or external_url is not null),
  foreign key (course_id, trader_id)
    references public.courses(id, trader_id) on delete cascade,
  foreign key (lesson_id, trader_id)
    references public.lessons(id, trader_id) on delete cascade
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  title text not null,
  body text not null,
  status public.content_status not null default 'draft',
  is_pinned boolean not null default false,
  published_at timestamptz,
  expires_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.live_classes (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  title text not null,
  description text,
  provider text not null default 'zoom',
  join_url text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status public.content_status not null default 'draft',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null unique references public.traders(id) on delete cascade,
  provider_customer_id text unique,
  provider_subscription_id text unique,
  plan_key text not null default 'starter',
  status public.subscription_status not null default 'trialing',
  current_period_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  trader_id uuid references public.traders(id) on delete set null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_role public.app_role,
  action text not null,
  entity_type text not null,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);

create index student_applications_trader_status_idx
  on public.student_applications (trader_id, status);
create index verification_attempts_application_idx
  on public.verification_attempts (application_id, created_at desc);
create index courses_trader_status_idx on public.courses (trader_id, status);
create index lessons_course_sort_idx on public.lessons (course_id, sort_order);
create index announcements_trader_published_idx
  on public.announcements (trader_id, published_at desc);
create index live_classes_trader_starts_idx
  on public.live_classes (trader_id, starts_at);
create index audit_logs_trader_created_idx
  on public.audit_logs (trader_id, created_at desc);
create index audit_logs_entity_idx
  on public.audit_logs (entity_type, entity_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'traders', 'trader_members', 'portals', 'brokers',
    'trader_broker_accounts', 'student_applications', 'verification_attempts',
    'courses', 'lessons', 'resources', 'announcements', 'live_classes',
    'subscriptions', 'platform_settings'
  ]
  loop
    execute format(
      'create trigger set_%I_updated_at before update on public.%I
       for each row execute function public.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end;
$$;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = 'super_admin', false);
$$;

create or replace function public.is_trader_member(target_trader_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trader_members
    where trader_id = target_trader_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_trader_owner(target_trader_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trader_members
    where trader_id = target_trader_id
      and user_id = auth.uid()
      and role = 'owner'
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
      and status = 'verified'
  );
$$;

create or replace function public.current_trader_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select trader_id
  from public.trader_members
  where user_id = auth.uid()
  order by created_at
  limit 1;
$$;

create or replace function public.get_public_portal_broker_options(
  target_portal_slug text
)
returns table (
  connection_id uuid,
  broker_id uuid,
  broker_name text,
  broker_slug text,
  broker_logo_path text
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
    broker.logo_path
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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case
      when new.raw_user_meta_data ->> 'role' = 'trader' then 'trader'::public.app_role
      else 'student'::public.app_role
    end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.provision_trader(
  target_user_id uuid,
  target_legal_name text,
  target_display_name text,
  target_slug text,
  target_timezone text default 'UTC'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_trader_id uuid;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'service role required';
  end if;

  update public.profiles
  set role = 'trader'
  where id = target_user_id;

  insert into public.traders (owner_user_id, legal_name, display_name, timezone)
  values (target_user_id, target_legal_name, target_display_name, target_timezone)
  returning id into created_trader_id;

  insert into public.trader_members (trader_id, user_id, role)
  values (created_trader_id, target_user_id, 'owner');

  insert into public.portals (trader_id, slug, portal_name, hero_title)
  values (
    created_trader_id,
    target_slug,
    target_display_name,
    'Build confidence. Trade with a plan.'
  );

  insert into public.subscriptions (trader_id)
  values (created_trader_id);

  return created_trader_id;
end;
$$;

revoke all on function public.provision_trader(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.provision_trader(uuid, text, text, text, text)
  to service_role;

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
  resolved_trader_id uuid;
  resolved_id text;
begin
  payload := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  resolved_trader_id := nullif(payload ->> 'trader_id', '')::uuid;
  resolved_id := payload ->> 'id';

  insert into public.audit_logs (
    trader_id,
    actor_user_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data
  )
  values (
    resolved_trader_id,
    auth.uid(),
    public.current_app_role(),
    lower(tg_op),
    tg_table_name,
    resolved_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );

  return coalesce(new, old);
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'traders', 'trader_members', 'portals', 'brokers',
    'trader_broker_accounts', 'student_applications', 'courses', 'lessons',
    'resources', 'announcements', 'live_classes', 'subscriptions'
  ]
  loop
    execute format(
      'create trigger audit_%I after insert or update or delete on public.%I
       for each row execute function public.write_audit_log()',
      table_name,
      table_name
    );
  end loop;
end;
$$;

alter table public.profiles enable row level security;
alter table public.traders enable row level security;
alter table public.trader_members enable row level security;
alter table public.portals enable row level security;
alter table public.brokers enable row level security;
alter table public.trader_broker_accounts enable row level security;
alter table public.student_applications enable row level security;
alter table public.verification_attempts enable row level security;
alter table public.courses enable row level security;
alter table public.lessons enable row level security;
alter table public.resources enable row level security;
alter table public.announcements enable row level security;
alter table public.live_classes enable row level security;
alter table public.subscriptions enable row level security;
alter table public.platform_settings enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles read own or administered"
on public.profiles for select
using (
  id = auth.uid()
  or public.is_super_admin()
  or exists (
    select 1
    from public.student_applications a
    where a.student_user_id = profiles.id
      and public.is_trader_member(a.trader_id)
  )
);

create policy "profiles update own"
on public.profiles for update
using (id = auth.uid() or public.is_super_admin())
with check (id = auth.uid() or public.is_super_admin());

revoke update on public.profiles from anon, authenticated;
grant update (full_name, avatar_path, phone) on public.profiles
  to authenticated;

create policy "traders visible to members and platform admins"
on public.traders for select
using (public.is_super_admin() or public.is_trader_member(id));

create policy "platform admins manage traders"
on public.traders for all
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "trader members visible within tenant"
on public.trader_members for select
using (public.is_super_admin() or public.is_trader_member(trader_id));

create policy "platform admins manage trader members"
on public.trader_members for all
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "owners manage trader members"
on public.trader_members for all
using (public.is_trader_owner(trader_id))
with check (public.is_trader_owner(trader_id));

create policy "published portals are public"
on public.portals for select
using (is_published or public.is_super_admin() or public.is_trader_member(trader_id));

create policy "tenant members manage portal"
on public.portals for all
using (public.is_super_admin() or public.is_trader_member(trader_id))
with check (public.is_super_admin() or public.is_trader_member(trader_id));

create policy "brokers visible to platform and trader users"
on public.brokers for select
using (
  public.is_super_admin()
  or (
    public.current_app_role() = 'trader'
    and is_active
  )
);

create policy "platform admins manage brokers"
on public.brokers for all
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "broker accounts visible to tenant members"
on public.trader_broker_accounts for select
using (
  public.is_super_admin()
  or public.is_trader_member(trader_id)
);

create policy "tenant members manage broker accounts"
on public.trader_broker_accounts for all
using (public.is_super_admin() or public.is_trader_member(trader_id))
with check (public.is_super_admin() or public.is_trader_member(trader_id));

create policy "students create own applications"
on public.student_applications for insert
with check (
  student_user_id = auth.uid()
  and exists (
    select 1
    from public.portals p
    join public.trader_broker_accounts tba
      on tba.trader_id = p.trader_id
    where p.id = portal_id
      and p.trader_id = student_applications.trader_id
      and p.is_published
      and tba.id = trader_broker_account_id
      and tba.is_active
  )
);

create policy "applications visible to student tenant and admins"
on public.student_applications for select
using (
  student_user_id = auth.uid()
  or public.is_trader_member(trader_id)
  or public.is_super_admin()
);

create policy "tenant reviewers update applications"
on public.student_applications for update
using (public.is_trader_member(trader_id) or public.is_super_admin())
with check (public.is_trader_member(trader_id) or public.is_super_admin());

create policy "verification attempts visible to tenant"
on public.verification_attempts for select
using (
  public.is_super_admin()
  or public.is_trader_member(trader_id)
  or exists (
    select 1 from public.student_applications a
    where a.id = application_id and a.student_user_id = auth.uid()
  )
);

create policy "courses tenant management"
on public.courses for all
using (public.is_super_admin() or public.is_trader_member(trader_id))
with check (public.is_super_admin() or public.is_trader_member(trader_id));
create policy "verified students read published courses"
on public.courses for select
using (status = 'published' and public.has_verified_access(trader_id));

create policy "lessons tenant management"
on public.lessons for all
using (public.is_super_admin() or public.is_trader_member(trader_id))
with check (public.is_super_admin() or public.is_trader_member(trader_id));
create policy "verified students read published lessons"
on public.lessons for select
using (status = 'published' and public.has_verified_access(trader_id));

create policy "resources tenant management"
on public.resources for all
using (public.is_super_admin() or public.is_trader_member(trader_id))
with check (public.is_super_admin() or public.is_trader_member(trader_id));
create policy "verified students read published resources"
on public.resources for select
using (status = 'published' and public.has_verified_access(trader_id));

create policy "announcements tenant management"
on public.announcements for all
using (public.is_super_admin() or public.is_trader_member(trader_id))
with check (public.is_super_admin() or public.is_trader_member(trader_id));
create policy "verified students read published announcements"
on public.announcements for select
using (
  status = 'published'
  and (expires_at is null or expires_at > now())
  and public.has_verified_access(trader_id)
);

create policy "live classes tenant management"
on public.live_classes for all
using (public.is_super_admin() or public.is_trader_member(trader_id))
with check (public.is_super_admin() or public.is_trader_member(trader_id));
create policy "verified students read published live classes"
on public.live_classes for select
using (status = 'published' and public.has_verified_access(trader_id));

create policy "subscriptions visible to tenant owner"
on public.subscriptions for select
using (public.is_super_admin() or public.is_trader_member(trader_id));
create policy "platform admins manage subscriptions"
on public.subscriptions for all
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "public settings readable"
on public.platform_settings for select
using (is_public or public.is_super_admin());
create policy "platform admins manage settings"
on public.platform_settings for all
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "audit logs visible to owning tenant and admins"
on public.audit_logs for select
using (
  public.is_super_admin()
  or (trader_id is not null and public.is_trader_member(trader_id))
);

revoke insert, update, delete on public.audit_logs from authenticated, anon;
revoke all on public.verification_attempts from anon;
revoke insert, update, delete on public.verification_attempts from authenticated;
revoke all on public.subscriptions from anon;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'portal-branding',
    'portal-branding',
    true,
    5242880,
    array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
  ),
  (
    'course-content',
    'course-content',
    false,
    524288000,
    array['video/mp4', 'video/webm', 'application/pdf', 'image/png', 'image/jpeg', 'image/webp']
  ),
  (
    'avatars',
    'avatars',
    false,
    5242880,
    array['image/png', 'image/jpeg', 'image/webp']
  )
on conflict (id) do nothing;

create policy "public portal branding"
on storage.objects for select
using (bucket_id = 'portal-branding');

create policy "tenant members manage portal branding"
on storage.objects for all
using (
  bucket_id = 'portal-branding'
  and public.is_trader_member((storage.foldername(name))[1]::uuid)
)
with check (
  bucket_id = 'portal-branding'
  and public.is_trader_member((storage.foldername(name))[1]::uuid)
);

create policy "verified users read tenant course content"
on storage.objects for select
using (
  bucket_id = 'course-content'
  and (
    public.is_super_admin()
    or public.is_trader_member((storage.foldername(name))[1]::uuid)
    or public.has_verified_access((storage.foldername(name))[1]::uuid)
  )
);

create policy "tenant members manage course content"
on storage.objects for all
using (
  bucket_id = 'course-content'
  and public.is_trader_member((storage.foldername(name))[1]::uuid)
)
with check (
  bucket_id = 'course-content'
  and public.is_trader_member((storage.foldername(name))[1]::uuid)
);

create policy "users read own avatar"
on storage.objects for select
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "users manage own avatar"
on storage.objects for all
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

grant execute on function public.current_app_role() to anon, authenticated;
grant execute on function public.is_super_admin() to anon, authenticated;
grant execute on function public.is_trader_member(uuid) to anon, authenticated;
grant execute on function public.is_trader_owner(uuid) to authenticated;
grant execute on function public.has_verified_access(uuid) to anon, authenticated;
grant execute on function public.current_trader_id() to authenticated;
grant execute on function public.get_public_portal_broker_options(text)
  to anon, authenticated;
