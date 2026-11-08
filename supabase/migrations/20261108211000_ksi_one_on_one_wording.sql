-- Public-facing copy: say "one on one session", not "1:1".

update public.student_subscription_plans p
set
  description = v.description,
  updated_at = now()
from (
  values
    (
      'library',
      'All recorded courses, two AI seminars a week, AI tools, and community. Extra one on one sessions are R49 per 45 minutes.'
    ),
    (
      'scholar',
      'Everything in Library plus one marked assignment each month.'
    ),
    (
      'studio',
      'Everything in Scholar plus the Sunday business seminar, one free 45-minute one on one session each month, and eligibility for the public showcase.'
    )
) as v(slug, description)
where p.slug = v.slug
  and p.portal_id = (
    select id from public.portals where slug = 'kaisync-institution'
  );
