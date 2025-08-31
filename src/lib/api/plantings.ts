import { supabase } from "../supabaseClient";
import type { Planting, UUID } from "../types";

// Nieuwe planting aanmaken
export async function createPlanting(fields: Partial<Planting>): Promise<Planting> {
  const { data, error } = await supabase
    .from("plantings")
    .insert(fields)
    .select()
    .single();
  if (error) throw error;
  return data as Planting;
}

// Plantings van een garden ophalen
export async function listPlantings(gardenId: UUID): Promise<Planting[]> {
  const { data, error } = await supabase
    .from("plantings")
    .select("*")
    .eq("garden_id", gardenId);
  if (error) throw error;
  return data as Planting[];
}

// Een planting verwijderen
export async function deletePlanting(id: UUID) {
  const { error } = await supabase.from("plantings").delete().eq("id", id);
  if (error) throw error;
}
