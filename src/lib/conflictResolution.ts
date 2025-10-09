// src/lib/conflictResolution.ts
import type { GardenBed, Planting } from "./types";
import { buildConflictsMap, intervalsOverlap, segmentsOverlap, occupancyWindow, parseISO } from "./conflicts";

export type FitOption = { bed_id: string; start_segment: number };
export type EarliestFit = { dateISO: string; bed_id: string; start_segment: number };
export type ConflictDetail = {
  offender: Planting;        // the planting the user should modify
  blockers: Planting[];      // plantings it conflicts with (typically "locked" / earlier)
  sameBedOption?: FitOption | null;
  otherBedOptions?: FitOption[];
  earliestFit?: EarliestFit | null;
};

export function isLocked(p: Planting): boolean {
  return Boolean(p.actual_ground_date || p.actual_presow_date || p.actual_harvest_start || p.actual_harvest_end);
}

/** Returns offender/blocker pairs (only the "new"/unlocked side as offender). */
export function pickOffenders(plantings: Planting[]): ConflictDetail[] {
  const conflicts = buildConflictsMap(plantings);
  const details: ConflictDetail[] = [];
  const handled = new Set<string>();

  for (const [pid, others] of conflicts) {
    const p = plantings.find(x => x.id === pid);
    if (!p) continue;
    for (const q of others) {
      const key = pid < q.id ? pid + "|" + q.id : q.id + "|" + pid;
      if (handled.has(key)) continue;
      handled.add(key);

      const pLocked = isLocked(p);
      const qLocked = isLocked(q);
      let offender: Planting, blocker: Planting;

      if (pLocked && !qLocked) { offender = q; blocker = p; }
      else if (!pLocked && qLocked) { offender = p; blocker = q; }
      else {
        // both unlocked or both locked → choose the one with later planned_date as offender
        const pStart = parseISO(p.planned_date)!.getTime();
        const qStart = parseISO(q.planned_date)!.getTime();
        if (pStart >= qStart) { offender = p; blocker = q; } else { offender = q; blocker = p; }
      }

      // Aggregate blockers per offender
      let entry = details.find(d => d.offender.id === offender.id);
      if (!entry) {
        entry = { offender, blockers: [] };
        details.push(entry);
      }
      if (!entry.blockers.find(b => b.id === blocker.id)) entry.blockers.push(blocker);
    }
  }

  return details;
}

/** Compute all free contiguous segment start positions for a given bed and interval. */
export function freeStartsForInterval(
  bed: GardenBed,
  plantings: Planting[],
  startISO: string,
  endISO: string,
  neededSegments: number,
  excludePlantingId?: string
): number[] {
  const segCount = Math.max(1, bed.segments ?? 1);
  const starts: number[] = [];
  const s = parseISO(startISO)!;
  const e = parseISO(endISO)!;

  for (let startSeg = 0; startSeg <= segCount - neededSegments; startSeg++) {
    const aStart = startSeg;
    const aUsed = neededSegments;
    let ok = true;
    for (const p of plantings) {
      if (excludePlantingId && p.id === excludePlantingId) continue;
      if (p.garden_bed_id !== bed.id) continue;
      const w = occupancyWindow(p);
      if (!w.start || !w.end) continue;
      if (!intervalsOverlap(s, e, w.start, w.end)) continue;
      const bStart = p.start_segment ?? 0;
      const bUsed = p.segments_used ?? 1;
      if (segmentsOverlap(aStart, aUsed, bStart, bUsed)) { ok = false; break; }
    }
    if (ok) starts.push(startSeg);
  }
  return starts;
}

export function suggestWithinSameBedSameDate(offender: Planting, beds: GardenBed[], plantings: Planting[]): FitOption | null {
  const bed = beds.find(b => b.id === offender.garden_bed_id);
  const w = occupancyWindow(offender);
  if (!bed || !w.start || !w.end) return null;
  const needed = Math.max(1, offender.segments_used ?? 1);
  const starts = freeStartsForInterval(bed, plantings, offender.planned_date!, offender.planned_harvest_end!, needed, offender.id);
  if (starts.length === 0) return null;
  // Prefer original start if still free, otherwise first free
  const preferred = offender.start_segment ?? 0;
  const start_segment = starts.includes(preferred) ? preferred : starts[0];
  return { bed_id: bed.id, start_segment };
}

export function suggestOtherBedsSameDate(offender: Planting, beds: GardenBed[], plantings: Planting[]): FitOption[] {
  const w = occupancyWindow(offender);
  if (!w.start || !w.end) return [];
  const needed = Math.max(1, offender.segments_used ?? 1);
  const out: FitOption[] = [];
  for (const bed of beds) {
    if (bed.id === offender.garden_bed_id) continue;
    const starts = freeStartsForInterval(bed, plantings, offender.planned_date!, offender.planned_harvest_end!, needed, offender.id);
    if (starts.length > 0) out.push({ bed_id: bed.id, start_segment: starts[0] });
  }
  return out;
}

export function findEarliestFit(offender: Planting, beds: GardenBed[], plantings: Planting[], horizonDays = 365): EarliestFit | null {
  const needed = Math.max(1, offender.segments_used ?? 1);
  const startDate = parseISO(offender.planned_date!);
  const endDate = parseISO(offender.planned_harvest_end!);
  if (!startDate || !endDate) return null;
  const durationDays = Math.round((+endDate - +startDate) / (1000*60*60*24));

  const base = new Date(startDate);
  for (let d = 0; d <= horizonDays; d++) {
    const s = new Date(base); s.setDate(s.getDate() + d);
    const e = new Date(s); e.setDate(e.getDate() + durationDays);
    const sISO = s.toISOString().slice(0,10);
    const eISO = e.toISOString().slice(0,10);
    for (const bed of beds) {
      const starts = freeStartsForInterval(bed, plantings, sISO, eISO, needed, offender.id);
      if (starts.length > 0) {
        return { dateISO: sISO, bed_id: bed.id, start_segment: starts[0] };
      }
    }
  }
  return null;
}

export function generateConflictDetails(plantings: Planting[], beds: GardenBed[]): ConflictDetail[] {
  const offenders = pickOffenders(plantings);
  // Augment with suggestions per the user's rules
  return offenders.map(entry => {
    const same = suggestWithinSameBedSameDate(entry.offender, beds, plantings);
    const others = same ? [] : suggestOtherBedsSameDate(entry.offender, beds, plantings);
    const earliest = (same || (others && others.length>0)) ? null : findEarliestFit(entry.offender, beds, plantings);
    return { ...entry, sameBedOption: same ?? null, otherBedOptions: others, earliestFit: earliest ?? null };
  });
}
