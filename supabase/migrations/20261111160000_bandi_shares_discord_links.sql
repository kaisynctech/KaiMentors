-- Sharesworldwide Discord identity links.
-- The server row is Bandile's linked Discord server.
-- Student rows match an academy student to the Discord account they connect.
-- Other academies have no rows and no UI for this.

create table if not exists public.academy_discord_servers (
  trader_id uuid primary key references public.traders(id) on delete cascade,
  guild_id text not null check (char_length(guild_id) between 2 and 32),
  guild_name text not null check (char_length(guild_name) between 1 and 100),
  discord_user_id text not null check (char_length(discord_user_id) between 2 and 32),
  discord_username text not null check (char_length(discord_username) between 1 and 64),
  linked_by uuid not null references public.profiles(id) on delete restrict,
  linked_at timestamptz not null default now()
);

create table if not exists public.student_discord_links (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  student_user_id uuid not null references public.profiles(id) on delete cascade,
  discord_user_id text not null check (char_length(discord_user_id) between 2 and 32),
  discord_username text not null check (char_length(discord_username) between 1 and 64),
  linked_at timestamptz not null default now(),
  unique (trader_id, student_user_id),
  unique (trader_id, discord_user_id)
);

alter table public.academy_discord_servers enable row level security;
alter table public.student_discord_links enable row level security;

drop policy if exists mentors_read_discord_server on public.academy_discord_servers;
create policy mentors_read_discord_server
  on public.academy_discord_servers
  for select
  using (public.is_super_admin() or public.is_trader_member(trader_id));

drop policy if exists read_student_discord_links on public.student_discord_links;
create policy read_student_discord_links
  on public.student_discord_links
  for select
  using (
    student_user_id = auth.uid()
    or public.is_super_admin()
    or public.is_trader_member(trader_id)
  );

grant select on public.academy_discord_servers to authenticated;
grant select on public.student_discord_links to authenticated;
