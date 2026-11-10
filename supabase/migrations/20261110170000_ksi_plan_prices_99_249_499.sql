-- KaiSync Institution student plans: Library R99, Scholar R249, Studio R499.
-- Scoped to this portal. No live subscriptions at apply time.

update public.student_subscription_plans p
set
  amount_cents = v.amount_cents,
  updated_at = now()
from (
  values
    ('library', 9900),
    ('scholar', 24900),
    ('studio', 49900)
) as v(slug, amount_cents)
where p.slug = v.slug
  and p.portal_id = (
    select id from public.portals where slug = 'kaisync-institution'
  );
