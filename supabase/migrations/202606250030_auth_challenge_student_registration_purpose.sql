-- Extend auth_challenge_events.purpose CHECK constraint to allow 'student_registration'.
-- Required for EP-017 inline student registration OTP audit trail.
ALTER TABLE public.auth_challenge_events
  DROP CONSTRAINT auth_challenge_events_purpose_check,
  ADD CONSTRAINT auth_challenge_events_purpose_check
    CHECK (purpose = ANY (ARRAY[
      'invitation'::text,
      'signup'::text,
      'recovery'::text,
      'email_change'::text,
      'account_setup'::text,
      'student_registration'::text
    ]));
