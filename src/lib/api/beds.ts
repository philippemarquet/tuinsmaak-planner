import { supabase } from '../supabaseClient';
import type { GardenBed, UUID } from '../types';

export async function listBeds(gardenId: UUID): Promise<GardenBed[]> {
  const { data, error } = await supabase
    .from('garden_beds')
    .select('*')
    .eq('garden_id', gardenId)
    .order('name');
  if (error) throw error;
  return data as GardenBed[];
}

export async function createBed(bed: Partial<GardenBed>): Promise<GardenBed> {
  const { data, error } = await supabase
    .from('garden_beds')
    .insert(bed)
    .select('*')
    .single();
  if (error) throw error;
  return data as GardenBed;
}

export async function updateBed(id: UUID, patch: Partial<GardenBed>): Promise<GardenBed> {
  const { data, error } = await supabase
    .from('garden_beds')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as GardenBed;
}

export async function deleteBed(id: UUID) {
  const { error } = await supabase.from('garden_beds').delete().eq('id', id);
  if (error) throw error;
}
