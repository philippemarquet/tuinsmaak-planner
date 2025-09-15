import { supabase } from "../supabaseClient";
import type { GardenBed, UUID } from "../types";

/** Alle bakken van een tuin */
export async function listBeds(gardenId: UUID): Promise<GardenBed[]> {
  const { data, error } = await supabase
    .from("garden_beds")
    .select("*")
    .eq("garden_id", gardenId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as GardenBed[];
}

/** Nieuwe bak */
export async function createBed(fields: Partial<GardenBed>): Promise<GardenBed> {
  const { data, error } = await supabase
    .from("garden_beds")
    .insert(fields as any)
    .select("*")
    .single();
  if (error) throw error;
  return data as GardenBed;
}

/** Bak updaten (named export) */
export async function updateBed(id: UUID, patch: Partial<GardenBed>): Promise<GardenBed> {
  const { data, error } = await supabase
    .from("garden_beds")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as GardenBed;
}

/** Bak verwijderen */
export async function deleteBed(id: UUID): Promise<void> {
  const { error } = await supabase.from("garden_beds").delete().eq("id", id);
  if (error) throw error;
}

/** Bak dupliceren (handig knopje) */
export async function duplicateBed(id: UUID): Promise<GardenBed> {
  const { data, error } = await supabase
    .from("garden_beds")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;

  const src = data as GardenBed;
  const insert: Partial<GardenBed> = {
    garden_id: src.garden_id,
    name: `${src.name} (kopie)`,
    width_cm: src.width_cm,
    length_cm: src.length_cm,
    segments: src.segments,
    is_greenhouse: src.is_greenhouse,
    // klein offsetje zodat hij niet exact bovenop ligt:
    location_x: (src.location_x ?? 0) + 10,
    location_y: (src.location_y ?? 0) + 10,
  };

  const { data: created, error: err2 } = await supabase
    .from("garden_beds")
    .insert(insert as any)
    .select("*")
    .single();
  if (err2) throw err2;
  return created as GardenBed;
}
