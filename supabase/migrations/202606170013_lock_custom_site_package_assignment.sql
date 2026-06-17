drop policy if exists "active custom site packages are readable"
  on public.custom_site_packages;
drop policy if exists "tenant members manage custom site assignments"
  on public.custom_site_assignments;

create policy "assigned custom site packages are readable"
on public.custom_site_packages for select
using (
  public.is_super_admin()
  or exists (
    select 1
    from public.custom_site_assignments assignment
    where assignment.package_id = custom_site_packages.id
      and (
        public.is_trader_member(assignment.trader_id)
        or (
          assignment.status = 'active'
          and exists (
            select 1
            from public.portals portal
            where portal.id = assignment.portal_id
              and portal.trader_id = assignment.trader_id
              and portal.is_published
              and portal.website_delivery_mode = 'custom_package'
          )
        )
      )
  )
);

create policy "platform admins manage custom site assignments"
on public.custom_site_assignments for all
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "tenant members update assigned custom site content"
on public.custom_site_assignments for update
using (public.is_trader_member(trader_id))
with check (
  public.is_trader_member(trader_id)
  and package_id = custom_site_assignments.package_id
  and portal_id = custom_site_assignments.portal_id
  and trader_id = custom_site_assignments.trader_id
);

revoke insert, delete on public.custom_site_assignments
  from authenticated, anon;
revoke update on public.custom_site_assignments
  from authenticated, anon;
grant update (content_overrides, show_powered_by)
  on public.custom_site_assignments to authenticated;

create or replace function public.assign_custom_site_package(
  target_portal_id uuid,
  target_package_id uuid,
  target_status public.custom_site_assignment_status default 'active',
  target_show_powered_by boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_trader_id uuid;
  assignment_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'not authorized';
  end if;

  select portal.trader_id
  into resolved_trader_id
  from public.portals portal
  where portal.id = target_portal_id;

  if resolved_trader_id is null then
    raise exception 'portal not found';
  end if;

  if not exists (
    select 1
    from public.custom_site_packages package
    where package.id = target_package_id
      and package.is_active
  ) then
    raise exception 'custom site package not available';
  end if;

  insert into public.custom_site_assignments (
    trader_id,
    portal_id,
    package_id,
    status,
    show_powered_by,
    assigned_by,
    activated_at
  )
  values (
    resolved_trader_id,
    target_portal_id,
    target_package_id,
    target_status,
    target_show_powered_by,
    auth.uid(),
    case when target_status = 'active' then now() else null end
  )
  on conflict (portal_id)
  do update set
    package_id = excluded.package_id,
    status = excluded.status,
    show_powered_by = excluded.show_powered_by,
    assigned_by = excluded.assigned_by,
    activated_at = case
      when excluded.status = 'active' then now()
      else null
    end
  returning id into assignment_id;

  update public.portals
  set website_delivery_mode = case
      when target_status = 'active' then 'custom_package'::public.website_delivery_mode
      else 'builder_template'::public.website_delivery_mode
    end
  where id = target_portal_id;

  return assignment_id;
end;
$$;

create or replace function public.set_website_delivery_mode(
  target_portal_id uuid,
  target_mode public.website_delivery_mode
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_trader_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'not authorized';
  end if;

  select portal.trader_id
  into resolved_trader_id
  from public.portals portal
  where portal.id = target_portal_id;

  if resolved_trader_id is null then
    raise exception 'portal not found';
  end if;

  update public.portals
  set website_delivery_mode = target_mode
  where id = target_portal_id;

  if target_mode <> 'custom_package' then
    update public.custom_site_assignments
    set status = 'paused',
        activated_at = null
    where portal_id = target_portal_id;
  end if;
end;
$$;
