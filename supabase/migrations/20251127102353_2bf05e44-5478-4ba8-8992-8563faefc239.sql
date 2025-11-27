-- Voeg calendar_token toe aan profiles tabel
ALTER TABLE public.profiles 
ADD COLUMN calendar_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex');

-- Zorg dat bestaande users ook een token krijgen
UPDATE public.profiles 
SET calendar_token = encode(gen_random_bytes(32), 'hex')
WHERE calendar_token IS NULL;