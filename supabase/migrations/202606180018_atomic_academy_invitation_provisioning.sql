create or replace function public.provision_invited_academy(
  target_user_id uuid,
  target_email text,
  target_full_name text,
  target_legal_name text,
  target_display_name text,
  target_slug text,
  target_package_id uuid,
  target_environment public.tenant_environment,
  target_invited_by uuid,
  target_timezone text default 'UTC'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_trader_id uuid;
  created_portal_id uuid;
  created_invitation_id uuid;
  created_assignment_id uuid;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'service role required';
  end if;
  if not exists (select 1 from public.profiles where id = target_invited_by and role = 'super_admin') then
    raise exception 'platform owner required';
  end if;
  if not exists (select 1 from public.profiles where id = target_user_id and lower(email) = lower(target_email)) then
    raise exception 'invited profile not found';
  end if;
  if target_package_id is not null and not exists (
    select 1 from public.custom_site_packages where id = target_package_id and is_active
  ) then raise exception 'active package not found'; end if;

  update public.profiles set role = 'trader', full_name = target_full_name where id = target_user_id;
  insert into public.traders (owner_user_id, legal_name, display_name, environment, status, timezone, support_email)
  values (target_user_id, target_legal_name, target_display_name, target_environment, 'active', target_timezone, lower(target_email))
  returning id into created_trader_id;
  insert into public.trader_members (trader_id, user_id, role)
  values (created_trader_id, target_user_id, 'owner');
  insert into public.portals (trader_id, slug, portal_name, hero_title, contact_email, is_published)
  values (created_trader_id, target_slug, target_display_name, 'Build confidence. Trade with a plan.', lower(target_email), true)
  returning id into created_portal_id;
  insert into public.subscriptions (trader_id) values (created_trader_id);

  if target_package_id is not null then
    insert into public.custom_site_assignments (
      trader_id, portal_id, package_id, status, show_powered_by, assigned_by, activated_at
    ) values (
      created_trader_id, created_portal_id, target_package_id, 'active', true, target_invited_by, now()
    ) returning id into created_assignment_id;
    update public.portals set website_delivery_mode = 'custom_package' where id = created_portal_id;
  end if;

  insert into public.academy_invitations (
    email, full_name, legal_name, display_name, portal_slug, package_id,
    invited_user_id, trader_id, invited_by
  ) values (
    lower(target_email), target_full_name, target_legal_name, target_display_name,
    target_slug, target_package_id, target_user_id, created_trader_id, target_invited_by
  ) returning id into created_invitation_id;

  return jsonb_build_object(
    'traderId', created_trader_id,
    'portalId', created_portal_id,
    'assignmentId', created_assignment_id,
    'invitationId', created_invitation_id
  );
end;
$$;

revoke all on function public.provision_invited_academy(uuid,text,text,text,text,text,uuid,public.tenant_environment,uuid,text)
  from public, anon, authenticated;
grant execute on function public.provision_invited_academy(uuid,text,text,text,text,text,uuid,public.tenant_environment,uuid,text)
  to service_role;

update public.traders trader
set status = 'active'
from public.portals portal
where portal.trader_id = trader.id
  and portal.slug = 'kaitrades'
  and trader.environment = 'acceptance_test';
