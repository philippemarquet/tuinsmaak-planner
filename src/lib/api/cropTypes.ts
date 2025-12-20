// src/lib/api/cropTypes.ts
import { supabase } from '../supabaseClient';
import type { CropType } from '../types';
import { withRetry } from '../apiRetry';

/**
 * BELANGRIJK:
 * - Geen `.single()` meer na insert/update -> dat veroorzaakte "Cannot coerce the result to a single JSON object".
 * - We gebruiken `.select('*')` en pakken het eerste element als resultaat.
 * - Velden: alleen { id, name, icon_key }.
 */

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

export async function createCropType(payload: {
  name: string;
  icon_key?: string | null;
}): Promise<CropType> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('crop_types')
      .insert({
        name: payload.name,
        icon_key: payload.icon_key ?? null,
      })
      .select('*'); // <-- array terug

    if (error) throw error;
    const row = (data ?? [])[0];
    if (!row) throw new Error('Insert succeeded but no row returned.');
    return row as CropType;
  });
}

export async function updateCropType(
  id: string,
  payload: Partial<{ name: string; icon_key: string | null }>
): Promise<CropType> {
  return withRetry(async () => {
    const updateObj: Record<string, any> = {};
    if (payload.name !== undefined) updateObj.name = payload.name;
    if (payload.icon_key !== undefined) updateObj.icon_key = payload.icon_key;

    const { data, error } = await supabase
      .from('crop_types')
      .update(updateObj)
      .eq('id', id)
      .select('*'); // <-- array terug

    if (error) throw error;
    const row = (data ?? [])[0];
    if (!row) throw new Error('Update succeeded but no row returned (check RLS).');
    return row as CropType;
  });
}

export async function deleteCropType(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase
      .from('crop_types')
      .delete()
      .eq('id', id);

    if (error) throw error;
  });
}
