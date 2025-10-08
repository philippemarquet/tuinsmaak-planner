// src/lib/conflicts.ts
import type { Planting, Seed } from "./types";

/** 
 * Day-level overlap check for planting occupancy.
 * A planting ending on Sunday and another starting on Monday should NOT overlap.
 * Only overlaps if there's at least one shared day.
 * Example: A ends Sunday, B starts Monday → aEnd < bStart → no overlap ✓
 */
function intervalsOverlapDayInclusive(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  // Overlaps only if: aStart <= bEnd AND bStart <= aEnd
  // But for same-day adjacency (end = start), we want NO overlap
  // So we use strict: aEnd >= bStart means last day of A >= first day of B
  return aStart <= bEnd && bStart <= aEnd;
}

/** Segment-overlap (inclusief): [start, start+used-1] kruist */
function segmentsOverlapInclusive(aStartSeg: number, aUsed: number, bStartSeg: number, bUsed: number) {
  const aEnd = aStartSeg + aUsed - 1;
  const bEnd = bStartSeg + bUsed - 1;
  return aStartSeg <= bEnd && bStartSeg <= aEnd;
}

type Window = { start: Date | null; end: Date | null };

/**
 * Occupancy window:
 * - Start = (actual_ground_date ?? calculated from actual_presow_date ?? planned_date)
 * - End   = (actual_harvest_end ?? calculated from new ground date ?? planned_harvest_end)
 * We nemen 'actual' voorkeur, berekenen indien nodig, en vallen terug op 'planned'.
 */
export function occupancyWindow(p: Planting, seed?: Seed): Window {
  let startISO: string | null = null;
  let endISO: string | null = null;

  // Bepaal start datum
  if (p.actual_ground_date) {
    startISO = p.actual_ground_date;
  } else if (p.actual_presow_date && seed?.presow_duration_weeks) {
    // Bereken nieuwe ground date op basis van actual presow + duration
    const actualPresowDate = new Date(p.actual_presow_date);
    if (!isNaN(actualPresowDate.getTime())) {
      const newGroundDate = new Date(actualPresowDate);
      newGroundDate.setDate(newGroundDate.getDate() + (seed.presow_duration_weeks * 7));
      startISO = newGroundDate.toISOString().split('T')[0];
    }
  } else {
    startISO = p.planned_date;
  }

  // Bepaal eind datum
  if (p.actual_harvest_end) {
    endISO = p.actual_harvest_end;
  } else if (startISO && p.actual_presow_date && seed?.harvest_duration_weeks) {
    // Als we een nieuwe ground date hebben berekend, bereken ook nieuwe harvest end
    const groundDate = new Date(startISO);
    if (!isNaN(groundDate.getTime())) {
      const newHarvestEnd = new Date(groundDate);
      newHarvestEnd.setDate(newHarvestEnd.getDate() + (seed.harvest_duration_weeks * 7));
      endISO = newHarvestEnd.toISOString().split('T')[0];
    }
  } else {
    endISO = p.planned_harvest_end;
  }

  if (!startISO || !endISO) return { start: null, end: null };

  const start = new Date(startISO);
  const end   = new Date(endISO);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return { start: null, end: null };

  // Normaliseer naar 00:00 zodat dag-inclusie overal hetzelfde werkt
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return { start, end };
}

function sameBed(a: Planting, b: Planting) {
  return a.garden_bed_id && b.garden_bed_id && a.garden_bed_id === b.garden_bed_id;
}

function segStart(p: Planting) { return Math.max(0, p.start_segment ?? 0); }
function segUsed(p: Planting)  { return Math.max(1, p.segments_used ?? 1); }

/**
 * Kern: geeft voor elk planting.id de lijst met andere plantingen waarmee een conflict bestaat.
 * Een conflict = (zelfde bak) ∧ (datums overlappen dag-inclusief) ∧ (segmenten overlappen).
 */
export function buildConflictsMap(plantings: Planting[], seeds: Seed[] = []): Map<string, Planting[]> {
  const map = new Map<string, Planting[]>();
  for (const p of plantings) map.set(p.id, []);

  // Maak seed lookup map
  const seedsById = new Map<string, Seed>();
  for (const seed of seeds) {
    seedsById.set(seed.id, seed);
  }

  const n = plantings.length;
  for (let i = 0; i < n; i++) {
    const a = plantings[i];
    const seedA = seedsById.get(a.seed_id);
    const wa = occupancyWindow(a, seedA);
    if (!wa.start || !wa.end) continue;

    for (let j = i + 1; j < n; j++) {
      const b = plantings[j];
      if (!sameBed(a, b)) continue;

      const seedB = seedsById.get(b.seed_id);
      const wb = occupancyWindow(b, seedB);
      if (!wb.start || !wb.end) continue;

      // Datums overlappen?
      if (!intervalsOverlapDayInclusive(wa.start, wa.end, wb.start, wb.end)) continue;

      // Segmenten overlappen?
      if (!segmentsOverlapInclusive(segStart(a), segUsed(a), segStart(b), segUsed(b))) continue;

      // Conflict! Voeg tweezijdig toe
      map.get(a.id)!.push(b);
      map.get(b.id)!.push(a);
    }
  }

  return map;
}

/** Handig voor banners: tel unieke conflictparen (i<j) ipv dubbel tellen. */
export function countUniqueConflicts(conflictsMap: Map<string, Planting[]>): number {
  // Verzamel paren in stringvorm om dubbelingen te vermijden
  const seen = new Set<string>();
  for (const [id, arr] of conflictsMap) {
    for (const other of arr) {
      const a = id < other.id ? id : other.id;
      const b = id < other.id ? other.id : id;
      seen.add(`${a}::${b}`);
    }
  }
  return seen.size;
}

/** Voor on-demand: alle conflicten van één planting. */
export function conflictsFor(plantingId: string, conflictsMap: Map<string, Planting[]>) {
  return conflictsMap.get(plantingId) ?? [];
}
