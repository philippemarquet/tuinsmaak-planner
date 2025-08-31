import { supabase } from "../supabaseClient";
import type { GardenBed, UUID } from "../types";

/**
 * Alle bakken ophalen voor een tuin
 */
export async function listBeds(gardenId: UUID): Promise<GardenBed[]> {
  const { data, error } = await supabase
    .from("garden_beds")
    .select("*")
    .eq("garden_id", gardenId)
    .order("name");

  if (error) throw error;
  return data as GardenBed[];
}

/**
 * Eén bak ophalen
 */
export async function getBed(id: UUID): Promise<GardenBed | null> {
  const { data, error } = await supabase
    .from("garden_beds")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as GardenBed;
}

/**
 * Nieuwe bak aanmaken
 */
export async function createBed(values: Partial<GardenBed>): Promise<GardenBed> {
  const { data, error } = await supabase
    .from("garden_beds")
    .insert([values])
    .select()
    .single();

  if (error) throw error;
  return data as GardenBed;
}

/**
 * Bak bijwerken
 */
export async function updateBed(
  id: UUID,
  values: Partial<GardenBed>
): Promise<GardenBed> {
  const { data, error } = await supabase
    .from("garden_beds")
    .update(values)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as GardenBed;
}

/**
 * Bak verwijderen
 */
export async function deleteBed(id: UUID): Promise<void> {
  const { error } = await supabase.from("garden_beds").delete().eq("id", id);
  if (error) throw error;
}
