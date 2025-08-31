import { supabase } from '../supabaseClient';
import type { Task, UUID } from '../types';

export async function tasksUpcoming(gardenId: UUID, daysAhead = 14): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('garden_id', gardenId)
    .gte('due_date', new Date().toISOString().slice(0, 10))
    .lte(
      'due_date',
      new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    )
    .order('due_date');
  if (error) throw error;
  return data as Task[];
}

export async function setTaskStatus(id: UUID, status: Task['status']) {
  const { error } = await supabase.from('tasks').update({ status }).eq('id', id);
  if (error) throw error;
}
