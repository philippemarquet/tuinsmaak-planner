// src/lib/conflicts.ts
import type { GardenBed, Planting } from "./types";

/** Inclusieve dag-overlap (start & end tellen mee). */
export function datesOverlapIncl(aStartISO?: string | null, aEndISO?: string | null, bStartISO?: string | null, bEndISO?: string | null) {
  if (!aStartISO || !aEndISO || !bStartISO || !bEndISO) return false;
  const aS = new Date(aStartISO), aE = new Date(aEndISO);
  const bS = new Date(bStartISO), bE = new Date(bEndISO);
  // normaliseer naar 00:00 om 'maandag niet mogelijk' bugs te voorkomen
  aS.setHours(0,0,0,0); aE.setHours(0,0,0,0); bS.setHours(0,0,0,0); bE.setHours(0,0,0,0);
  return aS <= bE && bS <= aE;
}

/** Segment-overlap (inclusief grenzen). */
export function segmentsOverlapIncl(aStart: number, aUsed: number, bStart: number, bUsed: number) {
  const aEnd = aStart + Math.max(1, aUsed) - 1;
  const bEnd = bStart + Math.max(1, bUsed) - 1;
  return aStart <= bEnd && bStart <= aEnd;
}

/** Alle plantings die overlappen met p in zelfde bak én segmenten. */
export function conflictsForPlanting(p: Planting, all: Planting[]): Planting[] {
  return all.filter(q => {
    if (q.id === p.id) return false;
    if (q.garden_bed_id !== p.garden_bed_id) return false;
    if (!datesOverlapIncl(p.planned_date, p.planned_harvest_end, q.planned_date, q.planned_harvest_end)) return false;
    const ps = p.start_segment ?? 0, pu = p.segments_used ?? 1;
    const qs = q.start_segment ?? 0, qu = q.segments_used ?? 1;
    return segmentsOverlapIncl(ps, pu, qs, qu);
  });
}

/** True als bak-segmenten vrij zijn voor p met [start..end] en [startSeg..startSeg+used-1]. */
export function slotFits(bedId: string, startISO: string, endISO: string, startSeg: number, used: number, all: Planting[], ignoreId?: string) {
  for (const q of all) {
    if (ignoreId && q.id === ignoreId) continue;
    if (q.garden_bed_id !== bedId) continue;
    if (!datesOverlapIncl(startISO, endISO, q.planned_date, q.planned_harvest_end)) continue;
    const qs = q.start_segment ?? 0, qu = q.segments_used ?? 1;
    if (segmentsOverlapIncl(startSeg, used, qs, qu)) return false;
  }
  return true;
}

/** Alle bakken die p op dezelfde datumrange kunnen plaatsen. */
export function bedsThatFitFor(p: Planting, beds: GardenBed[], all: Planting[]) {
  const startISO = p.planned_date!, endISO = p.planned_harvest_end!;
  const used = Math.max(1, p.segments_used ?? 1);
  const res: { bed: GardenBed; validSegments: number[] }[] = [];
  for (const bed of beds) {
    const segCount = Math.max(1, bed.segments ?? 1);
    const valid: number[] = [];
    for (let s = 0; s < segCount; s++) {
      if (s + used - 1 >= segCount) break;
      if (slotFits(bed.id, startISO, endISO, s, used, all, p.id)) valid.push(s);
    }
    if (valid.length > 0) res.push({ bed, validSegments: valid });
  }
  return res;
}

/** Eerst offender kiezen: geen actuals → offender, anders degene met latere start. */
export function pickOffender(a: Planting, b: Planting): { offender: Planting; blocker: Planting } {
  const aHasActual = !!(a.actual_presow_date || a.actual_ground_date || a.actual_harvest_start || a.actual_harvest_end);
  const bHasActual = !!(b.actual_presow_date || b.actual_ground_date || b.actual_harvest_start || b.actual_harvest_end);
  if (aHasActual && !bHasActual) return { offender: b, blocker: a };
  if (!aHasActual && bHasActual) return { offender: a, blocker: b };

  const aStart = new Date(a.planned_date ?? "2100-01-01").getTime();
  const bStart = new Date(b.planned_date ?? "2100-01-01").getTime();
  if (aStart >= bStart) return { offender: a, blocker: b };
  return { offender: b, blocker: a };
}

/** Vroegste datum (vanaf p.planned_date) waarop p in een bed past. */
export function findEarliestDate(p: Planting, bed: GardenBed, all: Planting[], limitDays = 365): string | null {
  if (!p.planned_date || !p.planned_harvest_end) return null;
  const used = Math.max(1, p.segments_used ?? 1);
  const segCount = Math.max(1, bed.segments ?? 1);
  const start = new Date(p.planned_date);
  const durDays = Math.round((new Date(p.planned_harvest_end).getTime() - new Date(p.planned_date).getTime()) / (1000*60*60*24));
  for (let d=0; d<=limitDays; d++) {
    const s = new Date(start); s.setDate(s.getDate()+d); s.setHours(0,0,0,0);
    const e = new Date(s); e.setDate(e.getDate()+durDays); e.setHours(0,0,0,0);
    const sISO = s.toISOString().slice(0,10);
    const eISO = e.toISOString().slice(0,10);
    for (let seg=0; seg<segCount; seg++) {
      if (seg + used - 1 >= segCount) break;
      if (slotFits(bed.id, sISO, eISO, seg, used, all, p.id)) return sISO;
    }
  }
  return null;
}
