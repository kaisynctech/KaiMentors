-- ─────────────────────────────────────────────────────────────────────────────
-- invite_mentor_to_workspace
-- Called by POST /api/workspace/mentors
-- Runs as caller's authenticated JWT; auth.uid() provides identity.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.invite_mentor_to_workspace(
  p_trader_id uuid,
  p_email     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id        uuid;
  v_caller_role      text;
  v_existing_user_id uuid;
  v_invitation_id    uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized', 'http_status', 401);
  END IF;
  p_email := lower(trim(p_email));
  -- Self-invite guard
  IF EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = v_caller_id AND email = p_email
  ) THEN
    RETURN jsonb_build_object('error', 'self_invite', 'http_status', 400);
  END IF;
  -- Caller must be owner of this workspace
  SELECT role INTO v_caller_role
  FROM public.trader_members
  WHERE trader_id = p_trader_id AND user_id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role <> 'owner' THEN
    RETURN jsonb_build_object('error', 'unauthorized', 'http_status', 403);
  END IF;
  -- Check if email is already a member of this workspace
  SELECT id INTO v_existing_user_id
  FROM auth.users
  WHERE email = p_email;
  IF v_existing_user_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.trader_members
      WHERE trader_id = p_trader_id AND user_id = v_existing_user_id
    ) THEN
      RETURN jsonb_build_object('error', 'already_member', 'http_status', 409);
    END IF;
  END IF;
  -- Check for a pending invitation
  IF EXISTS (
    SELECT 1 FROM public.workspace_invitations
    WHERE trader_id = p_trader_id
      AND email      = p_email
      AND accepted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('error', 'already_invited', 'http_status', 409);
  END IF;
  -- Create the invitation row
  INSERT INTO public.workspace_invitations (trader_id, email, invited_by)
  VALUES (p_trader_id, p_email, v_caller_id)
  RETURNING id INTO v_invitation_id;
  RETURN jsonb_build_object('ok', true, 'invitation_id', v_invitation_id::text);
END;
$$;
GRANT EXECUTE ON FUNCTION public.invite_mentor_to_workspace(uuid, text)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- remove_mentor_from_workspace
-- Called by DELETE /api/workspace/mentors/[userId]
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.remove_mentor_from_workspace(
  p_trader_id      uuid,
  p_target_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id   uuid;
  v_caller_role text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized', 'http_status', 401);
  END IF;
  -- Self-remove guard
  IF v_caller_id = p_target_user_id THEN
    RETURN jsonb_build_object('error', 'self_remove', 'http_status', 400);
  END IF;
  -- Caller must be owner
  SELECT role INTO v_caller_role
  FROM public.trader_members
  WHERE trader_id = p_trader_id AND user_id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role <> 'owner' THEN
    RETURN jsonb_build_object('error', 'unauthorized', 'http_status', 403);
  END IF;
  -- Block if mentor has upcoming confirmed bookings
  IF EXISTS (
    SELECT 1 FROM public.bookings
    WHERE trader_id      = p_trader_id
      AND mentor_user_id = p_target_user_id
      AND status         = 'confirmed'
      AND starts_at      > NOW()
  ) THEN
    RETURN jsonb_build_object('error', 'has_bookings', 'http_status', 409);
  END IF;
  -- Delete the membership
  DELETE FROM public.trader_members
  WHERE trader_id = p_trader_id AND user_id = p_target_user_id;
  RETURN jsonb_build_object('ok', true, 'removed', p_target_user_id::text);
END;
$$;
GRANT EXECUTE ON FUNCTION public.remove_mentor_from_workspace(uuid, uuid)
  TO authenticated;
