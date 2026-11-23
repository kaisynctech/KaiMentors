-- PASSII students (charts flag) can save chart marks and their own trade log.
-- Other academies do not have the charts flag, so these policies do not apply to them.

create table if not exists public.student_chart_markups (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  student_user_id uuid not null references public.profiles(id) on delete cascade,
  symbol text not null default 'XAUUSD',
  interval text not null check (interval in ('15', '60', 'D')),
  drawings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trader_id, student_user_id, symbol, interval)
);

create table if not exists public.student_trades (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  student_user_id uuid not null references public.profiles(id) on delete cascade,
  symbol text not null default 'XAUUSD',
  direction text not null check (direction in ('buy', 'sell')),
  entry_price numeric(12, 3) not null check (entry_price > 0),
  exit_price numeric(12, 3) check (exit_price is null or exit_price > 0),
  stop_loss numeric(12, 3) check (stop_loss is null or stop_loss > 0),
  size numeric(10, 2) check (size is null or size > 0),
  opened_on date not null,
  closed_on date,
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closed_on is null or closed_on >= opened_on)
);

create index if not exists student_chart_markups_owner_idx
  on public.student_chart_markups (trader_id, student_user_id);

create index if not exists student_trades_owner_idx
  on public.student_trades (trader_id, student_user_id, opened_on desc);

alter table public.student_chart_markups enable row level security;
alter table public.student_trades enable row level security;

create or replace function public.academy_charts_enabled(target_trader_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.portals
    where trader_id = target_trader_id
      and coalesce(student_portal_features, '{}'::jsonb) @> '{"charts": true}'::jsonb
  );
$$;

revoke all on function public.academy_charts_enabled(uuid) from public;
grant execute on function public.academy_charts_enabled(uuid) to authenticated, service_role;

drop policy if exists students_manage_own_chart_markups on public.student_chart_markups;
drop policy if exists mentors_read_chart_markups on public.student_chart_markups;
drop policy if exists students_manage_own_trades on public.student_trades;
drop policy if exists mentors_read_student_trades on public.student_trades;

create policy students_manage_own_chart_markups
  on public.student_chart_markups
  for all
  using (
    student_user_id = auth.uid()
    and public.academy_charts_enabled(trader_id)
    and exists (
      select 1
      from public.student_applications sa
      where sa.trader_id = student_chart_markups.trader_id
        and sa.student_user_id = auth.uid()
        and sa.status is distinct from 'rejected'
    )
  )
  with check (
    student_user_id = auth.uid()
    and public.academy_charts_enabled(trader_id)
    and exists (
      select 1
      from public.student_applications sa
      where sa.trader_id = student_chart_markups.trader_id
        and sa.student_user_id = auth.uid()
        and sa.status is distinct from 'rejected'
    )
  );

create policy mentors_read_chart_markups
  on public.student_chart_markups
  for select
  using (
    public.academy_charts_enabled(trader_id)
    and (public.is_super_admin() or public.is_trader_member(trader_id))
  );

create policy students_manage_own_trades
  on public.student_trades
  for all
  using (
    student_user_id = auth.uid()
    and public.academy_charts_enabled(trader_id)
    and exists (
      select 1
      from public.student_applications sa
      where sa.trader_id = student_trades.trader_id
        and sa.student_user_id = auth.uid()
        and sa.status is distinct from 'rejected'
    )
  )
  with check (
    student_user_id = auth.uid()
    and public.academy_charts_enabled(trader_id)
    and exists (
      select 1
      from public.student_applications sa
      where sa.trader_id = student_trades.trader_id
        and sa.student_user_id = auth.uid()
        and sa.status is distinct from 'rejected'
    )
  );

create policy mentors_read_student_trades
  on public.student_trades
  for select
  using (
    public.academy_charts_enabled(trader_id)
    and (public.is_super_admin() or public.is_trader_member(trader_id))
  );

grant select, insert, update, delete on public.student_chart_markups to authenticated;
grant select, insert, update, delete on public.student_trades to authenticated;

drop trigger if exists set_student_chart_markups_updated_at on public.student_chart_markups;
create trigger set_student_chart_markups_updated_at
  before update on public.student_chart_markups
  for each row execute function public.set_updated_at();

drop trigger if exists set_student_trades_updated_at on public.student_trades;
create trigger set_student_trades_updated_at
  before update on public.student_trades
  for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
