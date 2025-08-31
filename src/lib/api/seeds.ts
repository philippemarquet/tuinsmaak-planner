import { supabase } from "../supabaseClient";
import type { Seed, UUID } from "../types";

/**
 * Alle zaden ophalen voor een tuin
 */
export async function listSeeds(gardenId: UUID): Promise<Seed[]> {
  const { data, error } = await supabase
    .from("seeds")
    .select("*")
    .eq("garden_id", gardenId)
    .order("name");

  if (error) throw error;
  return data as Seed[];
}

/**
 * Eén zaad ophalen
 */
export async function getSeed(id: UUID): Promise<Seed | null> {
  const { data, error } = await supabase
    .from("seeds")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // not found
    throw error;
  }
  return data as Seed;
}

/**
 * Nieuw zaad aanmaken
 */
export async function createSeed(values: Partial<Seed>): Promise<Seed> {
  const { data, error } = await supabase
    .from("seeds")
    .insert([
      {
        stock_status: "adequate",
        ...values,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data as Seed;
}

/**
 * Zaad bijwerken
 */
export async function updateSeed(
  id: UUID,
  values: Partial<Seed>
): Promise<Seed> {
  const { data, error } = await supabase
    .from("seeds")
    .update(values)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Seed;
}

/**
 * Zaad verwijderen
 */
export async function deleteSeed(id: UUID): Promise<void> {
  const { error } = await supabase.from("seeds").delete().eq("id", id);
  if (error) throw error;
}
