import { supabase } from '../supabaseClient';
import type { Seed, UUID } from '../types';
import { withRetry } from '../apiRetry';

export async function listSeeds(gardenId: UUID): Promise<Seed[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('seeds')
      .select('*')
      .eq('garden_id', gardenId)
      .order('name', { ascending: true });
    if (error) throw error;
    return ((data || []) as any[]).map((row) => ({
      ...(row as any),
      direct_plant_months: (row as any).direct_plant_months ?? (row as any).direct_sow_months ?? [],
      greenhouse_months: (row as any).greenhouse_months ?? [],
    })) as Seed[];
  });
}

export async function createSeed(fields: Partial<Seed>): Promise<Seed> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('seeds')
      .insert([fields as any])
      .select('*')
      .single();
    if (error) throw error;
    return ({
      ...(data as any),
      direct_plant_months: (data as any).direct_plant_months ?? (data as any).direct_sow_months ?? [],
      greenhouse_months: (data as any).greenhouse_months ?? [],
    }) as Seed;
  });
}

export async function updateSeed(id: UUID, fields: Partial<Seed>): Promise<Seed> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('seeds')
      .update(fields)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return ({
      ...(data as any),
      direct_plant_months: (data as any).direct_plant_months ?? (data as any).direct_sow_months ?? [],
      greenhouse_months: (data as any).greenhouse_months ?? [],
    }) as Seed;
  });
}

export async function deleteSeed(id: UUID): Promise<void> {
  const { error } = await supabase.from('seeds').delete().eq('id', id);
  if (error) throw error;
}
