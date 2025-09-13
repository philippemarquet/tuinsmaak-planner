// src/lib/api/plantings.ts
import { supabase } from "../supabaseClient";
import type { Planting } from "../types";

export async function listPlantings(garden_id: string): Promise<Planting[]> {
  const { data, error } = await supabase
    .from("plantings")
    .select("*")
    .eq("garden_id", garden_id)
    .order("planned_date", { ascending: true });
  if (error) throw error;
  return (data || []) as Planting[];
}

type CreatePlantingInput = {
  seed_id: string;
  garden_id: string;
  garden_bed_id: string;
  method: "direct" | "presow";
  planned_date: string; // YYYY-MM-DD
  planned_harvest_start: string;
  planned_harvest_end: string;
  start_segment: number;
  segments_used: number;
  color?: string | null;
  status?: string;
};

export async function createPlanting(input: CreatePlantingInput): Promise<Planting> {
  const { data, error } = await supabase
    .from("plantings")
    .insert(input)
    .select("*")
    .single();
  if (error) throw error;
  return data as Planting;
}

type UpdatePlantingInput = Partial<Pick<
  CreatePlantingInput,
  "method" | "planned_date" | "planned_harvest_start" | "planned_harvest_end" |
  "start_segment" | "segments_used" | "color" | "status"
>>;

export async function updatePlanting(id: string, input: UpdatePlantingInput): Promise<Planting> {
  const { data, error } = await supabase
    .from("plantings")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as Planting;
}

export async function deletePlanting(id: string): Promise<void> {
  const { error } = await supabase
    .from("plantings")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
