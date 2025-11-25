-- Update display names voor bestaande accounts
UPDATE public.profiles 
SET display_name = CASE 
  WHEN id = (SELECT id FROM auth.users WHERE email = 'ph.g.marquet@gmail.com') THEN 'Philippe'
  WHEN id = (SELECT id FROM auth.users WHERE email = 'n.e.j.m.hamers@hotmail.com') THEN 'Nikki'
  ELSE display_name
END
WHERE id IN (
  SELECT id FROM auth.users WHERE email IN ('ph.g.marquet@gmail.com', 'n.e.j.m.hamers@hotmail.com')
);