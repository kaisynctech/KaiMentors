-- EP-019: Fix student list two bugs:
-- 1. Add full_name to student_applications so registration-form name is persisted.
-- 2. Convert INNER JOINs to LEFT JOINs so broker-less students appear in the list.

ALTER TABLE public.student_applications
  ADD COLUMN full_name TEXT NULL;

DROP FUNCTION IF EXISTS public.get_student_applications_page(
  uuid,
  public.verification_status[],
  text,
  uuid,
  public.verification_method,
  integer,
  integer
);

CREATE FUNCTION public.get_student_applications_page(
  target_trader_id uuid,
  target_statuses public.verification_status[] DEFAULT NULL,
  target_search text DEFAULT NULL,
  target_broker_id uuid DEFAULT NULL,
  target_verification_method public.verification_method DEFAULT NULL,
  target_limit integer DEFAULT 25,
  target_offset integer DEFAULT 0
)
RETURNS TABLE (
  application_id uuid,
  application_status public.verification_status,
  status_reason text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  review_version integer,
  phone_number text,
  trading_account_number text,
  platform_account_number text,
  screenshot_path text,
  student_name text,
  student_email text,
  profile_phone text,
  broker_id uuid,
  broker_name text,
  verification_method public.verification_method,
  trading_level text,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    application.id,
    application.status,
    application.status_reason,
    application.submitted_at,
    application.reviewed_at,
    application.review_version,
    application.phone_number,
    application.trading_account_number,
    application.platform_account_number,
    application.screenshot_path,
    COALESCE(application.full_name, profile.full_name),
    profile.email,
    profile.phone,
    broker.id,
    broker.name,
    connection.verification_method,
    application.trading_level,
    COUNT(*) OVER()
  FROM public.student_applications application
  JOIN public.profiles profile
    ON profile.id = application.student_user_id
  LEFT JOIN public.trader_broker_accounts connection
    ON connection.id = application.trader_broker_account_id
    AND connection.trader_id = application.trader_id
  LEFT JOIN public.brokers broker
    ON broker.id = connection.broker_id
  WHERE application.trader_id = target_trader_id
    AND (
      public.is_super_admin()
      OR public.is_trader_member(target_trader_id)
    )
    AND (
      target_statuses IS NULL
      OR application.status = ANY(target_statuses)
    )
    AND (
      target_broker_id IS NULL
      OR broker.id = target_broker_id
    )
    AND (
      target_verification_method IS NULL
      OR connection.verification_method = target_verification_method
    )
    AND (
      NULLIF(TRIM(target_search), '') IS NULL
      OR CONCAT_WS(
        ' ',
        COALESCE(application.full_name, profile.full_name),
        profile.email,
        profile.phone,
        application.phone_number,
        application.trading_account_number,
        application.platform_account_number
      ) ILIKE '%' || TRIM(target_search) || '%'
    )
  ORDER BY application.submitted_at DESC, application.id DESC
  LIMIT LEAST(GREATEST(target_limit, 1), 100)
  OFFSET GREATEST(target_offset, 0);
$$;

GRANT EXECUTE ON FUNCTION public.get_student_applications_page(
  uuid, public.verification_status[], text, uuid, public.verification_method, integer, integer
) TO authenticated;
