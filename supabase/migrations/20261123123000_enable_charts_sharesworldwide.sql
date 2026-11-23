-- Turn on Live chart for Sharesworldwide.
update public.portals
set student_portal_features =
  coalesce(student_portal_features, '{}'::jsonb) || '{"charts": true}'::jsonb
where slug = 'bandi-shares';
