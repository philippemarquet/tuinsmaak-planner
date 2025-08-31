import { supabase } from "../supabaseClient";
import type { Task, UUID } from "../types";

/**
 * Alle taken voor een tuin ophalen
 */
export async function listTasks(gardenId: UUID): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("garden_id", gardenId);

  if (error) throw error;
  return data as Task[];
}

/**
 * Eén taak bijwerken
 */
export async function updateTask(
  id: UUID,
  values: Partial<Task>
): Promise<Task> {
  const { data, error } = await supabase
    .from("tasks")
    .update(values)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Task;
}
