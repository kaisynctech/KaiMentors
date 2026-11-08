-- Studio was briefly R250; lock the student price at R249.

update public.student_subscription_plans
set amount_cents = 24900, updated_at = now()
where slug = 'studio'
  and portal_id = (
    select id from public.portals where slug = 'kaisync-institution'
  );
