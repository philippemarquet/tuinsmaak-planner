import { supabase } from '../supabaseClient';
import type { BedOccupancyWeek, UUID } from '../types';

export async function occupancyBetween(
  gardenId: UUID,
  fromISO: string,
  toISO: string
): Promise<BedOccupancyWeek[]> {
  const { data, error } = await supabase
    .from('bed_occupancy_by_week')
    .select('*')
    .eq('garden_id', gardenId)
    .gte('week_start', fromISO)
    .lte('week_start', toISO)
    .order('week_start');
  if (error) throw error;
  return data as BedOccupancyWeek[];
}

export async function occupancyCurrentWeeks(gardenId: UUID, weeks = 8) {
  const start = new Date();
  const to = new Date(Date.now() + weeks * 7 * 24 * 60 * 60 * 1000);
  return occupancyBetween(
    gardenId,
    start.toISOString().slice(0, 10),
    to.toISOString().slice(0, 10)
  );
}
