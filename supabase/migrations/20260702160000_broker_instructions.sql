ALTER TABLE public.trader_broker_accounts
  ADD COLUMN IF NOT EXISTS new_account_instructions      TEXT,
  ADD COLUMN IF NOT EXISTS new_account_image_path        TEXT,
  ADD COLUMN IF NOT EXISTS new_account_video_path        TEXT,
  ADD COLUMN IF NOT EXISTS existing_account_instructions TEXT,
  ADD COLUMN IF NOT EXISTS existing_account_image_path   TEXT,
  ADD COLUMN IF NOT EXISTS existing_account_video_path   TEXT;

CREATE POLICY "students can read active broker accounts for their portal"
  ON public.trader_broker_accounts
  FOR SELECT
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.student_applications sa
      JOIN public.portals p ON p.id = sa.portal_id
      WHERE sa.student_user_id = auth.uid()
        AND sa.status IN ('pending', 'verified')
        AND p.trader_id = public.trader_broker_accounts.trader_id
    )
  );
