-- MB-117: Add province, country, notifications_opt_in to student_applications
-- These columns are nullable for backwards compatibility with existing verification portals.

alter table public.student_applications
  add column if not exists province              text,
  add column if not exists country               text,
  add column if not exists notifications_opt_in  boolean not null default false;

comment on column public.student_applications.province             is 'Student province/state — collected for subscription portals';
comment on column public.student_applications.country              is 'Student country — collected for subscription portals';
comment on column public.student_applications.notifications_opt_in is 'Whether student opted into marketing/update emails at registration';
