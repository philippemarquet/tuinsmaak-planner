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

/** Eén taak bijwerken (robust tegen “no row returned”) */
export async function updateTask(
  id: UUID,
  values: Partial<Task>
): Promise<Task> {
  // 1) Probeer update + return row (kan soms leeg zijn door RLS/trigger)
  let { data, error } = await supabase
    .from("tasks")
    .update(values)
    .eq("id", id)
    .select("*")
    .maybeSingle(); // voorkomt “single()” errors bij 0 rows

  if (error) throw error;

  // 2) Fallback: sommige setups sturen na UPDATE geen rij terug; dan refetchen we.
  if (!data) {
    const { data: refetched, error: refetchErr } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (refetchErr) throw refetchErr;
    if (!refetched) throw new Error("Task update succeeded but no row could be fetched");
    data = refetched;
  }

  return data as Task;
}
