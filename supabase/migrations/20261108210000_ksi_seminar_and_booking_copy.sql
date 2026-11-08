-- KSI plan copy: two AI seminars a week on every plan, Sunday business
-- seminar + one free 1:1 on Studio, extra 1:1 at R49 / 45 min.

update public.student_subscription_plans p
set
  name = v.name,
  amount_cents = v.amount_cents,
  description = v.description,
  features = v.features,
  updated_at = now()
from (
  values
    (
      'library',
      'Library',
      9900,
      'All recorded courses, two AI seminars a week, AI tools, and community. Extra 1:1 is R49 per 45 minutes.',
      '{"courses": true, "ai_tools": true, "community": true, "resources": true, "ai_seminars_per_week": 2, "sunday_business_seminar": false, "free_one_to_one_per_month": 0, "one_to_one_price_zar": 49}'::jsonb
    ),
    (
      'scholar',
      'Scholar',
      14900,
      'Everything in Library plus one marked assignment each month.',
      '{"courses": true, "ai_tools": true, "community": true, "resources": true, "ai_seminars_per_week": 2, "sunday_business_seminar": false, "free_one_to_one_per_month": 0, "one_to_one_price_zar": 49, "marked_assignment_per_month": 1}'::jsonb
    ),
    (
      'studio',
      'Studio',
      24900,
      'Everything in Scholar plus the Sunday business seminar, one free 45-minute 1:1 each month, and eligibility for the public showcase.',
      '{"courses": true, "ai_tools": true, "community": true, "resources": true, "ai_seminars_per_week": 2, "sunday_business_seminar": true, "free_one_to_one_per_month": 1, "one_to_one_price_zar": 49}'::jsonb
    )
) as v(slug, name, amount_cents, description, features)
where p.slug = v.slug
  and p.portal_id = (
    select id from public.portals where slug = 'kaisync-institution'
  );
