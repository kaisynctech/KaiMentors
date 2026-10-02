-- Academy staff can play their own course videos and open the student
-- library without a verified student application. Unverified students
-- already have RLS for access_scope = all_students; this does not widen that.

create or replace function public.has_student_module_access(target_trader_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  portal_access_model text;
begin
  if public.is_super_admin() or public.is_trader_member(target_trader_id) then
    return true;
  end if;

  select p.access_model
  into portal_access_model
  from public.portals p
  where p.trader_id = target_trader_id;

  if not found then
    return false;
  end if;

  if portal_access_model = 'subscription' then
    return exists (
      select 1
      from public.student_applications sa
      join public.student_subscriptions ss on ss.student_application_id = sa.id
      where sa.trader_id = target_trader_id
        and sa.student_user_id = auth.uid()
        and sa.status <> 'rejected'
        and ss.status in ('active', 'cancelled', 'payment_failed')
        and ss.current_period_end is not null
        and ss.current_period_end > now()
    );
  end if;

  return exists (
    select 1
    from public.student_applications application
    join public.portals portal on portal.id = application.portal_id
    where application.trader_id = target_trader_id
      and application.student_user_id = auth.uid()
      and application.status <> 'rejected'
      and (
        portal.allow_full_access_without_verification
        or (
          portal.require_broker_verification_for_modules
          and (
            application.broker_verified
            or application.status = 'verified'
          )
        )
      )
  );
end;
$$;

create or replace function public.can_access_course(
  target_course_id uuid,
  target_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.courses c
    where c.id = target_course_id
      and (
        public.is_super_admin()
        or public.is_trader_member(c.trader_id)
        or (
          c.status = 'published'
          and public.has_student_module_access(c.trader_id)
          and (
            c.access_mode = 'all_verified'
            or (
              c.access_mode = 'restricted'
              and exists (
                select 1
                from public.content_access_grants g
                where g.trader_id = c.trader_id
                  and g.entity_type = 'course'
                  and g.entity_id = c.id
                  and (g.expires_at is null or g.expires_at > now())
                  and (
                    g.student_user_id = target_user_id
                    or exists (
                      select 1
                      from public.student_group_members gm
                      join public.student_applications ga
                        on ga.id = gm.application_id
                        and ga.trader_id = gm.trader_id
                      where gm.trader_id = c.trader_id
                        and gm.group_id = g.group_id
                        and ga.student_user_id = target_user_id
                        and ga.status <> 'rejected'
                        and public.has_student_module_access(ga.trader_id)
                    )
                  )
              )
            )
            or (
              c.access_mode = 'one_to_one'
              and 1 = (
                select count(*)
                from public.content_access_grants g
                where g.trader_id = c.trader_id
                  and g.entity_type = 'course'
                  and g.entity_id = c.id
                  and g.student_user_id = target_user_id
                  and g.group_id is null
                  and (g.expires_at is null or g.expires_at > now())
              )
              and 1 = (
                select count(*)
                from public.content_access_grants g
                where g.trader_id = c.trader_id
                  and g.entity_type = 'course'
                  and g.entity_id = c.id
                  and g.student_user_id is not null
                  and g.group_id is null
                  and (g.expires_at is null or g.expires_at > now())
              )
            )
          )
        )
      )
  );
$$;
