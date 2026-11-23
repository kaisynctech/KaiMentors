-- Turn on Live chart for every forex academy. Sharesworldwide and KaiSync
-- Institution stay off.
update public.portals
set student_portal_features =
  coalesce(student_portal_features, '{}'::jsonb) || '{"charts": true}'::jsonb
where slug in ('pasii', 'kaitrades', 'milkers-fx', 'traders-confidence');
