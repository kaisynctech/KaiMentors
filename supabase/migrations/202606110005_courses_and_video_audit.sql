alter table public.lessons
  add column duration_seconds integer;

alter table public.lessons
  add constraint lessons_duration_seconds_positive
    check (duration_seconds is null or duration_seconds > 0);

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
  resolved_action text;
begin
  payload := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  resolved_trader_id := nullif(payload ->> 'trader_id', '')::uuid;
  resolved_id := payload ->> 'id';

  if tg_table_name = 'courses' then
    resolved_action := case tg_op
      when 'INSERT' then 'course_created'
      when 'UPDATE' then 'course_updated'
      when 'DELETE' then 'course_deleted'
      else lower(tg_op)
    end;
  elsif tg_table_name = 'lessons' then
    if tg_op = 'INSERT' then
      resolved_action := 'lesson_created';
    elsif tg_op = 'UPDATE' then
      if old.video_path is distinct from new.video_path
        and new.video_path is not null then
        resolved_action := 'video_uploaded';
      else
        resolved_action := 'lesson_updated';
      end if;
    elsif tg_op = 'DELETE' then
      resolved_action := 'lesson_deleted';
    else
      resolved_action := lower(tg_op);
    end if;
  else
    resolved_action := lower(tg_op);
  end if;

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
    resolved_action,
    tg_table_name,
    resolved_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );

  return coalesce(new, old);
end;
$$;
