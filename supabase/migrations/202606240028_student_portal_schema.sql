-- EP-014: Student Portal Schema
-- Adds verification_instructions, verification_screenshot_path,
-- broker guide DB function, and storage policies for resubmission uploads.

-- 1. verification_instructions on trader_broker_accounts
-- Mentor-authored guidance shown to students in the portal broker guide card.
ALTER TABLE public.trader_broker_accounts
  ADD COLUMN IF NOT EXISTS verification_instructions TEXT;

-- 2. verification_screenshot_path on student_applications
-- Path in verification-proofs bucket for a portal resubmission upload.
-- Distinct from screenshot_path which stores the registration-time proof.
ALTER TABLE public.student_applications
  ADD COLUMN IF NOT EXISTS verification_screenshot_path TEXT;

-- 3. get_student_broker_guide(p_portal_id)
-- Returns safe broker account fields to authenticated students who hold
-- any application (any status) for the given portal. Never exposes partner_code.
CREATE OR REPLACE FUNCTION public.get_student_broker_guide(p_portal_id uuid)
RETURNS TABLE (
  id uuid,
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
    tba.affiliate_link,
    tba.verification_method,
    tba.verification_instructions
  FROM public.portals p
  JOIN public.trader_broker_accounts tba
    ON tba.trader_id = p.trader_id
    AND tba.is_active = true
  WHERE p.id = p_portal_id
  LIMIT 1;
END;
$$;

-- 4. Storage INSERT policy: students upload resubmission proofs
-- Path: {trader_id}/{student_user_id}/resubmission/{filename}
-- Only permitted when application status requires action from the student.
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
        'manual_review'::public.verification_status,
        'needs_more_information'::public.verification_status
      )
  )
);

-- 5. Storage UPDATE policy: students may replace their resubmission proof
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
        'manual_review'::public.verification_status,
        'needs_more_information'::public.verification_status
      )
  )
);

-- 6. Storage SELECT policy: students and reviewers read resubmission proofs
CREATE POLICY "students and reviewers read resubmission proofs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'verification-proofs'
  AND (storage.foldername(name))[3] = 'resubmission'
  AND (
    (
      (storage.foldername(name))[2]::uuid = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.student_applications sa
        WHERE sa.trader_id = (storage.foldername(name))[1]::uuid
          AND sa.student_user_id = auth.uid()
      )
    )
    OR public.is_trader_member((storage.foldername(name))[1]::uuid)
    OR public.is_super_admin()
  )
);
