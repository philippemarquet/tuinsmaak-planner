// src/components/TimelineView.tsx
import { useMemo, useState, useEffect } from "react";
import type { GardenBed, Planting, Seed } from "../lib/types";
import { deletePlanting, updatePlanting } from "../lib/api/plantings";
import { occupancyWindow } from "../lib/conflicts";
import { Trash2, Edit3, AlertTriangle } from "lucide-react";

interface TimelineViewProps {
  beds: GardenBed[];
  plantings: Planting[];
  seeds: Seed[];
  conflictsMap: Map<string, Planting[]>;
  currentWeek: Date;
  onReload: () => Promise<void>;
}

interface TimelineSegment {
  bedId: string;
  bedName: string;
  segmentIndex: number;
  isGreenhouse: boolean;
}

interface TimelineEvent {
  id: string;
  plantingId: string;
  segmentKey: string;
  seedName: string;
  color: string;
  startDate: Date;
  endDate: Date;
  hasConflict: boolean;
  conflictCount: number;
  planting: Planting;
}

const DAY = 24 * 60 * 60 * 1000;

function parseISO(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}
function formatDate(date: Date): string {
  return date.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((+d - +yearStart + 1 * DAY) / (7 * DAY));
}

/* helpers: overlap/segment check (inclusief) */
function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart <= bEnd && bStart <= aEnd;
}
function segmentsOverlap(aStartSeg: number, aUsed: number, bStartSeg: number, bUsed: number) {
  const aEnd = aStartSeg + aUsed - 1;
  const bEnd = bStartSeg + bUsed - 1;
  return aStartSeg <= bEnd && bStartSeg <= aEnd;
}
/** Vind eerste vrije start_segment in bed voor (start,end,used), of null */
function findFirstFreeSegment(
  all: Planting[],
  bed: GardenBed,
  start: Date,
  end: Date,
  used: number,
  ignoreId?: string
): number | null {
  const maxSeg = Math.max(1, bed.segments || 1);
  for (let seg = 0; seg <= maxSeg - used; seg++) {
    let clash = false;
    for (const p of all) {
      if (p.garden_bed_id !== bed.id) continue;
      if (ignoreId && p.id === ignoreId) continue;
      const s = parseISO(p.planned_date); const e = parseISO(p.planned_harvest_end);
      if (!s || !e) continue;
      if (!intervalsOverlap(start, end, s, e)) continue;
      const ps = Math.max(0, p.start_segment ?? 0);
      const pu = Math.max(1, p.segments_used ?? 1);
      if (segmentsOverlap(seg, used, ps, pu)) { clash = true; break; }
    }
    if (!clash) return seg;
  }
  return null;
}

export function TimelineView({
  beds = [],
  plantings = [],
  seeds = [],
  conflictsMap = new Map(),
  currentWeek,
  onReload,
}: TimelineViewProps) {
  const [editPlanting, setEditPlanting] = useState<Planting | null>(null);

  /* derived: segments per bed (buiten → kas) */
  const timelineSegments = useMemo<TimelineSegment[]>(() => {
    const segs: TimelineSegment[] = [];
    if (!beds?.length) return segs;

    const outdoor = beds.filter(b => !b.is_greenhouse).sort((a, b) => (a?.sort_order || 0) - (b?.sort_order || 0));
    const greenhouse = beds.filter(b => b.is_greenhouse).sort((a, b) => (a?.sort_order || 0) - (b?.sort_order || 0));

    const push = (list: GardenBed[]) => {
      for (const bed of list) {
        const count = Math.max(1, Number(bed.segments) || 1);
        for (let i = 0; i < count; i++) {
          segs.push({ bedId: bed.id, bedName: bed.name, segmentIndex: i, isGreenhouse: !!bed.is_greenhouse });
        }
      }
    };
    push(outdoor); push(greenhouse);
    return segs;
  }, [beds]);

  /* derived: events */
  const timelineEvents = useMemo<TimelineEvent[]>(() => {
    if (!Array.isArray(plantings) || plantings.length === 0) return [];
    const seedById: Record<string, Seed> = Object.fromEntries(seeds.map(s => [s.id, s]));
    const events: TimelineEvent[] = [];

    for (const p of plantings) {
      if (!p?.id || !p?.garden_bed_id || !p?.seed_id) continue;
      const win = occupancyWindow(p, seedById[p.seed_id]);
      if (!win.start || !win.end) continue;

      const seedName = seedById[p.seed_id]?.name || "Onbekend";
      const color = p.color && (p.color.startsWith("#") || p.color.startsWith("rgb")) ? p.color : "#22c55e";
      const startSeg = Math.max(0, Number(p.start_segment) || 0);
      const usedSegs = Math.max(1, Number(p.segments_used) || 1);
      const conflicts = conflictsMap.get(p.id) || [];

      for (let i = 0; i < usedSegs; i++) {
        const segIdx = startSeg + i;
        events.push({
          id: `${p.id}-${segIdx}`,
          plantingId: p.id,
          segmentKey: `${p.garden_bed_id}-${segIdx}`,
          seedName,
          color,
          startDate: win.start,
          endDate: win.end,
          hasConflict: conflicts.length > 0,
          conflictCount: conflicts.length,
          planting: p,
        });
      }
    }
    return events;
  }, [plantings, seeds, conflictsMap]);

  /* week-bounds (ma→zo) */
  const weekBounds = useMemo(() => {
    const start = new Date(currentWeek); start.setHours(0,0,0,0);
    const end = new Date(start.getTime() + 6 * DAY);
    return { start, end };
  }, [currentWeek]);

  /* week events */
  const weekEvents = useMemo(() => {
    return timelineEvents.filter(ev => ev.startDate <= weekBounds.end && ev.endDate >= weekBounds.start);
  }, [timelineEvents, weekBounds]);

  /* pos calc (einddag inclusief) */
  function calculateEventStyle(ev: TimelineEvent) {
    const clampedStart = Math.max(ev.startDate.getTime(), weekBounds.start.getTime());
    const clampedEnd   = Math.min(ev.endDate.getTime(),   weekBounds.end.getTime());

    const startOffsetDays = Math.floor((clampedStart - weekBounds.start.getTime()) / DAY);
    const spanDaysInclusive = Math.floor((clampedEnd - clampedStart) / DAY) + 1;

    const left = Math.max(0, Math.min(100, (startOffsetDays / 7) * 100));
    const width = Math.max(2, Math.min(100 - left, (spanDaysInclusive / 7) * 100));
    return { left: `${left}%`, width: `${width}%` };
  }

  /* grouping */
  const segmentsByBed = useMemo(() => {
    const map = new Map<string, TimelineSegment[]>();
    for (const s of timelineSegments) {
      if (!map.has(s.bedId)) map.set(s.bedId, []);
      map.get(s.bedId)!.push(s);
    }
    return map;
  }, [timelineSegments]);

  const orderedBedGroups = useMemo(() => {
    const outdoor = (beds || []).filter(b => !b.is_greenhouse).sort((a,b)=>(a?.sort_order||0)-(b?.sort_order||0));
    const greenhouse = (beds || []).filter(b => b.is_greenhouse).sort((a,b)=>(a?.sort_order||0)-(b?.sort_order||0));
    return { outdoor, greenhouse };
  }, [beds]);

  /* actions */
  const handleEdit = (p: Planting) => setEditPlanting(p);
  const handleDelete = async (p: Planting) => {
    const name = seeds.find(s => s.id === p.seed_id)?.name || "planting";
    if (!confirm(`Weet je zeker dat je "${name}" wilt verwijderen?`)) return;
    try { await deletePlanting(p.id); await onReload(); } catch (e) { alert("Kon planting niet verwijderen: " + e); }
  };

  /* ======= Edit popup logic: bed wisselen met alleen passende opties ======= */
  const [editDate, setEditDate] = useState<string>("");
  const [bedOptions, setBedOptions] = useState<Array<{ bed: GardenBed; seg: number }>>([]);
  const [selectedBedId, setSelectedBedId] = useState<string>("");

  useEffect(() => {
    if (!editPlanting) return;
    setEditDate(editPlanting.planned_date || "");
    setSelectedBedId(editPlanting.garden_bed_id);
  }, [editPlanting?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!editPlanting) { setBedOptions([]); return; }
    const seed = seeds.find(s => s.id === editPlanting.seed_id);
    if (!seed) { setBedOptions([]); return; }

    // Bereken bezettingsperiode o.b.v. gekozen datum + grow/harvest (einddag inclusief)
    const plantDate = parseISO(editDate || editPlanting.planned_date);
    if (!plantDate) { setBedOptions([]); return; }
    const harvestStart = new Date(plantDate.getTime() + (seed.grow_duration_weeks ?? 0) * 7 * DAY);
    const harvestEnd   = new Date(harvestStart.getTime() + (seed.harvest_duration_weeks ?? 0) * 7 * DAY - DAY);

    const used = Math.max(1, editPlanting.segments_used ?? 1);

    const opts: Array<{ bed: GardenBed; seg: number }> = [];
    for (const bed of beds) {
      const seg = findFirstFreeSegment(plantings, bed, plantDate, harvestEnd, used, editPlanting.id);
      if (seg != null) opts.push({ bed, seg });
    }
    setBedOptions(opts);

    // Als huidige geselecteerde bed niet (meer) in lijst staat → set naar eerste
    if (!opts.some(o => o.bed.id === selectedBedId)) {
      setSelectedBedId(opts[0]?.bed.id ?? "");
    }
  }, [editPlanting, editDate, beds, plantings, seeds, selectedBedId]);

  const handleSaveEdit = async () => {
    if (!editPlanting) return;
    const seed = seeds.find(s => s.id === editPlanting.seed_id);
    if (!seed) return;

    const plantDate = parseISO(editDate || editPlanting.planned_date);
    if (!plantDate) return;

    const harvestStart = new Date(plantDate.getTime() + (seed.grow_duration_weeks ?? 0) * 7 * DAY);
    const harvestEnd   = new Date(harvestStart.getTime() + (seed.harvest_duration_weeks ?? 0) * 7 * DAY - DAY);

    const choice = bedOptions.find(o => o.bed.id === selectedBedId);
    if (!choice) { alert("Geen passende bak beschikbaar voor deze datum."); return; }

    try {
      await updatePlanting(editPlanting.id, {
        garden_bed_id: choice.bed.id,
        start_segment: choice.seg,
        planned_date: plantDate.toISOString().slice(0,10),
        planned_harvest_start: harvestStart.toISOString().slice(0,10),
        planned_harvest_end: harvestEnd.toISOString().slice(0,10),
      } as any);
      setEditPlanting(null);
      await onReload();
    } catch (e) {
      alert("Kon planting niet bijwerken: " + e);
    }
  };

  /* ================================ RENDER ================================ */

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold">Timeline Weergave</h3>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            Week {getWeekNumber(weekBounds.start)} - {formatDate(weekBounds.start)} t/m {formatDate(weekBounds.end)}
          </span>
        </div>
      </div>

      {!beds || beds.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">Geen bedden gevonden. Voeg eerst bedden toe in de instellingen.</div>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-white">
          {/* Day Headers */}
          <div className="bg-muted border-b">
            <div className="flex">
              <div className="w-48 p-3 border-r bg-muted-foreground/5 font-medium text-sm">Bak / Segment</div>
              <div className="flex-1 flex">
                {Array.from({ length: 7 }, (_, i) => {
                  const dayDate = new Date(weekBounds.start.getTime() + i * DAY);
                  const dayName = dayDate.toLocaleDateString("nl-NL", { weekday: "short" });
                  const dayNumber = dayDate.getDate();
                  return (
                    <div key={`day-${i}`} className="flex-1 p-2 border-r text-center text-sm font-medium">
                      <div>{dayName}</div>
                      <div className="text-xs text-muted-foreground">{dayNumber}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Rows */}
          <div className="max-h-96 overflow-y-auto">
            {/* Outdoor */}
            {orderedBedGroups.outdoor.length > 0 && (
              <div>
                <div className="bg-blue-50 border-b">
                  <div className="flex items-center">
                    <div className="w-48 p-2 border-r font-semibold text-sm text-blue-700">🌱 Buitenbakken</div>
                    <div className="flex-1" />
                  </div>
                </div>

                {orderedBedGroups.outdoor.map(bed => {
                  const segs = segmentsByBed.get(bed.id) || [];
                  return (
                    <div key={`bed-${bed.id}`} className="border-b">
                      <div className="bg-muted/30 border-b">
                        <div className="flex items-center">
                          <div className="w-48 p-2 border-r font-medium text-sm">{bed.name}</div>
                          <div className="flex-1" />
                        </div>
                      </div>

                      {segs.map(segment => {
                        const segmentKey = `${segment.bedId}-${segment.segmentIndex}`;
                        const segEvents = weekEvents.filter(e => e.segmentKey === segmentKey);
                        return (
                          <div key={`seg-${segment.bedId}-${segment.segmentIndex}`} className="relative">
                            <div className="flex items-center min-h-[48px]">
                              <div className="w-48 p-3 border-r text-sm text-muted-foreground">Segment {segment.segmentIndex + 1}</div>

                              <div className="flex-1 relative h-12 bg-muted/10">
                                {Array.from({ length: 7 }, (_, i) => (
                                  <div key={`div-${segment.bedId}-${segment.segmentIndex}-${i}`} className="absolute top-0 bottom-0 border-r border-muted-foreground/20" style={{ left: `${(i / 7) * 100}%` }} />
                                ))}

                                {segEvents.map((ev, idx) => {
                                  const style = calculateEventStyle(ev);
                                  return (
                                    <div
                                      key={ev.id}
                                      className={`absolute top-1 h-10 rounded px-2 text-white text-xs flex items-center justify-between cursor-pointer hover:opacity-90 transition-opacity ${ev.hasConflict ? "ring-2 ring-red-500 ring-offset-1" : ""}`}
                                      style={{ ...style, backgroundColor: ev.color, zIndex: 10 + idx }}
                                      title={`${ev.seedName}\n${formatDate(ev.startDate)} - ${formatDate(ev.endDate)}\nWeken ${getWeekNumber(ev.startDate)}-${getWeekNumber(ev.endDate)}`}
                                    >
                                      <div className="flex items-center gap-1 min-w-0">
                                        <span className="truncate">{ev.seedName}</span>
                                        {ev.hasConflict && <AlertTriangle className="w-3 h-3 text-yellow-300" />}
                                      </div>

                                      <div className="flex items-center gap-1 ml-1">
                                        <button onClick={e => { e.stopPropagation(); handleEdit(ev.planting); }} className="p-0.5 hover:bg-white/20 rounded" aria-label="Bewerken">
                                          <Edit3 className="w-3 h-3" />
                                        </button>
                                        <button onClick={e => { e.stopPropagation(); handleDelete(ev.planting); }} className="p-0.5 hover:bg-white/20 rounded" aria-label="Verwijderen">
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Greenhouse */}
            {orderedBedGroups.greenhouse.length > 0 && (
              <div>
                <div className="bg-green-50 border-b">
                  <div className="flex items-center">
                    <div className="w-48 p-2 border-r font-semibold text-sm text-green-700">🏠 Kasbakken</div>
                    <div className="flex-1" />
                  </div>
                </div>

                {orderedBedGroups.greenhouse.map(bed => {
                  const segs = segmentsByBed.get(bed.id) || [];
                  return (
                    <div key={`bed-${bed.id}`} className="border-b">
                      <div className="bg-muted/30 border-b">
                        <div className="flex items-center">
                          <div className="w-48 p-2 border-r font-medium text-sm">
                            {bed.name} <span className="ml-2 px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded">Kas</span>
                          </div>
                          <div className="flex-1" />
                        </div>
                      </div>

                      {segs.map(segment => {
                        const segmentKey = `${segment.bedId}-${segment.segmentIndex}`;
                        const segEvents = weekEvents.filter(e => e.segmentKey === segmentKey);

                        return (
                          <div key={`seg-${segment.bedId}-${segment.segmentIndex}`} className="relative">
                            <div className="flex items-center min-h-[48px]">
                              <div className="w-48 p-3 border-r text-sm text-muted-foreground">Segment {segment.segmentIndex + 1}</div>

                              <div className="flex-1 relative h-12 bg-muted/10">
                                {Array.from({ length: 7 }, (_, i) => (
                                  <div key={`div-${segment.bedId}-${segment.segmentIndex}-${i}`} className="absolute top-0 bottom-0 border-r border-muted-foreground/20" style={{ left: `${(i / 7) * 100}%` }} />
                                ))}

                                {segEvents.map((ev, idx) => {
                                  const style = calculateEventStyle(ev);
                                  return (
                                    <div
                                      key={ev.id}
                                      className={`absolute top-1 h-10 rounded px-2 text-white text-xs flex items-center justify-between cursor-pointer hover:opacity-90 transition-opacity ${ev.hasConflict ? "ring-2 ring-red-500 ring-offset-1" : ""}`}
                                      style={{ ...style, backgroundColor: ev.color, zIndex: 10 + idx }}
                                      title={`${ev.seedName}\n${formatDate(ev.startDate)} - ${formatDate(ev.endDate)}\nWeken ${getWeekNumber(ev.startDate)}-${getWeekNumber(ev.endDate)}`}
                                    >
                                      <div className="flex items-center gap-1 min-w-0">
                                        <span className="truncate">{ev.seedName}</span>
                                        {ev.hasConflict && <AlertTriangle className="w-3 h-3 text-yellow-300" />}
                                      </div>

                                      <div className="flex items-center gap-1 ml-1">
                                        <button onClick={e => { e.stopPropagation(); handleEdit(ev.planting); }} className="p-0.5 hover:bg-white/20 rounded" aria-label="Bewerken">
                                          <Edit3 className="w-3 h-3" />
                                        </button>
                                        <button onClick={e => { e.stopPropagation(); handleDelete(ev.planting); }} className="p-0.5 hover:bg-white/20 rounded" aria-label="Verwijderen">
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="bg-muted/30 rounded-lg p-4">
        <h4 className="font-medium text-sm mb-2">Legend</h4>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" /><span>Conflict gedetecteerd</span></div>
          <div className="flex items-center gap-2"><Edit3 className="w-4 h-4" /><span>Bewerk planting</span></div>
          <div className="flex items-center gap-2"><Trash2 className="w-4 h-4" /><span>Verwijder planting</span></div>
        </div>
      </div>

      {/* Edit Dialog — nu met bak-wissel (alleen passende bakken zichtbaar) */}
      {editPlanting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              Planting bewerken: {seeds.find(s => s.id === editPlanting.seed_id)?.name || "—"}
            </h3>

            <div className="space-y-3">
              <label className="block text-sm font-medium">Nieuwe plantdatum</label>
              <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="w-full border rounded px-3 py-2" />

              <label className="block text-sm font-medium mt-2">Bak (alleen waar het past)</label>
              <select className="w-full border rounded px-3 py-2"
                value={selectedBedId} onChange={e => setSelectedBedId(e.target.value)}>
                {bedOptions.map(o => (
                  <option key={o.bed.id} value={o.bed.id}>
                    {o.bed.name} — vrije start: segment {o.seg + 1}
                  </option>
                ))}
                {bedOptions.length === 0 && <option value="">(geen passende bakken)</option>}
              </select>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setEditPlanting(null)} className="px-4 py-2 border rounded hover:bg-muted">Annuleren</button>
                <button type="button" onClick={handleSaveEdit} disabled={!selectedBedId || bedOptions.length===0} className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50">
                  Opslaan
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
