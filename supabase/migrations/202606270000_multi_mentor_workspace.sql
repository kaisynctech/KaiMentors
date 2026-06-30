-- EP-049: Multi-mentor workspace support

-- 1. Add role column to trader_members
ALTER TABLE public.trader_members
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'mentor'
    CHECK (role IN ('owner', 'mentor'));

UPDATE public.trader_members SET role = 'owner';

-- 2. Add mentor_user_id to mentor_availability
ALTER TABLE public.mentor_availability
  ADD COLUMN IF NOT EXISTS mentor_user_id uuid REFERENCES auth.users(id);

UPDATE public.mentor_availability ma
SET mentor_user_id = (
  SELECT user_id FROM public.trader_members
  WHERE trader_id = ma.trader_id
  ORDER BY created_at
  LIMIT 1
)
WHERE mentor_user_id IS NULL;

ALTER TABLE public.mentor_availability
  ALTER COLUMN mentor_user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS mentor_availability_mentor_user_id_idx
  ON public.mentor_availability(mentor_user_id);

-- 3. Add mentor_user_id to availability_overrides
ALTER TABLE public.availability_overrides
  ADD COLUMN IF NOT EXISTS mentor_user_id uuid REFERENCES auth.users(id);

UPDATE public.availability_overrides ao
SET mentor_user_id = (
  SELECT user_id FROM public.trader_members
  WHERE trader_id = ao.trader_id
  ORDER BY created_at
  LIMIT 1
)
WHERE mentor_user_id IS NULL;

ALTER TABLE public.availability_overrides
  ALTER COLUMN mentor_user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS availability_overrides_mentor_user_id_idx
  ON public.availability_overrides(mentor_user_id);

-- 4. Add mentor_user_id to bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS mentor_user_id uuid REFERENCES auth.users(id);

UPDATE public.bookings b
SET mentor_user_id = (
  SELECT user_id FROM public.trader_members
  WHERE trader_id = b.trader_id
  ORDER BY created_at
  LIMIT 1
)
WHERE mentor_user_id IS NULL;

CREATE INDEX IF NOT EXISTS bookings_mentor_user_id_idx
  ON public.bookings(mentor_user_id);

-- 5. Workspace invitations table
CREATE TABLE IF NOT EXISTS public.workspace_invitations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id    uuid NOT NULL REFERENCES public.traders(id) ON DELETE CASCADE,
  email        text NOT NULL,
  invited_by   uuid NOT NULL REFERENCES auth.users(id),
  accepted_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "owners_select_invitations"
  ON public.workspace_invitations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trader_members
      WHERE trader_id = workspace_invitations.trader_id
        AND user_id = auth.uid()
        AND role = 'owner'
    )
  );

CREATE POLICY IF NOT EXISTS "owners_delete_invitations"
  ON public.workspace_invitations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.trader_members
      WHERE trader_id = workspace_invitations.trader_id
        AND user_id = auth.uid()
        AND role = 'owner'
    )
  );

-- INSERT/UPDATE done via service role (admin client) — no RLS policy needed for those.

-- 6. Helper function to look up auth user id by email
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(input_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT id FROM auth.users WHERE email = input_email LIMIT 1;
$$;
