-- Voeg alle bestaande gebruikers toe aan de hoofdtuin die er nog niet in staan
INSERT INTO public.garden_users (garden_id, user_id, role)
SELECT 'c2ebf1fb-5aa9-4eac-87a8-099e9cea8790', au.id, 'member'
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.garden_users gu 
  WHERE gu.garden_id = 'c2ebf1fb-5aa9-4eac-87a8-099e9cea8790' 
  AND gu.user_id = au.id
)
ON CONFLICT (garden_id, user_id) DO NOTHING;