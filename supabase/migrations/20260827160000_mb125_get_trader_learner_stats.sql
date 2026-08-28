-- MB-125: single-round-trip learner-count aggregate for the mentor courses
-- page, replacing a full lesson_progress table scan + in-memory counting.
--
-- Auth guard matches the established pattern for trader-scoped read RPCs in
-- this codebase (e.g. get_student_applications_page): a WHERE-clause guard
-- using is_super_admin()/is_trader_member(), not a raised exception -- this
-- keeps the function a plain `language sql stable` read, consistent with
-- the other read RPCs rather than introducing a new plpgsql exception
-- pattern for a read-only stats query.
create or replace function public.get_trader_learner_stats(target_trader_id uuid)
returns json
language sql
security definer
set search_path = ''
stable
as $$
  select case
    when not (public.is_super_admin() or public.is_trader_member(target_trader_id)) then null
    else json_build_object(
      'total_learners', (
        select count(distinct student_user_id)
        from public.lesson_progress
        where trader_id = target_trader_id
      ),
      'by_course', (
        select coalesce(json_object_agg(course_id, learner_count), '{}'::json)
        from (
          select course_id, count(distinct student_user_id) as learner_count
          from public.lesson_progress
          where trader_id = target_trader_id
          group by course_id
        ) sub
      )
    )
  end;
$$;

grant execute on function public.get_trader_learner_stats(uuid) to authenticated;
