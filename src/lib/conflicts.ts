// src/lib/conflicts.ts
import type { Planting } from "./types";

/** Parse 'YYYY-MM-DD' als lokale datum op 12:00, zodat DST/UTC nooit -1 dag verschuift. */
function parseISODateLocalNoon(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

function hasDates(p?: Planting | null): p is Planting {
  return !!p && !!p.planned_date && !!p.planned_harvest_end;
}

/** Inclusieve overlap op dag-niveau: einddagen tellen mee. */
function rangesOverlapInclusive(aStartISO: string, aEndISO: string, bStartISO: string, bEndISO: string) {
  const aS = parseISODateLocalNoon(aStartISO).getTime();
  const aE = parseISODateLocalNoon(aEndISO).getTime();
  const bS = parseISODateLocalNoon(bStartISO).getTime();
  const bE = parseISODateLocalNoon(bEndISO).getTime();
  return aS <= bE && bS <= aE; // dag-inclusief
}

/** Segment-overlap (inclusief): ranges [startSeg, startSeg+used-1]. */
function segmentsOverlap(aStartSeg: number, aUsed: number, bStartSeg: number, bUsed: number) {
  const aEnd = aStartSeg + aUsed - 1;
  const bEnd = bStartSeg + bUsed - 1;
  return aStartSeg <= bEnd && bStartSeg <= aEnd;
}

/**
 * Bouwt een Map<plantingId, Planting[]> met alle conflicten.
 * Voorwaarden: zelfde bak, segment-overlap, datum-overlap (inclusief).
 */
export function buildConflictsMap(plantings: Planting[]): Map<string, Planting[]> {
  const map = new Map<string, Planting[]>();
  if (!Array.isArray(plantings) || plantings.length === 0) return map;

  // Per bak groeperen om het aantal vergelijkingen te beperken
  const byBed = new Map<string, Planting[]>();
  for (const p of plantings) {
    if (!p?.garden_bed_id) continue;
    if (!hasDates(p)) continue;
    const arr = byBed.get(p.garden_bed_id) || [];
    arr.push(p);
    byBed.set(p.garden_bed_id, arr);
  }

  for (const [, list] of byBed) {
    // optioneel sorteren op startdatum → prettiger/efficiënter
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

        // Snel pad: als B start na A einde (zonder overlap) kun je doorbreken
        // (omdat op startdatum gesorteerd).
        // LET OP: inclusive. Als B op de dag NÁ A eindigt is het vrij → geen break.
        const aE = parseISODateLocalNoon(A.planned_harvest_end!).getTime();
        const bS = parseISODateLocalNoon(B.planned_date!).getTime();
        if (bS > aE && bSeg >= aSeg + aUsed) {
          // niet per se een hard break, want segmenten kunnen doorschieten.
          // We kiezen veiligheidshalve géén break hier.
        }

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

/** Handig als je ergens moet checken of twee (kandidaat) ranges vrij zijn */
export function isFreeInclusive(
  newStartISO: string, newEndISO: string,
  existingStartISO: string, existingEndISO: string
) {
  return !rangesOverlapInclusive(newStartISO, newEndISO, existingStartISO, existingEndISO);
}
