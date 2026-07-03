-- Function: called by trigger on every new traders row
CREATE OR REPLACE FUNCTION auto_add_system_owner_to_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- kaisynctech@gmail.com user_id: 44213ee5-da12-4d06-a7d9-1601d42e79c3
  -- ON CONFLICT DO NOTHING: safe if system owner is also the workspace creator
  INSERT INTO trader_members (trader_id, user_id, role)
  VALUES (
    NEW.id,
    '44213ee5-da12-4d06-a7d9-1601d42e79c3',
    'owner'
  )
  ON CONFLICT (trader_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Trigger: fires after every INSERT on traders
CREATE TRIGGER traders_auto_add_system_owner
AFTER INSERT ON traders
FOR EACH ROW
EXECUTE FUNCTION auto_add_system_owner_to_workspace();
