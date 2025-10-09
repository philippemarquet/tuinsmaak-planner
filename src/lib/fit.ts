// src/lib/fit.ts
import type { GardenBed, Planting } from "./types";

/** Inclusieve overlap op dag-niveau. */
export function intervalsOverlap(aStartISO: string, aEndISO: string, bStartISO: string, bEndISO: string) {
  const aS = new Date(aStartISO); aS.setHours(0,0,0,0);
  const aE = new Date(aEndISO);   aE.setHours(23,59,59,999);
  const bS = new Date(bStartISO); bS.setHours(0,0,0,0);
  const bE = new Date(bEndISO);   bE.setHours(23,59,59,999);
  return aS <= bE && bS <= aE;
}

/** Segment-overlap (contigu). */
export function segmentsOverlap(aStartSeg: number, aUsed: number, bStartSeg: number, bUsed: number) {
  const aEnd = aStartSeg + aUsed - 1;
  const bEnd = bStartSeg + bUsed - 1;
  return aStartSeg <= bEnd && bStartSeg <= aEnd;
}

/** Haal alle plantings op in een bed die overlappen in tijd met meegegeven interval. */
export function overlappingPlantingsInBed(
  all: Planting[],
  bedId: string,
  startISO: string,
  endISO: string
) {
  return (all || []).filter(p =>
    p?.garden_bed_id === bedId &&
    p?.planned_date && p?.planned_harvest_end &&
    intervalsOverlap(p.planned_date, p.planned_harvest_end, startISO, endISO)
  );
}

/** Controleer of een (bed, startSeg) past voor een candidate planting (zelfde datum-range). */
export function fitsInBedAtSegment(
  bed: GardenBed,
  all: Planting[],
  candidate: Planting,
  startSeg: number
) {
  const used = Math.max(1, candidate.segments_used || 1);
  const maxSeg = Math.max(1, bed.segments || 1);
  if (startSeg < 0 || startSeg + used > maxSeg) return false;

  const sISO = candidate.planned_date;
  const eISO = candidate.planned_harvest_end;
  if (!sISO || !eISO) return false;

  const overlapping = overlappingPlantingsInBed(all, bed.id, sISO, eISO).filter(p => p.id !== candidate.id);
  for (const p of overlapping) {
    const pStart = Math.max(0, p.start_segment ?? 0);
    const pUsed  = Math.max(1, p.segments_used ?? 1);
    if (segmentsOverlap(startSeg, used, pStart, pUsed)) return false;
  }
  return true;
}

/** Geef alle startSegments terug in bed waar het past (zelfde datum-range). */
export function allFittingSegmentsInBed(
  bed: GardenBed,
  all: Planting[],
  candidate: Planting
): number[] {
  const used = Math.max(1, candidate.segments_used || 1);
  const maxSeg = Math.max(1, bed.segments || 1);
  const out: number[] = [];
  for (let s = 0; s <= maxSeg - used; s++) {
    if (fitsInBedAtSegment(bed, all, candidate, s)) out.push(s);
  }
  return out;
}

/** Bepaal voor elk bed of er *enig* conflict is. */
export function bedHasConflict(bed: GardenBed, all: Planting[]) {
  const inBed = (all || []).filter(p => p?.garden_bed_id === bed.id && p?.planned_date && p?.planned_harvest_end);
  // Check pairwise overlap met segment-overlap
  for (let i = 0; i < inBed.length; i++) {
    const a = inBed[i];
    const aS = Math.max(0, a.start_segment ?? 0);
    const aU = Math.max(1, a.segments_used ?? 1);
    for (let j = i + 1; j < inBed.length; j++) {
      const b = inBed[j];
      if (!intervalsOverlap(a.planned_date!, a.planned_harvest_end!, b.planned_date!, b.planned_harvest_end!)) continue;
      const bS = Math.max(0, b.start_segment ?? 0);
      const bU = Math.max(1, b.segments_used ?? 1);
      if (a.garden_bed_id === b.garden_bed_id && segmentsOverlap(aS, aU, bS, bU)) return true;
    }
  }
  return false;
}

/** Build een conflictsMap: plantingId → conflicterende plantings[] */
export function buildConflictsMap(all: Planting[]) {
  const map = new Map<string, Planting[]>();
  for (const a of all || []) {
    if (!a?.planned_date || !a?.planned_harvest_end) continue;
    const aS = Math.max(0, a.start_segment ?? 0);
    const aU = Math.max(1, a.segments_used ?? 1);
    const list: Planting[] = [];
    for (const b of all || []) {
      if (a.id === b.id) continue;
      if (a.garden_bed_id !== b.garden_bed_id) continue;
      if (!b?.planned_date || !b?.planned_harvest_end) continue;
      if (!intervalsOverlap(a.planned_date, a.planned_harvest_end, b.planned_date, b.planned_harvest_end)) continue;
      const bS = Math.max(0, b.start_segment ?? 0);
      const bU = Math.max(1, b.segments_used ?? 1);
      if (segmentsOverlap(aS, aU, bS, bU)) list.push(b);
    }
    if (list.length > 0) map.set(a.id, list);
  }
  return map;
}

/** Heuristiek: wie “moet” aangepast worden bij conflict? 
 *  1) Als één van beide actual_* heeft (vastgezet), dan is de ander “nieuw”.
 *  2) Anders: degene met latere planned_date is “nieuw”.
 */
export function isLikelyNewerToFix(p: Planting, conflicts: Planting[]) {
  const hasActual = (x: Planting) => (
    x.actual_presow_date || x.actual_ground_date || x.actual_harvest_start || x.actual_harvest_end
  );
  // Als er *enige* conflict is met iemand die actual heeft en p zelf heeft geen actual → p is “nieuw”.
  if (!hasActual(p) && conflicts.some(hasActual)) return true;
  // Als p later start dan *alle* conflicterende → p is “nieuw”.
  if (p.planned_date) {
    const pD = new Date(p.planned_date).getTime();
    if (conflicts.every(c => (c.planned_date ? new Date(c.planned_date).getTime() <= pD : true))) {
      return true;
    }
  }
  return false;
}

/** Zoek de vroegste datum (vanaf startISO) waarop candidate ergens past; 
 *  loop max 365 dagen vooruit. Retourneer {bedId, startSeg, dateISO} of null.
 */
export function findEarliestFitAcrossBeds(
  beds: GardenBed[],
  all: Planting[],
  candidate: Planting,
  startISO: string
) {
  if (!candidate.segments_used) candidate.segments_used = 1;
  const limitDays = 365;
  const start = new Date(startISO);
  for (let d = 0; d <= limitDays; d++) {
    const cur = new Date(start);
    cur.setDate(start.getDate() + d);
    const sISO = cur.toISOString().slice(0,10);

    // behoud interne duur
    if (!candidate.planned_date || !candidate.planned_harvest_end) return null;
    const lenDays = (new Date(candidate.planned_harvest_end).getTime() - new Date(candidate.planned_date).getTime()) / 86400000;
    const e = new Date(cur); e.setDate(cur.getDate() + Math.max(0, Math.round(lenDays)));
    const eISO = e.toISOString().slice(0,10);

    // maak een tijdelijke kopie met verschoven datums
    const temp: Planting = { ...candidate, planned_date: sISO, planned_harvest_end: eISO };

    for (const bed of beds) {
      const segs = allFittingSegmentsInBed(bed, all, temp);
      if (segs.length > 0) {
        return { bedId: bed.id, startSeg: segs[0], dateISO: sISO, endISO: eISO };
      }
    }
  }
  return null;
}
