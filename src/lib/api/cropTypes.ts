import { supabase } from '../supabaseClient';
import type { CropType } from '../types';
import { withRetry } from '../apiRetry';

/** Alle gewastypen ophalen */
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

/** Nieuw gewastype aanmaken (alleen icon_key) */
export async function createCropType(payload: {
  name: string;
  /** path binnen 'crop-icons' bucket, bv 'tomato.svg' */
  icon_key?: string | null;
}): Promise<CropType> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('crop_types')
      .insert({
        name: payload.name,
        icon_key: payload.icon_key ?? null,
      })
      .select('*')
      .single(); // <- essentieel voor "single JSON object"
    if (error) throw error;
    return data as CropType;
  });
}

/** Gewastype bijwerken (alleen icon_key) */
export async function updateCropType(
  id: string,
  payload: Partial<{ name: string; icon_key: string | null }>
): Promise<CropType> {
  return withRetry(async () => {
    const updateObj: any = {};
    if (payload.name !== undefined)     updateObj.name = payload.name;
    if (payload.icon_key !== undefined) updateObj.icon_key = payload.icon_key;

    const { data, error } = await supabase
      .from('crop_types')
      .update(updateObj)
      .eq('id', id)
      .select('*')
      .single(); // <- essentieel
    if (error) throw error;
    return data as CropType;
  });
}

/** Gewastype verwijderen */
export async function deleteCropType(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('crop_types').delete().eq('id', id);
    if (error) throw error;
  });
}
