drop policy if exists "website pages are tenant managed or public" on public.website_pages;
create policy "website pages are tenant managed"
on public.website_pages for select
using (public.is_super_admin() or public.is_trader_member(trader_id));

drop policy if exists "website sections are tenant managed or public" on public.website_sections;
create policy "website sections are tenant managed"
on public.website_sections for select
using (public.is_super_admin() or public.is_trader_member(trader_id));

drop policy if exists "website themes are tenant managed or public" on public.website_theme_settings;
create policy "website themes are tenant managed"
on public.website_theme_settings for select
using (public.is_super_admin() or public.is_trader_member(trader_id));

drop policy if exists "website media is tenant managed or public" on public.website_media;
create policy "website media is tenant managed"
on public.website_media for select
using (public.is_super_admin() or public.is_trader_member(trader_id));

drop policy if exists "website navigation is tenant managed or public" on public.website_navigation;
create policy "website navigation is tenant managed"
on public.website_navigation for select
using (public.is_super_admin() or public.is_trader_member(trader_id));

drop policy if exists "website releases are tenant managed or current public release" on public.website_releases;
create policy "website releases are tenant managed or current legacy public release"
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
      and portal.website_delivery_mode = 'builder_template'
  )
);

drop policy if exists "website publications are tenant managed or public" on public.website_publications;
create policy "website publications are tenant managed or legacy public"
on public.website_publications for select
using (
  public.is_super_admin()
  or public.is_trader_member(trader_id)
  or (
    unpublished_at is null
    and exists (
      select 1 from public.portals portal
      where portal.id = portal_id
        and portal.is_published
        and portal.website_delivery_mode = 'builder_template'
    )
  )
);
