-- Student marks are kept per day, the same way mentor analysis already is.
-- A new day does not delete the previous one.

alter table public.student_chart_markups
  add column if not exists analysis_date date;

update public.student_chart_markups
set analysis_date = (created_at at time zone 'Africa/Johannesburg')::date
where analysis_date is null;

alter table public.student_chart_markups
  alter column analysis_date set not null;

alter table public.student_chart_markups
  drop constraint if exists student_chart_markups_trader_id_student_user_id_symbol_inte_key;

alter table public.student_chart_markups
  drop constraint if exists student_chart_markups_day_key;

alter table public.student_chart_markups
  add constraint student_chart_markups_day_key
  unique (trader_id, student_user_id, symbol, interval, analysis_date);

create index if not exists student_chart_markups_day_idx
  on public.student_chart_markups (trader_id, student_user_id, symbol, analysis_date desc);

notify pgrst, 'reload schema';
