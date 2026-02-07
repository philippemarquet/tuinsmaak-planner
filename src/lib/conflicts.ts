// src/lib/conflicts.ts
import type { Planting, Seed } from "./types";

/** Day-level overlap (inclusief laatste dag). */
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

function normaliseDay(d: Date) {
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Bezettingswindow:
 * - Start: actual_ground óf (actual_presow + presow-weken) óf planned_date
 * - Eind : actual_harvest_end óf (start + grow+harvest weken) óf planned_harvest_end
 */
export function occupancyWindow(p: Planting, seed?: Seed): Window {
  let startISO: string | null = null;
  let endISO: string | null = null;

  // START: wanneer neemt het gewas de bak in beslag?
  if (p.actual_ground_date) {
    startISO = p.actual_ground_date;
  } else if (p.planned_date) {
    startISO = p.planned_date;
  } else if (p.actual_presow_date && seed?.presow_duration_weeks) {
    // Alleen als fallback: bereken gronddatum vanuit voorzaaidatum
    const base = new Date(p.actual_presow_date);
    if (!isNaN(base.getTime())) {
      const g = new Date(base);
      g.setDate(g.getDate() + seed.presow_duration_weeks * 7);
      startISO = g.toISOString().slice(0, 10);
    }
  }

  // END
  if (p.actual_harvest_end) {
    endISO = p.actual_harvest_end;
  } else if (startISO && seed && seed.grow_duration_weeks != null && seed.harvest_duration_weeks != null) {
    const g = new Date(startISO);
    if (!isNaN(g.getTime())) {
      const e = new Date(g);
      e.setDate(e.getDate() + (seed.grow_duration_weeks + seed.harvest_duration_weeks) * 7 - 1);
      endISO = e.toISOString().slice(0, 10);
    }
  } else {
    endISO = p.planned_harvest_end ?? null;
  }

  if (!startISO || !endISO) return { start: null, end: null };

  const s = normaliseDay(new Date(startISO));
  const e = normaliseDay(new Date(endISO));
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return { start: null, end: null };

  return { start: s, end: e };
}

function sameBed(a: Planting, b: Planting) {
  return a.garden_bed_id && b.garden_bed_id && a.garden_bed_id === b.garden_bed_id;
}
function segStart(p: Planting) { return Math.max(0, p.start_segment ?? 0); }
function segUsed(p: Planting)  { return Math.max(1, p.segments_used ?? 1); }

/**
 * Kaart: plantingId → lijst conflicterende plantingen
 */
export function buildConflictsMap(plantings: Planting[], seeds: Seed[] = []): Map<string, Planting[]> {
  const map = new Map<string, Planting[]>();
  for (const p of plantings) map.set(p.id, []);

  const seedById = new Map(seeds.map(s => [s.id, s]));

  for (let i = 0; i < plantings.length; i++) {
    const a = plantings[i];
    const wa = occupancyWindow(a, seedById.get(a.seed_id));
    if (!wa.start || !wa.end) continue;

    for (let j = i + 1; j < plantings.length; j++) {
      const b = plantings[j];
      if (!sameBed(a, b)) continue;

      const wb = occupancyWindow(b, seedById.get(b.seed_id));
      if (!wb.start || !wb.end) continue;

      if (!intervalsOverlapDayInclusive(wa.start, wa.end, wb.start, wb.end)) continue;
      if (!segmentsOverlapInclusive(segStart(a), segUsed(a), segStart(b), segUsed(b))) continue;

      map.get(a.id)!.push(b);
      map.get(b.id)!.push(a);
    }
  }

  return map;
}

/** Unieke paren tellen (i<j). */
export function countUniqueConflicts(conflictsMap: Map<string, Planting[]>): number {
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

/** Alle conflicten voor één planting. */
export function conflictsFor(plantingId: string, map: Map<string, Planting[]>) {
  return map.get(plantingId) ?? [];
}

/* =================== NIEUW: ‘wie moet worden aangepast?’ =================== */

function hasAnyActual(p: Planting) {
  return !!(p.actual_presow_date || p.actual_ground_date || p.actual_harvest_start || p.actual_harvest_end);
}
function timeOf(iso?: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.getTime();
}

/**
 * Bepaal voor een conflict-paar welke ‘target’ (de “nieuwe”) moet worden aangepast:
 * 1) Als één van de twee actuals heeft en de ander niet → die zonder actual = target.
 * 2) Anders → de teelt met de latere planned_date = target.
 * Retourneer {source (blijft), target (aanpassen)}.
 */
function chooseSourceTarget(a: Planting, b: Planting): { source: Planting; target: Planting } {
  const aHas = hasAnyActual(a);
  const bHas = hasAnyActual(b);
  if (aHas && !bHas) return { source: a, target: b };
  if (bHas && !aHas) return { source: b, target: a };

  const ta = timeOf(a.planned_date) ?? -Infinity;
  const tb = timeOf(b.planned_date) ?? -Infinity;
  if (ta === tb) {
    // arbitrair maar stabiel: id-orde
    return a.id < b.id ? ({ source: a, target: b }) : ({ source: b, target: a });
  }
  return ta < tb ? ({ source: a, target: b }) : ({ source: b, target: a });
}

/**
 * Bouw een lijst met *aanpassingen*: één item per uniek conflict-paar waarbij alleen de "target"
 * (teelt die jij moet verplaatsen) straks in de UI getoond wordt.
 */
export function buildConflictAdjustments(
  plantings: Planting[],
  conflictsMap: Map<string, Planting[]>
): Array<{ source: Planting; target: Planting }> {
  const byId = new Map(plantings.map(p => [p.id, p]));
  const seen = new Set<string>();
  const out: Array<{ source: Planting; target: Planting }> = [];

  for (const [id, arr] of conflictsMap) {
    const a = byId.get(id);
    if (!a) continue;
    for (const b of arr) {
      const key = id < b.id ? `${id}::${b.id}` : `${b.id}::${id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const pA = byId.get(id);
      const pB = byId.get(b.id);
      if (!pA || !pB) continue;

      const pair = chooseSourceTarget(pA, pB);
      out.push(pair);
    }
  }
  return out;
}
