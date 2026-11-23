-- Affiliate portal, phase 1 (KaiSync Institution is the only portal with referrals switched on).
-- Adds affiliate profile fields, account status, terms acceptance, and click tracking.
-- Approval is automatic: new affiliates start as 'active'. Suspension is a manual action.

alter table public.referral_partners
  add column if not exists phone text,
  add column if not exists country text,
  add column if not exists promo_channel text,
  add column if not exists promo_link text,
  add column if not exists status text not null default 'active',
  add column if not exists status_reason text,
  add column if not exists terms_version text,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'referral_partners_status_check') then
    alter table public.referral_partners
      add constraint referral_partners_status_check check (status in ('active', 'suspended'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'referral_partners_phone_check') then
    alter table public.referral_partners
      add constraint referral_partners_phone_check check (phone is null or phone ~ '^\+[0-9]{7,15}$');
  end if;
end $$;

-- One affiliate per phone number per academy.
create unique index if not exists referral_partners_portal_phone_idx
  on public.referral_partners (portal_id, phone)
  where phone is not null;

-- Visits that arrived through an affiliate link. Visitor identity is a one-way hash only.
create table if not exists public.referral_clicks (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  portal_id uuid not null references public.portals(id) on delete cascade,
  referral_partner_id uuid not null references public.referral_partners(id) on delete cascade,
  visitor_hash text not null,
  landing_path text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists referral_clicks_partner_idx
  on public.referral_clicks (referral_partner_id, created_at desc);
create index if not exists referral_clicks_dedupe_idx
  on public.referral_clicks (referral_partner_id, visitor_hash, created_at desc);

alter table public.referral_clicks enable row level security;

drop policy if exists "referrers and tenant read clicks" on public.referral_clicks;
create policy "referrers and tenant read clicks"
  on public.referral_clicks for select
  using (
    public.is_super_admin()
    or public.is_trader_member(trader_id)
    or exists (
      select 1 from public.referral_partners partner
      where partner.id = referral_partner_id and partner.user_id = auth.uid()
    )
  );

grant select on public.referral_clicks to authenticated;
