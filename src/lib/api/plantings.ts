import { supabase } from "../supabaseClient";
import type { Planting, UUID } from "../types";

/**
 * Alle plantings ophalen voor een tuin
 */
export async function listPlantings(gardenId: UUID): Promise<Planting[]> {
  const { data, error } = await supabase
    .from("plantings")
    .select("*")
    .eq("garden_id", gardenId)
    .order("planned_sow_date", { ascending: true });

  if (error) throw error;
  return data as Planting[];
}

/**
 * Eén planting ophalen
 */
export async function getPlanting(id: UUID): Promise<Planting | null> {
  const { data, error } = await supabase
    .from("plantings")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // not found
    throw error;
  }
  return data as Planting;
}

/**
 * Nieuwe planting maken
 */
export async function createPlanting(values: Partial<Planting>): Promise<Planting> {
  const { data, error } = await supabase
    .from("plantings")
    .insert([
      {
        status: "planned", // default status
        ...values,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data as Planting;
}

/**
 * Planting bijwerken
 */
export async function updatePlanting(
  id: UUID,
  values: Partial<Planting>
): Promise<Planting> {
  const { data, error } = await supabase
    .from("plantings")
    .update(values)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Planting;
}

/**
 * Planting verwijderen
 */
export async function deletePlanting(id: UUID): Promise<void> {
  const { error } = await supabase.from("plantings").delete().eq("id", id);
  if (error) throw error;
}
