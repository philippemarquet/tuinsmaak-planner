-- Create garden_tasks table for general garden tasks
CREATE TABLE public.garden_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garden_id UUID REFERENCES public.gardens(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_month INTEGER NOT NULL CHECK (due_month >= 1 AND due_month <= 12),
  due_week INTEGER CHECK (due_week IS NULL OR (due_week >= 1 AND due_week <= 5)),
  due_year INTEGER NOT NULL,
  is_recurring BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.garden_tasks ENABLE ROW LEVEL SECURITY;

-- RLS policy: garden members can manage their garden's tasks
CREATE POLICY "Garden members manage garden_tasks"
ON public.garden_tasks
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.garden_users gu
    WHERE gu.garden_id = garden_tasks.garden_id
    AND gu.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.garden_users gu
    WHERE gu.garden_id = garden_tasks.garden_id
    AND gu.user_id = auth.uid()
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_garden_tasks_updated_at
BEFORE UPDATE ON public.garden_tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();