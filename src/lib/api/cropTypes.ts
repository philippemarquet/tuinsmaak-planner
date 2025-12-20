// src/lib/api/cropTypes.ts
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

/**
 * Nieuw gewastype aanmaken.
 * Let op: we gebruiken .maybeSingle() om PostgREST “single object” errors te vermijden
 * wanneer RLS geen body terug laat geven.
 *
 * We ondersteunen verschillende icon-velden; alleen aanwezige keys worden doorgeschoven.
 * (Gebruik er gewoon één in je schema, bv. icon_key)
 */
type CreatePayload = {
  name: string;
} & Partial<{
  icon_key: string | null;
  icon_url: string | null;
  icon_slug: string | null;
}>;

export async function createCropType(payload: CreatePayload): Promise<CropType | null> {
  return withRetry(async () => {
    const toInsert: Record<string, any> = { name: payload.name };
    if ('icon_key' in payload) toInsert.icon_key = payload.icon_key ?? null;
    if ('icon_url' in payload) toInsert.icon_url = payload.icon_url ?? null;
    if ('icon_slug' in payload) toInsert.icon_slug = payload.icon_slug ?? null;

    const { data, error } = await supabase
      .from('crop_types')
      .insert(toInsert)
      .select('*')
      .maybeSingle(); // ⬅️ geen hard error bij 0 rows

    if (error) throw error;
    return (data ?? null) as CropType | null;
  });
}

/**
 * Gewastype bijwerken.
 * Ook hier .maybeSingle() om hetzelfde probleem te voorkomen.
 */
type UpdatePayload = Partial<{
  name: string;
  icon_key: string | null;
  icon_url: string | null;
  icon_slug: string | null;
}>;

export async function updateCropType(id: string, payload: UpdatePayload): Promise<CropType | null> {
  return withRetry(async () => {
    const toUpdate: Record<string, any> = {};
    if ('name' in payload) toUpdate.name = payload.name;
    if ('icon_key' in payload) toUpdate.icon_key = payload.icon_key;
    if ('icon_url' in payload) toUpdate.icon_url = payload.icon_url;
    if ('icon_slug' in payload) toUpdate.icon_slug = payload.icon_slug;

    const { data, error } = await supabase
      .from('crop_types')
      .update(toUpdate)
      .eq('id', id)
      .select('*')
      .maybeSingle(); // ⬅️ tolerant

    if (error) throw error;
    return (data ?? null) as CropType | null;
  });
}

/** Gewastype verwijderen */
export async function deleteCropType(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('crop_types').delete().eq('id', id);
    if (error) throw error;
  });
}
