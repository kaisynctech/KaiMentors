-- Per-portal academy modules: KaiTrades gets every catalog feature enabled.
-- Other academies keep current JSON (empty {} still means core modules on via app defaults).

update public.portals
set student_portal_features = coalesce(student_portal_features, '{}'::jsonb) || jsonb_build_object(
  'courses', true,
  'community', true,
  'live_classes', true,
  'bookings', true,
  'groups', true,
  'messages', true,
  'resources', true,
  'broker', true
)
where slug = 'kaitrades';
