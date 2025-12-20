// src/lib/api/cropTypes.ts
import { supabase } from '../supabaseClient';
import type { CropType } from '../types';
import { withRetry } from '../apiRetry';

/** Alle gewastypen ophalen (incl. optionele icon_key) */
export async function listCropTypes(): Promise<CropType[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('crop_types')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []) as CropType[];
  });
}

/** Nieuw gewastype aanmaken (zonder .single()) */
export async function createCropType(payload: { name: string; icon_key?: string | null }): Promise<CropType> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('crop_types')
      .insert({
        name: payload.name,
        icon_key: payload.icon_key ?? null,
      })
      .select('*'); // ← geen .single()

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (row) return row as CropType;

    // Fallback (zou zelden nodig moeten zijn)
    const { data: refetch, error: refetchErr } = await supabase
      .from('crop_types')
      .select('*')
      .eq('name', payload.name)
      .order('created_at', { ascending: false })
      .limit(1);
    if (refetchErr) throw refetchErr;
    return (refetch?.[0] ?? null) as CropType;
  });
}

/** Gewastype bijwerken (zonder .single(), met fallback-read) */
export async function updateCropType(
  id: string,
  payload: Partial<{ name: string; icon_key: string | null }>
): Promise<CropType> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('crop_types')
      .update({
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.icon_key !== undefined ? { icon_key: payload.icon_key } : {}),
      })
      .eq('id', id)
      .select('*'); // ← geen .single()

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (row) return row as CropType;

    // Fallback: lees de rij opnieuw
    const { data: refetch, error: refetchErr } = await supabase
      .from('crop_types')
      .select('*')
      .eq('id', id)
      .limit(1);
    if (refetchErr) throw refetchErr;
    return (refetch?.[0] ?? null) as CropType;
  });
}

/** Gewastype verwijderen */
export async function deleteCropType(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('crop_types').delete().eq('id', id);
    if (error) throw error;
  });
}
