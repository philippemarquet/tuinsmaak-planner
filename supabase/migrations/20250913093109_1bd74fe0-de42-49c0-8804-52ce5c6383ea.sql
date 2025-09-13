-- Zorg ervoor dat iedereen toegang heeft tot de hoofdtuin
-- Voeg automatisch alle gebruikers toe aan de hoofdtuin wanneer ze inloggen

-- Functie om gebruiker automatisch toe te voegen aan de hoofdtuin
CREATE OR REPLACE FUNCTION public.ensure_user_in_main_garden()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Voeg gebruiker toe aan de hoofdtuin als ze er nog niet in staan
  INSERT INTO public.garden_users (garden_id, user_id, role)
  VALUES ('c2ebf1fb-5aa9-4eac-87a8-099e9cea8790', NEW.id, 'member')
  ON CONFLICT (garden_id, user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Trigger om nieuwe gebruikers automatisch toe te voegen aan hoofdtuin
DROP TRIGGER IF EXISTS ensure_main_garden_access ON auth.users;
CREATE TRIGGER ensure_main_garden_access
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_user_in_main_garden();

-- Voeg ook alle bestaande gebruikers toe die er nog niet in staan
INSERT INTO public.garden_users (garden_id, user_id, role)
SELECT 'c2ebf1fb-5aa9-4eac-87a8-099e9cea8790', au.id, 'member'
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.garden_users gu 
  WHERE gu.garden_id = 'c2ebf1fb-5aa9-4eac-87a8-099e9cea8790' 
  AND gu.user_id = au.id
)
ON CONFLICT (garden_id, user_id) DO NOTHING;