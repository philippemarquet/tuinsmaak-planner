import { supabase } from '../supabaseClient';
import type { GardenBed, UUID } from '../types';

export async function listBeds(gardenId: UUID): Promise<GardenBed[]> {
  const { data, error } = await supabase
    .from('garden_beds')
    .select('*')
    .eq('garden_id', gardenId)
    .order('is_greenhouse', { ascending: true }) // eerst buiten, dan kas (we splitsen in UI alsnog)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data as GardenBed[];
}

export async function createBed(fields: Partial<GardenBed>): Promise<GardenBed> {
  const { data, error } = await supabase
    .from('garden_beds')
    .insert(fields)
    .select('*')
    .single();
  if (error) throw error;
  return data as GardenBed;
}

export async function updateBed(id: UUID, fields: Partial<GardenBed>): Promise<GardenBed> {
  const { data, error } = await supabase
    .from('garden_beds')
    .update(fields)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as GardenBed;
}

export async function deleteBed(id: UUID): Promise<void> {
  const { error } = await supabase.from('garden_beds').delete().eq('id', id);
  if (error) throw error;
}
