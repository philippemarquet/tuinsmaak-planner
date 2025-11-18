-- Add greenhouse_months field to seeds table
ALTER TABLE seeds ADD COLUMN IF NOT EXISTS greenhouse_months integer[] DEFAULT '{}';

COMMENT ON COLUMN seeds.greenhouse_months IS 'Maanden waarin gezaaid/geplant kan worden in de kas';