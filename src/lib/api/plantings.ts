import { supabase } from '../supabaseClient';
import type { Planting, UUID } from '../types';

export async function listPlantings(gardenId: UUID): Promise<Planting[]> {
  const { data, error } = await supabase
    .from('plantings')
    .select('*')
    .eq('garden_id', gardenId)
    .order('planned_sow_date', { ascending: false });
  if (error) throw error;
  return data as Planting[];
}

export async function createPlanting(p: Partial<Planting>): Promise<Planting> {
  const { data, error } = await supabase
    .from('plantings')
    .insert(p)
    .select('*')
    .single();
  if (error) throw error;
  return data as Planting;
}

export async function updatePlanting(id: UUID, patch: Partial<Planting>): Promise<Planting> {
  const { data, error } = await supabase
    .from('plantings')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Planting;
}

export async function deletePlanting(id: UUID) {
  const { error } = await supabase.from('plantings').delete().eq('id', id);
  if (error) throw error;
}
