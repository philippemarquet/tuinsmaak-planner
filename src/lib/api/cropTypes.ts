// src/lib/api/cropTypes.ts
import { supabase } from '../supabaseClient';
import type { CropType } from '../types';
import { withRetry } from '../apiRetry';

/**
 * Notes
 * - list: normal select (already works)
 * - create: use .insert().select() and read first row (no .single())
 * - update: do NOT call .select() afterwards (avoids RLS “no row returned”).
 *           Return a minimal object; UI reloads list anyway.
 * - delete: plain delete.
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
      .select('*'); // returns an array

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

    // IMPORTANT: no .select() here (avoids RLS “no row returned” issue)
    const { error } = await supabase
      .from('crop_types')
      .update(updateObj)
      .eq('id', id);

    if (error) throw error;

    // Return a minimal object; the UI calls onReload() after save anyway.
    return {
      id,
      name: (payload.name as any) ?? '',     // will be replaced by onReload() data
      icon_key: (payload.icon_key as any) ?? null,
      created_at: ''                          // placeholder; not used by UI list
    } as CropType;
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
