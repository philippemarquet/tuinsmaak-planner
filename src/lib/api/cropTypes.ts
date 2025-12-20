// src/lib/api/cropTypes.ts
import { supabase } from "../supabaseClient";
import type { CropType } from "../types";
import { withRetry } from "../apiRetry";

/** Alle gewastypen ophalen (alleen naam/id, geen icon velden nodig) */
export async function listCropTypes(): Promise<CropType[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("crop_types")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as CropType[];
  });
}

/** Nieuw gewastype aanmaken (alleen naam) */
export async function createCropType(payload: { name: string }): Promise<CropType> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("crop_types")
      .insert({ name: payload.name })
      .select("*")
      .single();
    if (error) throw error;
    return data as CropType;
  });
}

/** Gewastype bijwerken (alleen naam) */
export async function updateCropType(id: string, payload: { name: string }): Promise<CropType> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from("crop_types")
      .update({ name: payload.name })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return data as CropType;
  });
}

/** Gewastype verwijderen */
export async function deleteCropType(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from("crop_types").delete().eq("id", id);
    if (error) throw error;
  });
}

const cropTypesApi = {
  listCropTypes,
  createCropType,
  updateCropType,
  deleteCropType,
};
export default cropTypesApi;
