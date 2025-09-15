// src/lib/api/tasks.ts
import { supabase } from "../supabaseClient";
import type { Task, UUID } from "../types";

/**
 * Alle taken voor een tuin ophalen.
 * Optioneel filter je op status en/of datumrange (YYYY-MM-DD).
 */
export async function listTasks(
  gardenId: UUID,
  opts?: { status?: Task["status"] | Task["status"][]; from?: string; to?: string }
): Promise<Task[]> {
  let q = supabase.from("tasks").select("*").eq("garden_id", gardenId);

  if (opts?.status) {
    if (Array.isArray(opts.status)) q = q.in("status", opts.status);
    else q = q.eq("status", opts.status);
  }
  if (opts?.from) q = q.gte("due_date", opts.from);
  if (opts?.to) q = q.lte("due_date", opts.to);

  const { data, error } = await q.order("due_date", { ascending: true });
  if (error) throw error;
  return (data as Task[]) ?? [];
}

/**
 * Handig voor het dashboard: alleen open taken in de komende N dagen.
 * Default: 14 dagen vooruit.
 */
export async function listUpcomingTasks(
  gardenId: UUID,
  daysAhead = 14
): Promise<Task[]> {
  const today = new Date();
  const startISO = today.toISOString().slice(0, 10);
  const end = new Date(today);
  end.setDate(end.getDate() + daysAhead);
  const endISO = end.toISOString().slice(0, 10);

  return listTasks(gardenId, { status: ["pending"], from: startISO, to: endISO });
}

/**
 * Eén taak bijwerken – zonder .single() zodat Supabase geen “Cannot coerce …”
 * geeft wanneer triggers meerdere rows/kolommen teruggeven.
 */
export async function updateTask(
  id: UUID,
  values: Partial<Task> | Record<string, unknown>
): Promise<Task> {
  const { data, error } = await supabase
    .from("tasks")
    .update(values)
    .eq("id", id)
    .select("*")
    .limit(1); // i.p.v. .single()

  if (error) throw error;
  const row = (data as Task[] | null)?.[0];
  if (!row) throw new Error("Task update returned no row");
  return row;
}

/**
 * Taak afronden met optionele datum (YYYY-MM-DD). Zonder argument = nu.
 * Schrijft status=done en completed_at; DB-triggers mogen vervolgens
 * actual_* datums op plantings bijwerken.
 */
export async function completeTask(
  id: UUID,
  completedDateISO?: string
): Promise<Task> {
  const completed_at = completedDateISO
    ? new Date(`${completedDateISO}T00:00:00Z`).toISOString()
    : new Date().toISOString();

  return updateTask(id, { status: "done", completed_at } as Record<string, unknown>);
}

/** Taak heropenen (terug naar pending) */
export async function reopenTask(id: UUID): Promise<Task> {
  return updateTask(id, { status: "pending", completed_at: null } as Record<string, unknown>);
}

/** Taak overslaan (status=skipped) */
export async function skipTask(id: UUID): Promise<Task> {
  return updateTask(id, { status: "skipped", completed_at: new Date().toISOString() } as Record<string, unknown>);
}

/** Taak verwijderen */
export async function deleteTask(id: UUID): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}
