// src/lib/api/seeds.ts
import { supabase } from '../supabaseClient';
import type { Seed, UUID } from '../types';
import { withRetry } from '../apiRetry';

/** Alle zaden voor een tuin (inclusief normalisatie van maandvelden) */
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
      // behoud backward-compat: gebruik direct_sow_months als fallback
      direct_plant_months:
        (row as any).direct_plant_months ?? (row as any).direct_sow_months ?? [],
      greenhouse_months: (row as any).greenhouse_months ?? [],
      // icon_key komt gewoon mee uit select('*')
    })) as Seed[];
  });
}

/** Zaad aanmaken (geeft de volledige rij terug, incl. icon_key) */
export async function createSeed(fields: Partial<Seed>): Promise<Seed> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('seeds')
      // array-variant laat je huidige stijl intact
      .insert([fields as any])
      .select('*')
      .single();

    if (error) throw error;

    return {
      ...(data as any),
      direct_plant_months:
        (data as any).direct_plant_months ?? (data as any).direct_sow_months ?? [],
      greenhouse_months: (data as any).greenhouse_months ?? [],
    } as Seed;
  });
}

/** Zaad bijwerken op id (geeft de volledige rij terug, incl. icon_key) */
export async function updateSeed(id: UUID, fields: Partial<Seed>): Promise<Seed> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('seeds')
      .update(fields as any)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;

    return {
      ...(data as any),
      direct_plant_months:
        (data as any).direct_plant_months ?? (data as any).direct_sow_months ?? [],
      greenhouse_months: (data as any).greenhouse_months ?? [],
    } as Seed;
  });
}

/** Zaad verwijderen */
export async function deleteSeed(id: UUID): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('seeds').delete().eq('id', id);
    if (error) throw error;
  });
}
