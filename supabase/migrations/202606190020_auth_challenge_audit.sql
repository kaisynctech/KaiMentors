create table public.auth_challenge_events (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  purpose text not null check (purpose in ('invitation', 'signup', 'recovery', 'email_change')),
  event_type text not null check (event_type in ('requested', 'resend_requested', 'rate_limited', 'suppressed', 'provider_error', 'verified')),
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index auth_challenge_events_rate_limit_idx
  on public.auth_challenge_events (email_hash, purpose, created_at desc);
create index auth_challenge_events_user_created_idx
  on public.auth_challenge_events (user_id, created_at desc)
  where user_id is not null;

alter table public.auth_challenge_events enable row level security;

create policy "users view their own authentication challenge events"
on public.auth_challenge_events for select
using (user_id = auth.uid() or public.is_super_admin());

revoke all on public.auth_challenge_events from public, anon, authenticated;
grant select on public.auth_challenge_events to authenticated;
grant all on public.auth_challenge_events to service_role;

comment on table public.auth_challenge_events is
  'Audit metadata for OTP sends, resends, throttling, provider errors, and verification. OTP values are never stored.';
