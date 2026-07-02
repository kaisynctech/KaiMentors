ALTER TABLE public.trader_members
  DROP CONSTRAINT trader_members_role_check;

ALTER TABLE public.trader_members
  ADD CONSTRAINT trader_members_role_check
  CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text, 'support'::text, 'mentor'::text]));
