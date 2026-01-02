import { supabase } from "../supabaseClient";
import type { UUID } from "../types";

export interface PlotObject {
  id: UUID;
  garden_id: UUID;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string | null;
  z_index: number;
  created_at?: string;
  updated_at?: string;
}

/** Alle plattegrond-objecten voor een tuin */
export async function listPlotObjects(gardenId: UUID): Promise<PlotObject[]> {
  const { data, error } = await supabase
    .from("garden_plot_objects")
    .select("*")
    .eq("garden_id", gardenId)
    .order("z_index", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PlotObject[];
}

/** Nieuw object aanmaken */
export async function createPlotObject(
  fields: Omit<PlotObject, "id" | "created_at" | "updated_at">
): Promise<PlotObject> {
  const { data, error } = await supabase
    .from("garden_plot_objects")
    .insert(fields as any)
    .select("*")
    .single();
  if (error) throw error;
  return data as PlotObject;
}

/** Object updaten */
export async function updatePlotObject(
  id: UUID,
  patch: Partial<Omit<PlotObject, "id" | "garden_id" | "created_at" | "updated_at">>
): Promise<PlotObject> {
  const { data, error } = await supabase
    .from("garden_plot_objects")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Object niet gevonden of geen toegang");
  return data as PlotObject;
}

/** Object verwijderen */
export async function deletePlotObject(id: UUID): Promise<void> {
  const { error } = await supabase
    .from("garden_plot_objects")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
