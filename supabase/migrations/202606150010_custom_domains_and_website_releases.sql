alter table public.website_templates
  add column owner_trader_id uuid references public.traders(id) on delete cascade,
  add column visibility text not null default 'public'
    check (visibility in ('public', 'tenant')),
  add column renderer_key text not null default 'section-engine'
    check (renderer_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  add column editable_schema jsonb not null default '{}'::jsonb,
  add column is_managed boolean not null default false;

create index website_templates_owner_idx
  on public.website_templates (owner_trader_id, is_active);

drop policy "active website templates are readable"
  on public.website_templates;

create policy "available website templates are readable"
on public.website_templates for select
using (
  public.is_super_admin()
  or (
    is_active
    and (
      visibility = 'public'
      or (
        owner_trader_id is not null
        and public.is_trader_member(owner_trader_id)
      )
    )
  )
);

alter function public.apply_website_template(uuid, uuid)
  rename to apply_website_template_unchecked;

revoke all on function public.apply_website_template_unchecked(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.apply_website_template(
  target_portal_id uuid,
  target_template_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_trader_id uuid;
begin
  select trader_id
  into resolved_trader_id
  from public.portals
  where id = target_portal_id;

  if resolved_trader_id is null then
    raise exception 'portal not found';
  end if;

  if current_setting('request.jwt.claim.role', true) <> 'service_role'
    and not public.is_super_admin()
    and not public.is_trader_member(resolved_trader_id) then
    raise exception 'forbidden';
  end if;

  if exists (
    select 1
    from public.website_theme_settings theme
    join public.website_templates template on template.id = theme.template_id
    where theme.portal_id = target_portal_id
      and template.is_managed
      and theme.template_id <> target_template_id
  )
    and current_setting('request.jwt.claim.role', true) <> 'service_role'
    and not public.is_super_admin() then
    raise exception 'managed template cannot be replaced';
  end if;

  if not exists (
    select 1
    from public.website_templates template
    where template.id = target_template_id
      and template.is_active
      and (
        template.visibility = 'public'
        or template.owner_trader_id = resolved_trader_id
        or public.is_super_admin()
      )
  ) then
    raise exception 'template not available';
  end if;

  perform public.apply_website_template_unchecked(
    target_portal_id,
    target_template_id
  );
end;
$$;

grant execute on function public.apply_website_template(uuid, uuid)
  to authenticated, service_role;

create table public.website_domains (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  portal_id uuid not null references public.portals(id) on delete cascade,
  hostname text not null,
  provider text not null default 'vercel'
    check (provider in ('vercel')),
  provider_domain_id text,
  is_primary boolean not null default false,
  redirect_to_primary boolean not null default true,
  ownership_status text not null default 'pending'
    check (ownership_status in ('pending', 'verified', 'failed')),
  dns_status text not null default 'pending'
    check (dns_status in ('pending', 'configured', 'misconfigured', 'failed')),
  ssl_status text not null default 'pending'
    check (ssl_status in ('pending', 'provisioning', 'ready', 'failed')),
  auth_status text not null default 'pending'
    check (auth_status in ('pending', 'configured', 'failed')),
  status text not null default 'requested'
    check (
      status in (
        'requested',
        'verification_required',
        'configuring',
        'active',
        'failed',
        'disabled'
      )
    ),
  verification_records jsonb not null default '[]'::jsonb,
  provider_metadata jsonb not null default '{}'::jsonb,
  failure_code text,
  failure_message text,
  last_checked_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, trader_id),
  foreign key (portal_id, trader_id)
    references public.portals(id, trader_id) on delete cascade,
  check (
    hostname = lower(hostname)
    and hostname !~ '[/:]'
    and hostname !~ '^\d+(\.\d+){3}$'
    and hostname ~
      '^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'
  )
);

create unique index website_domains_hostname_idx
  on public.website_domains (lower(hostname));
create unique index website_domains_primary_portal_idx
  on public.website_domains (portal_id)
  where is_primary and status <> 'disabled';
create index website_domains_portal_status_idx
  on public.website_domains (portal_id, status, created_at);

create table public.website_domain_events (
  id bigint generated always as identity primary key,
  domain_id uuid references public.website_domains(id) on delete set null,
  trader_id uuid not null references public.traders(id) on delete cascade,
  portal_id uuid not null references public.portals(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  hostname text not null,
  previous_status text,
  next_status text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (portal_id, trader_id)
    references public.portals(id, trader_id) on delete cascade
);

create index website_domain_events_domain_created_idx
  on public.website_domain_events (domain_id, created_at desc);
create index website_domain_events_portal_created_idx
  on public.website_domain_events (portal_id, created_at desc);

create table public.website_releases (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  portal_id uuid not null references public.portals(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null default 'published'
    check (status in ('published', 'superseded')),
  snapshot jsonb not null,
  content_hash text not null,
  release_notes text,
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (portal_id, version),
  unique (id, trader_id),
  foreign key (portal_id, trader_id)
    references public.portals(id, trader_id) on delete cascade
);

create index website_releases_portal_version_idx
  on public.website_releases (portal_id, version desc);

create table public.website_publications (
  portal_id uuid primary key references public.portals(id) on delete cascade,
  trader_id uuid not null unique references public.traders(id) on delete cascade,
  current_release_id uuid,
  published_at timestamptz,
  unpublished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (portal_id, trader_id)
    references public.portals(id, trader_id) on delete cascade,
  foreign key (current_release_id, trader_id)
    references public.website_releases(id, trader_id) on delete restrict
);

create or replace function public.build_website_release_snapshot(
  target_portal_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_trader_id uuid;
  result jsonb;
begin
  select trader_id
  into resolved_trader_id
  from public.portals
  where id = target_portal_id;

  if resolved_trader_id is null then
    raise exception 'portal not found';
  end if;

  if current_setting('request.jwt.claim.role', true) <> 'service_role'
    and not public.is_super_admin()
    and not public.is_trader_member(resolved_trader_id) then
    raise exception 'forbidden';
  end if;

  select jsonb_build_object(
    'portal',
      to_jsonb(portal),
    'template',
      to_jsonb(template),
    'theme',
      to_jsonb(theme),
    'pages',
      coalesce(
        (
          select jsonb_agg(to_jsonb(page) order by page.sort_order, page.title)
          from public.website_pages page
          where page.portal_id = target_portal_id
        ),
        '[]'::jsonb
      ),
    'sections',
      coalesce(
        (
          select jsonb_agg(
            to_jsonb(section)
            order by page.sort_order, section.sort_order, section.section_key
          )
          from public.website_sections section
          join public.website_pages page on page.id = section.page_id
          where page.portal_id = target_portal_id
        ),
        '[]'::jsonb
      ),
    'navigation',
      coalesce(
        (
          select jsonb_agg(
            to_jsonb(navigation)
            order by navigation.location, navigation.sort_order, navigation.label
          )
          from public.website_navigation navigation
          where navigation.portal_id = target_portal_id
        ),
        '[]'::jsonb
      )
  )
  into result
  from public.portals portal
  join public.website_theme_settings theme
    on theme.portal_id = portal.id
  join public.website_templates template
    on template.id = theme.template_id
  where portal.id = target_portal_id;

  if result is null then
    raise exception 'website is not initialized';
  end if;

  return result;
end;
$$;

create or replace function public.save_website_draft(
  target_portal_id uuid,
  draft jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_trader_id uuid;
  page_record record;
  section_record record;
  navigation_record record;
begin
  select trader_id
  into resolved_trader_id
  from public.portals
  where id = target_portal_id
  for update;

  if resolved_trader_id is null then
    raise exception 'portal not found';
  end if;

  if current_setting('request.jwt.claim.role', true) <> 'service_role'
    and not public.is_super_admin()
    and not public.is_trader_member(resolved_trader_id) then
    raise exception 'forbidden';
  end if;

  update public.website_theme_settings
  set
    primary_color = draft #>> '{theme,primaryColor}',
    accent_color = draft #>> '{theme,accentColor}',
    background_color = draft #>> '{theme,backgroundColor}',
    surface_color = draft #>> '{theme,surfaceColor}',
    text_color = draft #>> '{theme,textColor}',
    heading_font = draft #>> '{theme,headingFont}',
    body_font = draft #>> '{theme,bodyFont}',
    social_links = jsonb_strip_nulls(
      jsonb_build_object(
        'whatsapp', nullif(draft #>> '{theme,socialLinks,whatsapp}', ''),
        'telegram', nullif(draft #>> '{theme,socialLinks,telegram}', ''),
        'instagram', nullif(draft #>> '{theme,socialLinks,instagram}', '')
      )
    )
  where portal_id = target_portal_id
    and trader_id = resolved_trader_id;

  if not found then
    raise exception 'website theme not found';
  end if;

  for page_record in
    select *
    from jsonb_to_recordset(coalesce(draft -> 'pages', '[]'::jsonb))
      as page_data(
        id uuid,
        title text,
        is_enabled boolean,
        seo_title text,
        seo_description text
      )
  loop
    update public.website_pages
    set
      title = page_record.title,
      is_enabled = case
        when is_home then true
        else page_record.is_enabled
      end,
      seo_title = nullif(page_record.seo_title, ''),
      seo_description = nullif(page_record.seo_description, '')
    where id = page_record.id
      and portal_id = target_portal_id
      and trader_id = resolved_trader_id;

    if not found then
      raise exception 'website page does not belong to portal';
    end if;
  end loop;

  for section_record in
    select *
    from jsonb_to_recordset(coalesce(draft -> 'sections', '[]'::jsonb))
      as section_data(
        id uuid,
        content jsonb,
        is_enabled boolean,
        sort_order integer
      )
  loop
    update public.website_sections section
    set
      content = section_record.content,
      is_enabled = section_record.is_enabled,
      sort_order = section_record.sort_order
    from public.website_pages page
    where section.id = section_record.id
      and section.page_id = page.id
      and page.portal_id = target_portal_id
      and section.trader_id = resolved_trader_id;

    if not found then
      raise exception 'website section does not belong to portal';
    end if;
  end loop;

  for navigation_record in
    select *
    from jsonb_to_recordset(coalesce(draft -> 'navigation', '[]'::jsonb))
      as navigation_data(
        id uuid,
        label text,
        is_enabled boolean,
        sort_order integer
      )
  loop
    update public.website_navigation
    set
      label = navigation_record.label,
      is_enabled = navigation_record.is_enabled,
      sort_order = navigation_record.sort_order
    where id = navigation_record.id
      and portal_id = target_portal_id
      and trader_id = resolved_trader_id;

    if not found then
      raise exception 'website navigation does not belong to portal';
    end if;
  end loop;

  update public.portals
  set
    portal_name = draft #>> '{portal,name}',
    slug = draft #>> '{portal,slug}',
    primary_color = draft #>> '{theme,primaryColor}',
    accent_color = draft #>> '{theme,accentColor}',
    whatsapp_number =
      nullif(draft #>> '{theme,socialLinks,whatsapp}', ''),
    telegram_url =
      nullif(draft #>> '{theme,socialLinks,telegram}', ''),
    instagram_url =
      nullif(draft #>> '{theme,socialLinks,instagram}', '')
  where id = target_portal_id
    and trader_id = resolved_trader_id;
end;
$$;

create or replace function public.publish_website_release(
  target_portal_id uuid,
  target_release_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_trader_id uuid;
  next_version integer;
  release_snapshot jsonb;
  created_release_id uuid;
begin
  select trader_id
  into resolved_trader_id
  from public.portals
  where id = target_portal_id
  for update;

  if resolved_trader_id is null then
    raise exception 'portal not found';
  end if;

  if current_setting('request.jwt.claim.role', true) <> 'service_role'
    and not public.is_super_admin()
    and not public.is_trader_member(resolved_trader_id) then
    raise exception 'forbidden';
  end if;

  update public.portals
  set is_published = true
  where id = target_portal_id;

  release_snapshot := public.build_website_release_snapshot(target_portal_id);

  select coalesce(max(version), 0) + 1
  into next_version
  from public.website_releases
  where portal_id = target_portal_id;

  update public.website_releases
  set status = 'superseded'
  where portal_id = target_portal_id
    and status = 'published';

  insert into public.website_releases (
    trader_id,
    portal_id,
    version,
    status,
    snapshot,
    content_hash,
    release_notes,
    published_by
  )
  values (
    resolved_trader_id,
    target_portal_id,
    next_version,
    'published',
    release_snapshot,
    encode(extensions.digest(release_snapshot::text, 'sha256'), 'hex'),
    nullif(trim(target_release_notes), ''),
    auth.uid()
  )
  returning id into created_release_id;

  insert into public.website_publications (
    portal_id,
    trader_id,
    current_release_id,
    published_at,
    unpublished_at
  )
  values (
    target_portal_id,
    resolved_trader_id,
    created_release_id,
    now(),
    null
  )
  on conflict (portal_id) do update
  set
    current_release_id = excluded.current_release_id,
    published_at = excluded.published_at,
    unpublished_at = null;

  return created_release_id;
end;
$$;

create or replace function public.unpublish_website(
  target_portal_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_trader_id uuid;
begin
  select trader_id
  into resolved_trader_id
  from public.portals
  where id = target_portal_id
  for update;

  if resolved_trader_id is null then
    raise exception 'portal not found';
  end if;

  if current_setting('request.jwt.claim.role', true) <> 'service_role'
    and not public.is_super_admin()
    and not public.is_trader_member(resolved_trader_id) then
    raise exception 'forbidden';
  end if;

  update public.portals
  set is_published = false
  where id = target_portal_id;

  update public.website_publications
  set unpublished_at = now()
  where portal_id = target_portal_id;
end;
$$;

create or replace function public.rollback_website_release(
  target_portal_id uuid,
  target_release_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_trader_id uuid;
begin
  select trader_id
  into resolved_trader_id
  from public.portals
  where id = target_portal_id
  for update;

  if resolved_trader_id is null then
    raise exception 'portal not found';
  end if;

  if current_setting('request.jwt.claim.role', true) <> 'service_role'
    and not public.is_super_admin()
    and not public.is_trader_member(resolved_trader_id) then
    raise exception 'forbidden';
  end if;

  if not exists (
    select 1
    from public.website_releases
    where id = target_release_id
      and portal_id = target_portal_id
      and trader_id = resolved_trader_id
  ) then
    raise exception 'release not found';
  end if;

  update public.website_releases
  set status = case
    when id = target_release_id then 'published'
    else 'superseded'
  end
  where portal_id = target_portal_id;

  insert into public.website_publications (
    portal_id,
    trader_id,
    current_release_id,
    published_at,
    unpublished_at
  )
  values (
    target_portal_id,
    resolved_trader_id,
    target_release_id,
    now(),
    null
  )
  on conflict (portal_id) do update
  set
    current_release_id = excluded.current_release_id,
    published_at = excluded.published_at,
    unpublished_at = null;

  update public.portals
  set is_published = true
  where id = target_portal_id;
end;
$$;

create or replace function public.set_primary_website_domain(
  target_domain_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_trader_id uuid;
  resolved_portal_id uuid;
begin
  select trader_id, portal_id
  into resolved_trader_id, resolved_portal_id
  from public.website_domains
  where id = target_domain_id
    and status = 'active'
  for update;

  if resolved_trader_id is null then
    raise exception 'active domain not found';
  end if;

  if current_setting('request.jwt.claim.role', true) <> 'service_role'
    and not public.is_super_admin()
    and not public.is_trader_member(resolved_trader_id) then
    raise exception 'forbidden';
  end if;

  update public.website_domains
  set is_primary = (id = target_domain_id)
  where portal_id = resolved_portal_id
    and status <> 'disabled';

  update public.portals
  set custom_domain = (
    select hostname
    from public.website_domains
    where id = target_domain_id
  )
  where id = resolved_portal_id;
end;
$$;

create or replace function public.resolve_public_website_domain(
  target_hostname text
)
returns table (
  portal_id uuid,
  trader_id uuid,
  portal_slug text,
  hostname text,
  canonical_hostname text,
  should_redirect boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    domain.portal_id,
    domain.trader_id,
    portal.slug,
    domain.hostname,
    coalesce(primary_domain.hostname, domain.hostname),
    domain.redirect_to_primary
      and primary_domain.hostname is not null
      and primary_domain.hostname <> domain.hostname
  from public.website_domains domain
  join public.portals portal
    on portal.id = domain.portal_id
  left join public.website_domains primary_domain
    on primary_domain.portal_id = domain.portal_id
    and primary_domain.is_primary
    and primary_domain.status = 'active'
  where domain.hostname = lower(trim(trailing '.' from target_hostname))
    and domain.status = 'active'
    and portal.is_published
  limit 1;
$$;

revoke all on function public.build_website_release_snapshot(uuid)
  from public, anon;
revoke all on function public.save_website_draft(uuid, jsonb)
  from public, anon;
revoke all on function public.publish_website_release(uuid, text)
  from public, anon;
revoke all on function public.unpublish_website(uuid)
  from public, anon;
revoke all on function public.rollback_website_release(uuid, uuid)
  from public, anon;
revoke all on function public.set_primary_website_domain(uuid)
  from public, anon;
revoke all on function public.resolve_public_website_domain(text)
  from public;

grant execute on function public.build_website_release_snapshot(uuid)
  to authenticated, service_role;
grant execute on function public.save_website_draft(uuid, jsonb)
  to authenticated, service_role;
grant execute on function public.publish_website_release(uuid, text)
  to authenticated, service_role;
grant execute on function public.unpublish_website(uuid)
  to authenticated, service_role;
grant execute on function public.rollback_website_release(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.set_primary_website_domain(uuid)
  to authenticated, service_role;
grant execute on function public.resolve_public_website_domain(text)
  to anon, authenticated;

create trigger set_website_domains_updated_at
  before update on public.website_domains
  for each row execute function public.set_updated_at();
create trigger set_website_publications_updated_at
  before update on public.website_publications
  for each row execute function public.set_updated_at();

create trigger audit_website_domains
  after insert or update or delete on public.website_domains
  for each row execute function public.write_audit_log();
create trigger audit_website_releases
  after insert or update or delete on public.website_releases
  for each row execute function public.write_audit_log();
create trigger audit_website_publications
  after insert or update or delete on public.website_publications
  for each row execute function public.write_audit_log();

alter table public.website_domains enable row level security;
alter table public.website_domain_events enable row level security;
alter table public.website_releases enable row level security;
alter table public.website_publications enable row level security;

create policy "tenant members view website domains"
on public.website_domains for select
using (public.is_super_admin() or public.is_trader_member(trader_id));

create policy "platform admins manage website domains"
on public.website_domains for all
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "tenant members view website domain events"
on public.website_domain_events for select
using (public.is_super_admin() or public.is_trader_member(trader_id));

create policy "platform admins manage website domain events"
on public.website_domain_events for all
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "website releases are tenant managed or current public release"
on public.website_releases for select
using (
  public.is_super_admin()
  or public.is_trader_member(trader_id)
  or exists (
    select 1
    from public.website_publications publication
    join public.portals portal on portal.id = publication.portal_id
    where publication.current_release_id = website_releases.id
      and publication.unpublished_at is null
      and portal.is_published
  )
);

create policy "platform admins manage website releases"
on public.website_releases for all
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "website publications are tenant managed or public"
on public.website_publications for select
using (
  public.is_super_admin()
  or public.is_trader_member(trader_id)
  or (
    unpublished_at is null
    and exists (
      select 1
      from public.portals portal
      where portal.id = portal_id
        and portal.is_published
    )
  )
);

create policy "platform admins manage website publications"
on public.website_publications for all
using (public.is_super_admin())
with check (public.is_super_admin());

revoke insert, update, delete on public.website_domains
  from anon, authenticated;
revoke insert, update, delete on public.website_domain_events
  from anon, authenticated;
revoke insert, update, delete on public.website_releases
  from anon, authenticated;
revoke insert, update, delete on public.website_publications
  from anon, authenticated;

do $$
declare
  existing_portal record;
begin
  for existing_portal in
    select id
    from public.portals
    where is_published
  loop
    perform public.publish_website_release(
      existing_portal.id,
      'Initial release created during custom-domain migration'
    );
  end loop;
end;
$$;
