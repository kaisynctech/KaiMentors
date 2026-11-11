-- Daily market notes for an academy. Off unless the portal turns Articles on.
-- Sharesworldwide is the only academy enabled here.

create table if not exists public.market_articles (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 160),
  yesterday text not null check (char_length(yesterday) between 1 and 8000),
  today text not null check (char_length(today) between 1 and 8000),
  published boolean not null default false,
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists market_articles_trader_published_idx
  on public.market_articles (trader_id, published_at desc)
  where published = true;

alter table public.market_articles enable row level security;

drop policy if exists mentors_all_market_articles on public.market_articles;
drop policy if exists students_read_published_market_articles on public.market_articles;

create policy mentors_all_market_articles
  on public.market_articles
  for all
  using (public.is_super_admin() or public.is_trader_member(trader_id))
  with check (public.is_super_admin() or public.is_trader_member(trader_id));

create policy students_read_published_market_articles
  on public.market_articles
  for select
  using (
    published = true
    and exists (
      select 1
      from public.student_applications sa
      where sa.trader_id = market_articles.trader_id
        and sa.student_user_id = auth.uid()
        and sa.status is distinct from 'rejected'
    )
  );

grant select, insert, update, delete on public.market_articles to authenticated;

drop trigger if exists set_market_articles_updated_at on public.market_articles;
create trigger set_market_articles_updated_at
  before update on public.market_articles
  for each row execute function public.set_updated_at();

update public.portals
set student_portal_features = coalesce(student_portal_features, '{}'::jsonb)
  || jsonb_build_object('articles', true)
where slug = 'bandi-shares';

update public.custom_site_packages
set manifest = jsonb_set(
  manifest,
  '{pages}',
  (manifest->'pages') || jsonb_build_array(
    jsonb_build_object(
      'slug', 'articles',
      'file', 'articles.html',
      'label', 'Articles',
      'path', '/articles'
    )
  )
)
where package_key = 'bandi-shares'
  and not exists (
    select 1
    from jsonb_array_elements(manifest->'pages') page
    where page->>'path' = '/articles'
  );
