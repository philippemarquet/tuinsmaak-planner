import { supabase } from '../supabaseClient';
import type { Seed, UUID } from '../types';

export async function listSeeds(gardenId: UUID): Promise<Seed[]> {
  const { data, error } = await supabase
    .from('seeds')
    .select('*')
    .eq('garden_id', gardenId)
    .order('name', { ascending: true });
  if (error) throw error;
  return data as Seed[];
}

export async function createSeed(fields: Partial<Seed>): Promise<Seed> {
  const { data, error } = await supabase
    .from('seeds')
    .insert([fields as any])
    .select('*')
    .single();
  if (error) throw error;
  return data as Seed;
}

export async function updateSeed(id: UUID, fields: Partial<Seed>): Promise<Seed> {
  const { data, error } = await supabase
    .from('seeds')
    .update(fields)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Seed;
}

export async function deleteSeed(id: UUID): Promise<void> {
  const { error } = await supabase.from('seeds').delete().eq('id', id);
  if (error) throw error;
}
