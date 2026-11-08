-- KSI student plans: Library R99, Scholar R149, Studio R250.
-- Zero live student_subscriptions rows at apply time, so plan_id values can change.

alter table public.student_subscriptions
  drop constraint if exists student_subscriptions_plan_id_check;

alter table public.student_subscriptions
  add constraint student_subscriptions_plan_id_check
  check (plan_id in ('library', 'scholar', 'studio'));

update public.student_subscription_plans p
set
  name = v.name,
  slug = v.slug,
  description = v.description,
  amount_cents = v.amount_cents,
  features = v.features,
  sort_order = v.sort_order,
  updated_at = now()
from (
  values
    (
      'basic',
      'Library',
      'library',
      'All recorded courses, AI tools directory, community, and business classes — self-paced.',
      9900,
      '{"courses": true, "ai_tools": true, "community": true, "resources": true, "live_seats_per_month": 0, "clinic_reports_per_month": 0}'::jsonb,
      1
    ),
    (
      'intermediate',
      'Scholar',
      'scholar',
      'Everything in Library plus one live lab and one marked assignment each month.',
      14900,
      '{"courses": true, "ai_tools": true, "community": true, "resources": true, "live_classes": true, "live_seats_per_month": 1, "clinic_reports_per_month": 1}'::jsonb,
      2
    ),
    (
      'pro',
      'Studio',
      'studio',
      'Everything in Scholar plus two live labs and three project clinic reports each month.',
      25000,
      '{"courses": true, "ai_tools": true, "community": true, "resources": true, "live_classes": true, "live_seats_per_month": 2, "clinic_reports_per_month": 3}'::jsonb,
      3
    )
) as v(old_slug, name, slug, description, amount_cents, features, sort_order)
where p.slug = v.old_slug
  and p.portal_id = (
    select id from public.portals where slug = 'kaisync-institution'
  );
