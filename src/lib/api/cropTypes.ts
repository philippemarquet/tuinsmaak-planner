// src/lib/api/cropTypes.ts
import { supabase } from '../supabaseClient';
import type { CropType } from '../types';
import { withRetry } from '../apiRetry';

/** Alle gewastypen ophalen (incl. optionele icon_slug) */
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

/** Nieuw gewastype aanmaken (⚠️ geen .single() om PostgREST-coerce error te vermijden) */
export async function createCropType(payload: { name: string; icon_slug?: string | null }): Promise<CropType> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('crop_types')
      .insert({
        name: payload.name,
        icon_slug: payload.icon_slug ?? null,
      })
      .select('*'); // <-- geen .single()
    if (error) throw error;
    // Neem eerste rij indien aanwezig (UI doet daarna toch onReload())
    return (Array.isArray(data) ? (data[0] as CropType) : (data as unknown as CropType))!;
  });
}

/** Gewastype bijwerken (⚠️ geen .single()) */
export async function updateCropType(
  id: string,
  payload: Partial<{ name: string; icon_slug: string | null }>
): Promise<CropType> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('crop_types')
      .update({
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.icon_slug !== undefined ? { icon_slug: payload.icon_slug } : {}),
      })
      .eq('id', id)
      .select('*'); // <-- geen .single()
    if (error) throw error;
    return (Array.isArray(data) ? (data[0] as CropType) : (data as unknown as CropType))!;
  });
}

/** Gewastype verwijderen */
export async function deleteCropType(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('crop_types').delete().eq('id', id);
    if (error) throw error;
  });
}
