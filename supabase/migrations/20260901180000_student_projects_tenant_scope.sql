-- Student project showcases belong to an academy, not the platform admin UI.
-- Mentors manage them from /dashboard/projects when the projects module is on.

create table if not exists public.student_projects (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  title text not null,
  student_name text not null,
  description text,
  category text not null,
  live_url text,
  github_url text,
  thumbnail_url text,
  tools text[] not null default '{}',
  featured boolean not null default false,
  published boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.student_projects
  add column if not exists trader_id uuid references public.traders(id) on delete cascade;

alter table public.student_projects
  add column if not exists created_by uuid references auth.users(id);

-- Table is empty in production today, so requiring trader_id is safe.
alter table public.student_projects
  alter column trader_id set not null;

create index if not exists student_projects_trader_idx
  on public.student_projects (trader_id, created_at desc);

alter table public.student_projects enable row level security;

drop policy if exists admin_all on public.student_projects;
drop policy if exists public_read_published on public.student_projects;
drop policy if exists mentors_all_student_projects on public.student_projects;
drop policy if exists students_read_published_student_projects on public.student_projects;

create policy mentors_all_student_projects
  on public.student_projects
  for all
  using (public.is_super_admin() or public.is_trader_member(trader_id))
  with check (public.is_super_admin() or public.is_trader_member(trader_id));

create policy students_read_published_student_projects
  on public.student_projects
  for select
  using (
    published = true
    and exists (
      select 1
      from public.student_applications sa
      where sa.trader_id = student_projects.trader_id
        and sa.student_user_id = auth.uid()
        and sa.status is distinct from 'rejected'
    )
  );

grant select, insert, update, delete on public.student_projects to authenticated;

update public.portals
set student_portal_features = coalesce(student_portal_features, '{}'::jsonb)
  || jsonb_build_object('projects', true)
where slug in ('kaisync-institution', 'kaitrades');
