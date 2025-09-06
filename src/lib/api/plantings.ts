import { supabase } from '../supabaseClient';
import type { Planting, UUID } from '../types';

export async function listPlantings(gardenId: UUID): Promise<Planting[]> {
  const { data, error } = await supabase
    .from('plantings')
    .select('*')
    .eq('garden_id', gardenId)
    .order('planned_plant_date', { ascending: true });
  if (error) throw error;
  return data as Planting[];
}

export async function createPlanting(fields: Partial<Planting>): Promise<Planting> {
  // Belangrijk: select('*').single() — zo krijg je de door de BEFORE-trigger
  // ingevulde planned_sow_date / planned_harvest_* meteen terug.
  const { data, error } = await supabase
    .from('plantings')
    .insert([fields])
    .select('*')
    .single();
  if (error) throw error;
  return data as Planting;
}

export async function updatePlanting(id: UUID, fields: Partial<Planting>): Promise<Planting> {
  const { data, error } = await supabase
    .from('plantings')
    .update(fields)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Planting;
}

export async function deletePlanting(id: UUID): Promise<void> {
  const { error } = await supabase.from('plantings').delete().eq('id', id);
  if (error) throw error;
}
