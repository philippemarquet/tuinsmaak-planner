import { supabase as integratedClient } from "../integrations/supabase/client";

// Re-export the integrated Supabase client so existing imports keep working
export const supabase = integratedClient;
