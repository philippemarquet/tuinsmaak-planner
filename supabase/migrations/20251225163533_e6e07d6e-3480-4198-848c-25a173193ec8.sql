-- Fix RLS policy for garden_beds: add WITH CHECK clause for inserts
DROP POLICY IF EXISTS "Garden members manage beds" ON public.garden_beds;

CREATE POLICY "Garden members manage beds" 
ON public.garden_beds 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM garden_users gu 
    WHERE gu.garden_id = garden_beds.garden_id 
    AND gu.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM garden_users gu 
    WHERE gu.garden_id = garden_beds.garden_id 
    AND gu.user_id = auth.uid()
  )
);