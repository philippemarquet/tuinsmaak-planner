// src/lib/api/cropTypes.ts
import { supabase } from "../supabaseClient";
import type { CropType } from "../types";
import { withRetry } from "../apiRetry";

/** Alle gewastypen ophalen (incl. optionele icon_slug) */
export async function listCropTypes(): Promise<CropType[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("crop_types")
      .select("*") // verwacht kolommen: id, name, created_at, icon_slug (nullable)
      .order("name", { ascending: true });

    if (error) throw error;
    return (data ?? []) as CropType[];
  });
}

/** Nieuw gewastype aanmaken */
export async function createCropType(payload: {
  name: string;
  icon_slug?: string | null;
}): Promise<CropType> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("crop_types")
      .insert({
        name: payload.name,
        icon_slug: payload.icon_slug ?? null,
      })
      .select("*")
      .single(); // precies 1 rij terug

    if (error) throw error;
    return data as CropType;
  });
}

/** Gewastype bijwerken (op id) */
export async function updateCropType(
  id: string,
  payload: Partial<{ name: string; icon_slug: string | null }>
): Promise<CropType> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("crop_types")
      .update({
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.icon_slug !== undefined ? { icon_slug: payload.icon_slug } : {}),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    return data as CropType;
  });
}

/** Gewastype verwijderen (op id) */
export async function deleteCropType(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from("crop_types").delete().eq("id", id);
    if (error) throw error;
  });
}

/* (optioneel) default export als je ooit default import zou gebruiken */
const cropTypesApi = {
  listCropTypes,
  createCropType,
  updateCropType,
  deleteCropType,
};
export default cropTypesApi;
