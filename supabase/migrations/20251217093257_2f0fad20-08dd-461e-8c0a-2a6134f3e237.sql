-- Create audit status enum type
CREATE TYPE public.audit_status AS ENUM ('open', 'onderhanden', 'afwachting', 'goedgekeurd');

-- Create audits table
CREATE TABLE public.audits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  garden_id UUID NOT NULL REFERENCES public.gardens(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL,
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deadline TIMESTAMP WITH TIME ZONE NOT NULL,
  status audit_status NOT NULL DEFAULT 'open',
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create audit_items table for individual validation items
CREATE TABLE public.audit_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_id UUID NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL, -- 'planting', 'moestuin_task', 'garden_task', 'voorzaai'
  reference_id UUID, -- optional reference to planting/task id
  bed_name TEXT,
  segment_info TEXT,
  description TEXT NOT NULL,
  phase TEXT, -- 'groeiend', 'in_oogst', 'voorzaai', 'overdue'
  is_validated BOOLEAN DEFAULT false,
  is_correct BOOLEAN,
  notes TEXT,
  validated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create audit_status_history table to track status changes
CREATE TABLE public.audit_status_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_id UUID NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  old_status audit_status,
  new_status audit_status NOT NULL,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  changed_by UUID
);

-- Enable RLS
ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_status_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for audits - garden members can manage
CREATE POLICY "Garden members manage audits"
ON public.audits
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM garden_users gu
    WHERE gu.garden_id = audits.garden_id
    AND gu.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM garden_users gu
    WHERE gu.garden_id = audits.garden_id
    AND gu.user_id = auth.uid()
  )
);

-- RLS policies for audit_items
CREATE POLICY "Garden members manage audit_items"
ON public.audit_items
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM audits a
    JOIN garden_users gu ON gu.garden_id = a.garden_id
    WHERE a.id = audit_items.audit_id
    AND gu.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM audits a
    JOIN garden_users gu ON gu.garden_id = a.garden_id
    WHERE a.id = audit_items.audit_id
    AND gu.user_id = auth.uid()
  )
);

-- RLS policies for audit_status_history
CREATE POLICY "Garden members view audit history"
ON public.audit_status_history
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM audits a
    JOIN garden_users gu ON gu.garden_id = a.garden_id
    WHERE a.id = audit_status_history.audit_id
    AND gu.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM audits a
    JOIN garden_users gu ON gu.garden_id = a.garden_id
    WHERE a.id = audit_status_history.audit_id
    AND gu.user_id = auth.uid()
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_audits_updated_at
BEFORE UPDATE ON public.audits
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for faster lookups
CREATE INDEX idx_audits_garden_id ON public.audits(garden_id);
CREATE INDEX idx_audits_status ON public.audits(status);
CREATE INDEX idx_audit_items_audit_id ON public.audit_items(audit_id);