-- EP-027: Optional sequential module gating
alter table public.course_modules
  add column requires_previous_completion boolean not null default false;

comment on column public.course_modules.requires_previous_completion is
  'When true, students must complete all required lessons in the preceding published module before accessing this one.';
