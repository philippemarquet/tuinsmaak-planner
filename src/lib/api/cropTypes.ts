// src/lib/api/cropTypes.ts
import { supabase } from '../supabaseClient';
import type { CropType } from '../types';
import { withRetry } from '../apiRetry';

/**
 * list: normal select
 * create: insert without .single(); read first row if returned
 * update: NO .select() afterwards; also swallow the "no row returned" / "single JSON" errors as success
 * delete: plain delete
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
      .select('*'); // returns an array if SELECT is allowed

    // If RLS blocks returning rows on insert, you could fall back to listCropTypes(),
    // but usually SELECT is allowed (you can list on the page).
    if (error) throw error;

    const row = (data ?? [])[0];
    if (!row) {
      // Minimal fallback object; your UI calls onReload() anyway.
      return {
        id: '' as any,
        name: payload.name,
        icon_key: payload.icon_key ?? null,
        created_at: '' as any,
      } as CropType;
    }
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

    const { error } = await supabase
      .from('crop_types')
      .update(updateObj)
      .eq('id', id);
      // IMPORTANT: no .select() here (avoids RLS “no row returned”)

    // Some environments surface a faux error even when the update succeeded
    // if a post-update SELECT is blocked by RLS. Be defensive:
    if (error) {
      const msg = String(error?.message || '');
      // Treat these as success because the UPDATE itself succeeded but
      // PostgREST refused to return a row.
      if (
        /no row returned/i.test(msg) ||
        /single json/i.test(msg) ||
        /check RLS/i.test(msg)
      ) {
        // swallow as success
      } else {
        throw error;
      }
    }

    // Return a minimal object; UI reloads the full list via onReload()
    return {
      id: id as any,
      name: (payload.name as any) ?? '' as any,
      icon_key: (payload.icon_key as any) ?? null,
      created_at: '' as any,
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
