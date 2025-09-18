// src/lib/conflicts.ts
import type { Planting } from "./types";

/** Parse 'YYYY-MM-DD' als lokale datum (12:00) zodat UTC/DST geen -1 dag issues geeft. */
function parseISODateLocalNoon(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

/** Inclusieve overlap op dag-niveau: einddagen tellen mee. */
function rangesOverlapInclusive(aStartISO: string, aEndISO: string, bStartISO: string, bEndISO: string) {
  const aS = parseISODateLocalNoon(aStartISO).getTime();
  const aE = parseISODateLocalNoon(aEndISO).getTime();
  const bS = parseISODateLocalNoon(bStartISO).getTime();
  const bE = parseISODateLocalNoon(bEndISO).getTime();
  return aS <= bE && bS <= aE;
}

/** Segment-overlap (inclusief): [startSeg, startSeg+used-1]. */
function segmentsOverlap(aStartSeg: number, aUsed: number, bStartSeg: number, bUsed: number) {
  const aEnd = aStartSeg + aUsed - 1;
  const bEnd = bStartSeg + bUsed - 1;
  return aStartSeg <= bEnd && bStartSeg <= aEnd;
}

function hasDates(p?: Planting | null): p is Planting {
  return !!p && !!p.planned_date && !!p.planned_harvest_end;
}

/**
 * Bouwt een Map<plantingId, Planting[]> met alle conflicten.
 * Voorwaarden: zelfde bak, segment-overlap, datum-overlap (dag-inclusief).
 * Symmetrisch: A ↔ B.
 */
export function buildConflictsMap(plantings: Planting[]): Map<string, Planting[]> {
  const map = new Map<string, Planting[]>();
  if (!Array.isArray(plantings) || plantings.length === 0) return map;

  // Groepeer per bak (sneller)
  const byBed = new Map<string, Planting[]>();
  for (const p of plantings) {
    if (!p?.garden_bed_id) continue;
    if (!hasDates(p)) continue;
    const arr = byBed.get(p.garden_bed_id) || [];
    arr.push(p);
    byBed.set(p.garden_bed_id, arr);
  }

  for (const [, list] of byBed) {
    // sorteer (optioneel) op startdatum → overzichtelijk
    list.sort((a, b) => String(a.planned_date).localeCompare(String(b.planned_date)));

    const n = list.length;
    for (let i = 0; i < n; i++) {
      const A = list[i];
      const aSeg = Math.max(0, A.start_segment ?? 0);
      const aUsed = Math.max(1, A.segments_used ?? 1);

      for (let j = i + 1; j < n; j++) {
        const B = list[j];
        const bSeg = Math.max(0, B.start_segment ?? 0);
        const bUsed = Math.max(1, B.segments_used ?? 1);

        if (
          segmentsOverlap(aSeg, aUsed, bSeg, bUsed) &&
          rangesOverlapInclusive(A.planned_date!, A.planned_harvest_end!, B.planned_date!, B.planned_harvest_end!)
        ) {
          if (!map.has(A.id)) map.set(A.id, []);
          if (!map.has(B.id)) map.set(B.id, []);
          map.get(A.id)!.push(B);
          map.get(B.id)!.push(A);
        }
      }
    }
  }

  return map;
}
