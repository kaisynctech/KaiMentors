-- Second XM MyPartners connection for Sharesworldwide (bandi-shares).
-- Keeps BANDISHARES05. Credentials stay in Vault and are not stored here.

insert into public.trader_broker_accounts (
  trader_id,
  broker_id,
  partner_code,
  account_label,
  affiliate_link,
  verification_method,
  public_config,
  verification_instructions,
  is_active
)
select
  p.trader_id,
  b.id,
  'A1299170',
  'XM Global A1299170',
  'https://www.xm.com',
  'api',
  jsonb_build_object(
    'verificationEndpoint',
    'https://mypartners.xm.com/api/traders'
  ),
  'Enter your XM client ID (the numeric login used in MT4/MT5). We check it against partner codes BANDISHARES05 and A1299170. If XM cannot confirm it automatically, your mentor will review the request.',
  true
from public.portals p
join public.brokers b on b.slug = 'xm-global'
where p.slug = 'bandi-shares'
  and not exists (
    select 1
    from public.trader_broker_accounts tba
    where tba.trader_id = p.trader_id
      and tba.broker_id = b.id
      and tba.partner_code = 'A1299170'
  );

update public.trader_broker_accounts tba
set verification_instructions = 'Enter your XM client ID (the numeric login used in MT4/MT5). We check it against partner codes BANDISHARES05 and A1299170. If XM cannot confirm it automatically, your mentor will review the request.'
from public.portals p
where tba.trader_id = p.trader_id
  and p.slug = 'bandi-shares'
  and tba.partner_code in ('BANDISHARES05', 'A1299170');
