// src/lib/api/tasks.ts
import { supabase } from "../supabaseClient";
import type { Task, UUID } from "../types";

/** Alle taken voor een tuin ophalen */
export async function listTasks(gardenId: UUID): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("garden_id", gardenId)
    .order("due_date", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Task[];
}

/**
 * Eén taak bijwerken
 * Let op: geen .select() na UPDATE om RLS/trigger issues te vermijden.
 */
export async function updateTask(
  id: UUID,
  values: Partial<Task>
): Promise<void> {
  const { error } = await supabase
    .from("tasks")
    .update(values)
    .eq("id", id);

  if (error) throw error;
}
