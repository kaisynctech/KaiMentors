-- Migration 029: Deferred broker association
-- Signup no longer requires broker details at registration.
-- Broker verification is deferred to the student portal dashboard.

-- 1. Allow student_applications to be created without a broker account.
--    Both columns are currently NOT NULL (confirmed pre-migration).
ALTER TABLE public.student_applications
  ALTER COLUMN trader_broker_account_id DROP NOT NULL;

ALTER TABLE public.student_applications
  ALTER COLUMN broker_account_identifier DROP NOT NULL;

-- 2. Update storage policies so pending students can upload resubmission proofs.
--    Previously only manual_review was permitted. We expand to include pending.
--    Policy names confirmed from migration 028 output before writing DROP statements.
DROP POLICY IF EXISTS "students upload resubmission verification proofs"
  ON storage.objects;

CREATE POLICY "students upload resubmission verification proofs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'verification-proofs'
  AND (storage.foldername(name))[3] = 'resubmission'
  AND (storage.foldername(name))[2]::uuid = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.student_applications sa
    WHERE sa.trader_id = (storage.foldername(name))[1]::uuid
      AND sa.student_user_id = auth.uid()
      AND sa.status IN (
        'pending'::public.verification_status,
        'manual_review'::public.verification_status
      )
  )
);

DROP POLICY IF EXISTS "students update resubmission verification proofs"
  ON storage.objects;

CREATE POLICY "students update resubmission verification proofs"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'verification-proofs'
  AND (storage.foldername(name))[3] = 'resubmission'
  AND (storage.foldername(name))[2]::uuid = auth.uid()
)
WITH CHECK (
  bucket_id = 'verification-proofs'
  AND (storage.foldername(name))[3] = 'resubmission'
  AND (storage.foldername(name))[2]::uuid = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.student_applications sa
    WHERE sa.trader_id = (storage.foldername(name))[1]::uuid
      AND sa.student_user_id = auth.uid()
      AND sa.status IN (
        'pending'::public.verification_status,
        'manual_review'::public.verification_status
      )
  )
);

-- 3. Replace get_student_broker_guide.
--    Must DROP first because the return type (OUT columns) has changed.
DROP FUNCTION IF EXISTS public.get_student_broker_guide(uuid);

-- Replace get_student_broker_guide:
--    - Remove LIMIT 1 to return all active broker connections for the portal.
--    - Add JOIN to brokers for name and logo_path.
--    - Return partner_code (deliberate EP-015 reversal of EP-014 restriction;
--      SECURITY DEFINER gate ensures only students with a valid application
--      for this portal can call the function).
--    - Does NOT return adapter_key or api_config.
CREATE OR REPLACE FUNCTION public.get_student_broker_guide(p_portal_id uuid)
RETURNS TABLE (
  id uuid,
  broker_id uuid,
  broker_name text,
  broker_logo_path text,
  partner_code text,
  affiliate_link text,
  verification_method public.verification_method,
  verification_instructions text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.student_applications sa
    WHERE sa.student_user_id = auth.uid()
      AND sa.portal_id = p_portal_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    tba.id,
    tba.broker_id,
    b.name,
    b.logo_path,
    tba.partner_code,
    tba.affiliate_link,
    tba.verification_method,
    tba.verification_instructions
  FROM public.portals p
  JOIN public.trader_broker_accounts tba
    ON tba.trader_id = p.trader_id
    AND tba.is_active = true
  JOIN public.brokers b
    ON b.id = tba.broker_id
    AND b.is_active = true
  WHERE p.id = p_portal_id
  ORDER BY tba.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_broker_guide(uuid)
  TO authenticated;
