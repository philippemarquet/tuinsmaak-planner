// src/lib/conflicts.ts
import type { Planting } from "./types";

/** Inclusief op dag-niveau: overlap als aStart <= bEnd && bStart <= aEnd */
function intervalsOverlapDayInclusive(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
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
 * - Start = (actual_ground_date ?? planned_date)
 * - End   = (actual_harvest_end ?? planned_harvest_end)
 * We nemen 'actual' voorkeur, maar vallen terug op 'planned'.
 */
export function occupancyWindow(p: Planting): Window {
  const startISO = (p.actual_ground_date ?? p.planned_date) ?? null;
  const endISO   = (p.actual_harvest_end ?? p.planned_harvest_end) ?? null;

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
export function buildConflictsMap(plantings: Planting[]): Map<string, Planting[]> {
  const map = new Map<string, Planting[]>();
  for (const p of plantings) map.set(p.id, []);

  const n = plantings.length;
  for (let i = 0; i < n; i++) {
    const a = plantings[i];
    const wa = occupancyWindow(a);
    if (!wa.start || !wa.end) continue;

    for (let j = i + 1; j < n; j++) {
      const b = plantings[j];
      if (!sameBed(a, b)) continue;

      const wb = occupancyWindow(b);
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
