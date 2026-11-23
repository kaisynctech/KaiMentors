-- Daily gold analysis for academies with the charts flag (PASSII).
-- Mentors write today's marks and signal. Students of that academy can read them.
-- Other academies do not have the flag, so these policies do not apply to them.

create table if not exists public.mentor_chart_markups (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  symbol text not null default 'XAUUSD',
  interval text not null check (interval in ('15', '60', 'D')),
  analysis_date date not null,
  drawings jsonb not null default '[]'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trader_id, symbol, analysis_date, interval)
);

create table if not exists public.mentor_chart_signals (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  symbol text not null default 'XAUUSD',
  analysis_date date not null,
  signal jsonb not null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trader_id, symbol, analysis_date)
);

create index if not exists mentor_chart_markups_day_idx
  on public.mentor_chart_markups (trader_id, analysis_date desc);

create index if not exists mentor_chart_signals_day_idx
  on public.mentor_chart_signals (trader_id, analysis_date desc);

alter table public.mentor_chart_markups enable row level security;
alter table public.mentor_chart_signals enable row level security;

drop policy if exists mentors_manage_chart_markups on public.mentor_chart_markups;
drop policy if exists students_read_chart_markups on public.mentor_chart_markups;
drop policy if exists mentors_manage_chart_signals on public.mentor_chart_signals;
drop policy if exists students_read_chart_signals on public.mentor_chart_signals;

create policy mentors_manage_chart_markups
  on public.mentor_chart_markups
  for all
  using (
    public.academy_charts_enabled(trader_id)
    and (public.is_super_admin() or public.is_trader_member(trader_id))
  )
  with check (
    public.academy_charts_enabled(trader_id)
    and (public.is_super_admin() or public.is_trader_member(trader_id))
  );

create policy students_read_mentor_chart_markups
  on public.mentor_chart_markups
  for select
  using (
    public.academy_charts_enabled(trader_id)
    and exists (
      select 1
      from public.student_applications sa
      where sa.trader_id = mentor_chart_markups.trader_id
        and sa.student_user_id = auth.uid()
        and sa.status is distinct from 'rejected'
    )
  );

create policy mentors_manage_chart_signals
  on public.mentor_chart_signals
  for all
  using (
    public.academy_charts_enabled(trader_id)
    and (public.is_super_admin() or public.is_trader_member(trader_id))
  )
  with check (
    public.academy_charts_enabled(trader_id)
    and (public.is_super_admin() or public.is_trader_member(trader_id))
  );

create policy students_read_mentor_chart_signals
  on public.mentor_chart_signals
  for select
  using (
    public.academy_charts_enabled(trader_id)
    and exists (
      select 1
      from public.student_applications sa
      where sa.trader_id = mentor_chart_signals.trader_id
        and sa.student_user_id = auth.uid()
        and sa.status is distinct from 'rejected'
    )
  );

grant select, insert, update, delete on public.mentor_chart_markups to authenticated;
grant select, insert, update, delete on public.mentor_chart_signals to authenticated;

drop trigger if exists set_mentor_chart_markups_updated_at on public.mentor_chart_markups;
create trigger set_mentor_chart_markups_updated_at
  before update on public.mentor_chart_markups
  for each row execute function public.set_updated_at();

drop trigger if exists set_mentor_chart_signals_updated_at on public.mentor_chart_signals;
create trigger set_mentor_chart_signals_updated_at
  before update on public.mentor_chart_signals
  for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
