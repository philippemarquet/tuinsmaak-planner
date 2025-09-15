// lib/api/tasks.ts
import { supabase } from "./supabase";
import type { Task } from "../types";

export async function updateTask(id: string, patch: Partial<Task>) {
  // 1) Do the update WITHOUT .select().single() (this avoids the coercion error)
  const { error: upErr } = await supabase
    .from("tasks")
    .update(patch)
    .eq("id", id);
  if (upErr) throw upErr;

  // 2) Fetch the single row explicitly
  const { data, error: selErr } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .single(); // now it's a plain SELECT, safe to coerce to one
  if (selErr) throw selErr;

  return data as Task;
}
