// src/lib/conflicts.ts
import type { Planting, GardenBed } from "./types";

// Day-inclusive interval overlap (YYYY-MM-DD dates treated as local dates)
export function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart <= bEnd && bStart <= aEnd;
}

// Segment overlap where segments are contiguous integers; adjacency is allowed.
export function segmentsOverlap(aStartSeg: number, aUsed: number, bStartSeg: number, bUsed: number) {
  const aEnd = aStartSeg + Math.max(1, aUsed) - 1;
  const bEnd = bStartSeg + Math.max(1, bUsed) - 1;
  return aStartSeg <= bEnd && bStartSeg <= aEnd;
}

export function parseISO(iso?: string | null): Date | null {
  return iso ? new Date(iso) : null;
}

export function occupancyWindow(p: Planting): { start: Date | null; end: Date | null } {
  const start = parseISO(p.planned_date ?? undefined);
  const end = parseISO(p.planned_harvest_end ?? undefined);
  return { start, end };
}

/** Build conflict map: for each planting, list of other plantings that overlap in
 *  (bed, date interval, segments). We *only* consider planned_date..planned_harvest_end.
 */
export function buildConflictsMap(plantings: Planting[]): Map<string, Planting[]> {
  const byBed = new Map<string, Planting[]>();
  for (const p of plantings) {
    if (!p.garden_bed_id) continue;
    if (!byBed.has(p.garden_bed_id)) byBed.set(p.garden_bed_id, []);
    byBed.get(p.garden_bed_id)!.push(p);
  }

  const result = new Map<string, Planting[]>();
  for (const list of byBed.values()) {
    // Compare all pairs within the same bed
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const aw = occupancyWindow(a);
      if (!aw.start || !aw.end) continue;
      const aSeg = a.start_segment ?? 0;
      const aUsed = a.segments_used ?? 1;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const bw = occupancyWindow(b);
        if (!bw.start || !bw.end) continue;
        const bSeg = b.start_segment ?? 0;
        const bUsed = b.segments_used ?? 1;
        if (!intervalsOverlap(aw.start, aw.end, bw.start, bw.end)) continue;
        if (!segmentsOverlap(aSeg, aUsed, bSeg, bUsed)) continue;
        // Mark conflict both ways
        if (!result.has(a.id)) result.set(a.id, []);
        if (!result.has(b.id)) result.set(b.id, []);
        result.get(a.id)!.push(b);
        result.get(b.id)!.push(a);
      }
    }
  }
  return result;
}

export function conflictsFor(plantingId: string, conflictsMap: Map<string, Planting[]>): Planting[] {
  return conflictsMap.get(plantingId) ?? [];
}

export function countUniqueConflicts(conflictsMap: Map<string, Planting[]>): number {
  // Count each unordered pair once
  const seen = new Set<string>();
  let count = 0;
  for (const [id, arr] of conflictsMap) {
    for (const other of arr) {
      const key = id < other.id ? id + "|" + other.id : other.id + "|" + id;
      if (!seen.has(key)) {
        seen.add(key);
        count++;
      }
    }
  }
  return count;
}

export function bedHasConflict(bedId: string, conflictsMap: Map<string, Planting[]>, plantings: Planting[]): boolean {
  const idsInBed = new Set(plantings.filter(p => p.garden_bed_id === bedId).map(p => p.id));
  for (const [pid, arr] of conflictsMap) {
    if (!idsInBed.has(pid)) continue;
    for (const other of arr) {
      if (idsInBed.has(other.id)) return true;
    }
  }
  return false;
}
