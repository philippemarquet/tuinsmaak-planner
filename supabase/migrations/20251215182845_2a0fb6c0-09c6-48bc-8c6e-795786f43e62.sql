-- Verwijder de oude check constraint die alleen week 1-5 toestond
ALTER TABLE public.garden_tasks DROP CONSTRAINT IF EXISTS garden_tasks_due_week_check;

-- Voeg een nieuwe constraint toe die ISO weeknummers 1-53 toestaat
ALTER TABLE public.garden_tasks ADD CONSTRAINT garden_tasks_due_week_check 
  CHECK (due_week IS NULL OR (due_week >= 1 AND due_week <= 53));