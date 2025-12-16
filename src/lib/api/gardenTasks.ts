import { supabase } from "@/integrations/supabase/client";
import type { GardenTask } from "../types";

export async function listGardenTasks(gardenId: string): Promise<GardenTask[]> {
  const { data, error } = await supabase
    .from("garden_tasks")
    .select("*")
    .eq("garden_id", gardenId)
    .order("due_year", { ascending: true })
    .order("due_month", { ascending: true })
    .order("due_week", { ascending: true, nullsFirst: true });

  if (error) throw error;
  return (data ?? []) as GardenTask[];
}

export async function createGardenTask(
  task: Omit<GardenTask, "id" | "created_at" | "updated_at" | "completed_at">
): Promise<GardenTask> {
  const { data, error } = await supabase
    .from("garden_tasks")
    .insert(task)
    .select()
    .single();

  if (error) throw error;
  return data as GardenTask;
}

export async function updateGardenTask(
  id: string,
  values: Partial<Omit<GardenTask, "id" | "created_at" | "updated_at">>
): Promise<GardenTask> {
  const { data, error } = await supabase
    .from("garden_tasks")
    .update(values)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as GardenTask;
}

export async function deleteGardenTask(id: string): Promise<void> {
  const { error } = await supabase.from("garden_tasks").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteCompletedGardenTasks(gardenId: string): Promise<number> {
  const { data, error } = await supabase
    .from("garden_tasks")
    .delete()
    .eq("garden_id", gardenId)
    .eq("status", "done")
    .select("id");

  if (error) throw error;
  return data?.length ?? 0;
}

export async function completeGardenTask(id: string): Promise<GardenTask> {
  const { data, error } = await supabase
    .from("garden_tasks")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as GardenTask;
}

export async function reopenGardenTask(id: string): Promise<GardenTask> {
  const { data, error } = await supabase
    .from("garden_tasks")
    .update({ status: "pending", completed_at: null })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as GardenTask;
}
