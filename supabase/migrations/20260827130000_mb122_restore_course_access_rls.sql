-- MB-122: Course access control enforcement.
--
-- Verified live before writing this: the grant-aware "students read
-- accessible published courses" policy (can_access_course-based) was NEVER
-- dropped by 202607081800_student_access_policy.sql, contradicting that
-- brief's stated premise. What actually happened: 202607081800 created an
-- additional, permissive "verified students read published courses" policy
-- alongside the existing grant-aware one, without dropping it. Postgres ORs
-- multiple permissive SELECT policies together, so the permissive policy
-- silently overrides the grant-aware one for every restricted/one_to_one
-- course. Running the brief's migration verbatim (CREATE POLICY with the
-- same name as the already-existing correct policy) would have errored.
--
-- Also verified live: this exact same dual-policy bug exists on `lessons`
-- and `resources` too -- contradicting the brief's claim that "the lesson
-- player, modules, content blocks, and resources are all correctly gated."
-- They are not: a student without a grant on a restricted course could
-- still read that course's lesson rows and resource rows directly (not
-- just the course list). Fixing only `courses` would have hidden a
-- restricted course from the list while leaving its lesson content and
-- resources readable by anyone verified. Fixed all three together since
-- they are the same root cause and directly undermine the point of this
-- brief if left half-done.
--
-- Not touched: announcements / live_classes / daily_signals have a similar
-- dual-policy shape ("entitled students read published X" alongside
-- "verified students read published X"), but these are broadcast/module
-- content, not course-linked, and are out of scope for "course access
-- control enforcement" -- flagged in the commit message as a follow-up,
-- not fixed here.

drop policy if exists "verified students read published courses" on public.courses;
drop policy if exists "verified students read published lessons" on public.lessons;
drop policy if exists "verified students read published resources" on public.resources;
