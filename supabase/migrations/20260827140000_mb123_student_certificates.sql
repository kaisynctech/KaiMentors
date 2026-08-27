-- MB-123: Course completion certificates.
-- pgcrypto verified already enabled (extversion 1.3) before writing this --
-- gen_random_bytes()/gen_random_uuid() are available, no `create extension` needed.

create table public.student_certificates (
  id                      uuid primary key default gen_random_uuid(),
  trader_id               uuid not null references public.traders(id) on delete cascade,
  portal_id               uuid not null references public.portals(id) on delete cascade,
  student_user_id         uuid not null references auth.users(id) on delete cascade,
  student_application_id  uuid not null references public.student_applications(id) on delete cascade,
  course_id               uuid not null references public.courses(id) on delete cascade,
  student_name            text not null,       -- snapshot at time of issue
  course_title            text not null,       -- snapshot at time of issue
  portal_name             text not null,       -- snapshot at time of issue
  -- The brief's original default expression, encode(gen_random_bytes(18),
  -- 'base64url'), fails at insert time -- Postgres's encode() only supports
  -- 'base64', 'hex', and 'escape'; 'base64url' is not a valid encoding name
  -- and raises "22023: unrecognized encoding" on every single row. Verified
  -- live by attempting exactly that insert before writing any app code
  -- around it. Using translate() over standard base64 instead, to get the
  -- same URL-safe alphabet (RFC 4648 base64url: '+'->'-', '/'->'_') while
  -- dropping '=' padding entirely (translate() removes any `from` character
  -- with no corresponding `to` character) -- same output shape base64url
  -- would have produced.
  public_token            text not null unique default translate(encode(gen_random_bytes(18), 'base64'), '+/=', '-_'),
  issued_at               timestamptz not null default now(),
  created_at              timestamptz not null default now(),
  unique (student_application_id, course_id)
);

create index on public.student_certificates (student_user_id);
create index on public.student_certificates (public_token);

alter table public.student_certificates enable row level security;

create policy "student_read_own"
  on public.student_certificates for select
  to authenticated
  using (student_user_id = auth.uid());

-- Public token lookup for the shareable /certificates/[token] page is handled
-- at the API/route level via the service-role admin client, which bypasses
-- RLS entirely -- intentionally no anon/public SELECT policy here.
