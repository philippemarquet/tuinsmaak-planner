import { supabase } from "../supabaseClient";
import type { UUID, Seed } from "../types";

// Ophalen alle seeds per tuin
export async function listSeeds(gardenId: UUID): Promise<Seed[]> {
  const { data, error } = await supabase
    .from("seeds")
    .select("*")
    .eq("garden_id", gardenId);

  if (error) throw error;
  // Cast losjes naar Seed[]
  return (data ?? []) as unknown as Seed[];
}

// Toevoegen of updaten
export async function saveSeed(id: UUID | undefined, fields: Partial<Seed>): Promise<Seed> {
  if (id) {
    const { data, error } = await supabase
      .from("seeds")
      .update(fields)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as unknown as Seed;
  } else {
    const { data, error } = await supabase
      .from("seeds")
      .insert(fields)
      .select()
      .single();

    if (error) throw error;
    return data as unknown as Seed;
  }
}

// Verwijderen
export async function deleteSeed(id: UUID) {
  const { error } = await supabase.from("seeds").delete().eq("id", id);
  if (error) throw error;
}
