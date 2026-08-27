-- MB-124: Broadcast content RLS fix (announcements & live_classes).
-- Pre-verified live via pg_policies before writing this -- exact policy
-- names on both tables matched what this brief expected (same dual-policy
-- OR-bypass shape as the courses/lessons/resources fix in MB-122).

drop policy if exists "verified students read published announcements" on public.announcements;
drop policy if exists "verified students read published live classes" on public.live_classes;
