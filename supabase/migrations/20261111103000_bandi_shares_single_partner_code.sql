-- A1299170 is the XM affiliate account id for Sharesworldwide's second API
-- token. The student-facing partner code remains BANDISHARES05.

delete from public.trader_broker_accounts tba
using public.portals p
where tba.trader_id = p.trader_id
  and p.slug = 'bandi-shares'
  and tba.partner_code = 'A1299170'
  and not exists (
    select 1
    from public.student_applications sa
    where sa.trader_broker_account_id = tba.id
  );

update public.trader_broker_accounts tba
set verification_instructions = 'Enter your XM client ID (the numeric login used in MT4/MT5). We check it against partner code BANDISHARES05. If XM cannot confirm it automatically, your mentor will review the request.'
from public.portals p
where tba.trader_id = p.trader_id
  and p.slug = 'bandi-shares'
  and tba.partner_code = 'BANDISHARES05';
