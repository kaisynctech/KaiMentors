-- XM MyPartners connection for Milkers FX.
-- Reuses the XM Global catalog row. Credentials stay in Vault.

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
  'MILKERSFX',
  'XM Global',
  'https://www.xm.com',
  'api',
  jsonb_build_object(
    'verificationEndpoint',
    'https://mypartners.xm.com/api/traders'
  ),
  'Enter your XM client ID (the numeric login used in MT4/MT5). We check it against partner code MILKERSFX. If XM cannot confirm it automatically, your mentor will review the request.',
  true
from public.portals p
join public.brokers b on b.slug = 'xm-global'
where p.slug = 'milkers-fx'
  and not exists (
    select 1
    from public.trader_broker_accounts tba
    where tba.trader_id = p.trader_id
      and tba.broker_id = b.id
  );
