-- KaiSync Institution referral programme.
-- Anyone can hold a code. A referred student earns the referrer 10% of
-- every successful subscription payment, including monthly renewals.
-- The feature flag defaults off. Only this portal is switched on.

create table if not exists public.referral_partners (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  portal_id uuid not null references public.portals(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  code text not null,
  created_at timestamptz not null default now(),
  constraint referral_partners_code_check check (code ~ '^[A-Z0-9]{4,16}$'),
  constraint referral_partners_email_check check (position('@' in email) > 1),
  unique (portal_id, code),
  unique (portal_id, user_id)
);

create unique index if not exists referral_partners_portal_email_idx
  on public.referral_partners (portal_id, lower(email));

create table if not exists public.referral_attributions (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  portal_id uuid not null references public.portals(id) on delete cascade,
  referral_partner_id uuid not null references public.referral_partners(id) on delete restrict,
  student_application_id uuid not null unique references public.student_applications(id) on delete cascade,
  student_user_id uuid not null,
  code text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.referral_commissions (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.traders(id) on delete cascade,
  portal_id uuid not null references public.portals(id) on delete cascade,
  referral_partner_id uuid not null references public.referral_partners(id) on delete restrict,
  referral_attribution_id uuid not null references public.referral_attributions(id) on delete restrict,
  student_subscription_id uuid not null references public.student_subscriptions(id) on delete cascade,
  student_name text not null default '',
  payfast_payment_id text not null,
  plan_id text not null,
  payment_amount_cents integer not null check (payment_amount_cents >= 0),
  commission_cents integer not null check (commission_cents >= 0),
  status text not null default 'owed' check (status in ('owed', 'paid', 'void')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (payfast_payment_id)
);

create index if not exists referral_commissions_partner_idx
  on public.referral_commissions (referral_partner_id, created_at desc);

alter table public.referral_partners enable row level security;
alter table public.referral_attributions enable row level security;
alter table public.referral_commissions enable row level security;

drop policy if exists "referrers and tenant read partners" on public.referral_partners;
create policy "referrers and tenant read partners"
  on public.referral_partners for select
  using (
    user_id = auth.uid()
    or public.is_super_admin()
    or public.is_trader_member(trader_id)
  );

drop policy if exists "referrers and tenant read attributions" on public.referral_attributions;
create policy "referrers and tenant read attributions"
  on public.referral_attributions for select
  using (
    public.is_super_admin()
    or public.is_trader_member(trader_id)
    or exists (
      select 1
      from public.referral_partners partner
      where partner.id = referral_partner_id
        and partner.user_id = auth.uid()
    )
  );

drop policy if exists "referrers and tenant read commissions" on public.referral_commissions;
create policy "referrers and tenant read commissions"
  on public.referral_commissions for select
  using (
    public.is_super_admin()
    or public.is_trader_member(trader_id)
    or exists (
      select 1
      from public.referral_partners partner
      where partner.id = referral_partner_id
        and partner.user_id = auth.uid()
    )
  );

grant select on public.referral_partners to authenticated;
grant select on public.referral_attributions to authenticated;
grant select on public.referral_commissions to authenticated;

update public.portals
set student_portal_features = coalesce(student_portal_features, '{}'::jsonb) || '{"referrals": true}'::jsonb
where slug = 'kaisync-institution';
