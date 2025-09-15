// src/lib/api/beds.ts
import { supabase } from "../supabaseClient";
import type { GardenBed } from "../types";

/**
 * Robust bed fetch:
 * - Try filtering by garden_id if provided.
 * - If that yields 0 rows, fall back to unfiltered (debug-friendly).
 * - If no garden_id provided, fetch all.
 */
export async function listBeds(garden_id?: string): Promise<GardenBed[]> {
  const selectCols = "*";

  const baseOrder = (q: ReturnType<typeof supabase.from>["select"]) =>
    q
      .order("sort_order", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true });

  async function fetchFiltered(id: string) {
    return baseOrder(
      supabase.from("garden_beds").select(selectCols).eq("garden_id", id)
    );
  }

  async function fetchAll() {
    return baseOrder(supabase.from("garden_beds").select(selectCols));
  }

  // 1) If we got a garden_id, prefer filtered call
  if (garden_id) {
    const { data, error } = await fetchFiltered(garden_id);
    if (error) throw error;
    if (data && data.length > 0) return data as GardenBed[];

    // 2) Fallback to unfiltered if filtered returned nothing
    const { data: all, error: e2 } = await fetchAll();
    if (e2) throw e2;
    console.warn(
      "[listBeds] No rows for garden_id =", garden_id,
      "— fallback returned", all?.length ?? 0, "beds."
    );
    return (all ?? []) as GardenBed[];
  }

  // 3) No garden_id → fetch all
  const { data, error } = await fetchAll();
  if (error) throw error;
  return (data ?? []) as GardenBed[];
}
