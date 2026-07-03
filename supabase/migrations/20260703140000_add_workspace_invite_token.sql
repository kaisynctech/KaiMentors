-- EP-090: Permanent workspace invite token
-- Adds one UUID per workspace. Existing rows each get a unique random token.
-- UNIQUE constraint prevents collisions; NOT NULL prevents null tokens.

ALTER TABLE public.traders
  ADD COLUMN IF NOT EXISTS invite_token UUID
    DEFAULT gen_random_uuid()
    UNIQUE
    NOT NULL;
