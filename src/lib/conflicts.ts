// src/lib/conflicts.ts
import type { GardenBed, Planting } from "./types";

/** --- Date helpers --- */
export function parseISO(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}
export function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Dag-inclusieve overlap (plannen zijn per dag, niet per uur). */
export function intervalsOverlapDayInclusive(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart <= bEnd && bStart <= aEnd;
}

/** Segment-overlap (contigu, inclusief uiteinden). */
export function segmentsOverlap(aStart: number, aUsed: number, bStart: number, bUsed: number) {
  const aEnd = aStart + Math.max(1, aUsed) - 1;
  const bEnd = bStart + Math.max(1, bUsed) - 1;
  return aStart <= bEnd && bStart <= aEnd;
}

/** Vindt overlappende plantingen per bed (dag-inclusief + segment). */
export function buildConflictIndex(
  beds: GardenBed[],
  plantings: Planting[],
) {
  const conflictsByPlanting = new Map<string, string[]>(); // id -> list of other ids
  const bedHasConflict = new Map<string, boolean>();
  const offenders = new Set<string>();

  const byBed = new Map<string, Planting[]>();
  for (const p of plantings) {
    if (!p?.garden_bed_id) continue;
    if (!byBed.has(p.garden_bed_id)) byBed.set(p.garden_bed_id, []);
    byBed.get(p.garden_bed_id)!.push(p);
  }

  for (const [bedId, list] of byBed.entries()) {
    const segCount = Math.max(1, beds.find(b => b.id === bedId)?.segments ?? 1);
    if (!list || list.length <= 1) { bedHasConflict.set(bedId, false); continue; }

    // pairwise
    let hasAny = false;
    for (let i = 0; i < list.length; i++) {
      const A = list[i];
      const As = parseISO(A.planned_date);
      const Ae = parseISO(A.planned_harvest_end);
      if (!A?.id || !As || !Ae) continue;
      const aStartSeg = Math.max(0, A.start_segment ?? 0);
      const aUsed = Math.max(1, Math.min(segCount, A.segments_used ?? 1));

      for (let j = i + 1; j < list.length; j++) {
        const B = list[j];
        const Bs = parseISO(B.planned_date);
        const Be = parseISO(B.planned_harvest_end);
        if (!B?.id || !Bs || !Be) continue;

        const bStartSeg = Math.max(0, B.start_segment ?? 0);
        const bUsed = Math.max(1, Math.min(segCount, B.segments_used ?? 1));

        const dateOverlap = intervalsOverlapDayInclusive(As, Ae, Bs, Be);
        const segOverlap = segmentsOverlap(aStartSeg, aUsed, bStartSeg, bUsed);

        if (dateOverlap && segOverlap) {
          hasAny = true;
          if (!conflictsByPlanting.has(A.id)) conflictsByPlanting.set(A.id, []);
          if (!conflictsByPlanting.has(B.id)) conflictsByPlanting.set(B.id, []);
          conflictsByPlanting.get(A.id)!.push(B.id);
          conflictsByPlanting.get(B.id)!.push(A.id);

          // "Offender" = degene die later start; zo sturen we alleen de nieuwere aan.
          const Adate = A.planned_date ?? "";
          const Bdate = B.planned_date ?? "";
          if (Bdate > Adate) offenders.add(B.id);
          else if (Adate > Bdate) offenders.add(A.id);
          else {
            // zelfde dag -> kies degene met hogere start_segment als offender
            if (bStartSeg > aStartSeg) offenders.add(B.id);
            else offenders.add(A.id);
          }
        }
      }
    }
    bedHasConflict.set(bedId, hasAny);
  }

  return { conflictsByPlanting, bedHasConflict, offenders };
}

/** Alle plantingen in een bed, behalve (optioneel) excludeId. */
function plantingsInBed(bedId: string, plantings: Planting[], excludeId?: string) {
  return plantings.filter(p => p.garden_bed_id === bedId && (!excludeId || p.id !== excludeId));
}

/** Vind alle start_segment opties waar een blok van width past tussen dateStart..dateEnd. */
export function findFreeSegmentStarts(
  bed: GardenBed,
  allPlantings: Planting[],
  dateStart: Date,
  dateEnd: Date,
  width: number,
  excludePlantingId?: string,
): number[] {
  const segCount = Math.max(1, bed.segments ?? 1);
  const widthClamped = Math.max(1, Math.min(segCount, width));
  const existing = plantingsInBed(bed.id, allPlantings, excludePlantingId);

  const options: number[] = [];
  for (let start = 0; start <= segCount - widthClamped; start++) {
    const end = start + widthClamped - 1;
    // check tegen alle bestaande in dit bed
    let ok = true;
    for (const q of existing) {
      const qs = parseISO(q.planned_date);
      const qe = parseISO(q.planned_harvest_end);
      if (!qs || !qe) continue;
      const qStart = Math.max(0, q.start_segment ?? 0);
      const qUsed = Math.max(1, q.segments_used ?? 1);

      if (intervalsOverlapDayInclusive(dateStart, dateEnd, qs, qe) &&
          segmentsOverlap(start, widthClamped, qStart, qUsed)) {
        ok = false; break;
      }
    }
    if (ok) options.push(start);
  }
  return options;
}

/** Voor de editor: welke bakken (en start_segment opties) zijn mogelijk op de gekozen datumrange? */
export function bedAndSegmentOptionsFor(
  beds: GardenBed[],
  plantings: Planting[],
  planting: Planting,
  dateStartISO: string,
  dateEndISO: string,
) {
  const s = parseISO(dateStartISO);
  const e = parseISO(dateEndISO);
  if (!s || !e) return [];

  const needWidth = Math.max(1, planting.segments_used ?? 1);
  return beds.map(bed => {
    const segs = findFreeSegmentStarts(bed, plantings, s, e, needWidth, planting.id);
    return { bedId: bed.id, bedName: bed.name, segmentStarts: segs };
  }).filter(x => x.segmentStarts.length > 0);
}

/** Suggesties voor het Conflicten-tab:
 *  1) andere start_segment in dezelfde bak (zelfde datum),
 *  2) andere bak (zelfde datum),
 *  3) vroegste datum (zelfde/andere bak), alleen tonen als (1) en (2) niet kunnen.
 */
export function conflictSuggestions(
  beds: GardenBed[],
  plantings: Planting[],
  offender: Planting,
) {
  const startISO = offender.planned_date!;
  const endISO = offender.planned_harvest_end!;
  const start = parseISO(startISO)!;
  const end = parseISO(endISO)!;
  const needWidth = Math.max(1, offender.segments_used ?? 1);

  const currentBed = beds.find(b => b.id === offender.garden_bed_id);
  const sameBedStarts = currentBed
    ? findFreeSegmentStarts(currentBed, plantings, start, end, needWidth, offender.id)
    : [];

  const otherBeds = beds
    .filter(b => b.id !== offender.garden_bed_id)
    .map(b => ({ bed: b, starts: findFreeSegmentStarts(b, plantings, start, end, needWidth, offender.id) }))
    .filter(x => x.starts.length > 0);

  let earliest: { dateISO: string; bed: GardenBed; start_segment: number } | null = null;
  if (sameBedStarts.length === 0 && otherBeds.length === 0) {
    // scan vooruit (max 365 dagen) voor eerste plek die past
    const limit = 365;
    for (let days = 1; days <= limit && !earliest; days++) {
      const dStart = new Date(start); dStart.setDate(dStart.getDate() + days);
      const dEnd = new Date(end); dEnd.setDate(dEnd.getDate() + days);

      // 1) zelfde bak eerst:
      if (currentBed) {
        const starts = findFreeSegmentStarts(currentBed, plantings, dStart, dEnd, needWidth, offender.id);
        if (starts.length > 0) {
          earliest = { dateISO: toISO(dStart), bed: currentBed, start_segment: starts[0] };
          break;
        }
      }
      // 2) anders andere bakken
      for (const b of beds) {
        if (currentBed && b.id === currentBed.id) continue;
        const starts = findFreeSegmentStarts(b, plantings, dStart, dEnd, needWidth, offender.id);
        if (starts.length > 0) {
          earliest = { dateISO: toISO(dStart), bed: b, start_segment: starts[0] };
          break;
        }
      }
    }
  }

  return {
    sameBedStarts, // [] of [start_segment, ...]
    otherBeds,     // [{ bed, starts: number[] }, ...]
    earliest,      // of null
  };
}
