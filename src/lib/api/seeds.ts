import { supabase } from '../supabaseClient';
import type { Seed, UUID } from '../types';

export async function listSeeds(gardenId: UUID): Promise<Seed[]> {
  const { data, error } = await supabase
    .from('seeds')
    .select('*')
    .eq('garden_id', gardenId)
    .order('name');
  if (error) throw error;
  return data as Seed[];
}

export async function createSeed(seed: Partial<Seed>): Promise<Seed> {
  const { data, error } = await supabase
    .from('seeds')
    .insert(seed)
    .select('*')
    .single();
  if (error) throw error;
  return data as Seed;
}

export async function updateSeed(id: UUID, patch: Partial<Seed>): Promise<Seed> {
  const { data, error } = await supabase
    .from('seeds')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Seed;
}

export async function deleteSeed(id: UUID) {
  const { error } = await supabase.from('seeds').delete().eq('id', id);
  if (error) throw error;
}
