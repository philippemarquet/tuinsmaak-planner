// src/components/TimelineView.tsx
import { useMemo, useState } from "react";
import type { GardenBed, Planting, Seed } from "../lib/types";
import { deletePlanting, updatePlanting } from "../lib/api/plantings";
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

/* ---------- helpers ---------- */
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
  // Donderdag-anker volgens ISO-8601
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((+d - +yearStart) / DAY + 1) / 7);
}

/* ====================================================================== */

export function TimelineView({
  beds = [],
  plantings = [],
  seeds = [],
  conflictsMap = new Map(),
  currentWeek,
  onReload,
}: TimelineViewProps) {
  const [editPlanting, setEditPlanting] = useState<Planting | null>(null);

  /* ---------- derived: segments per bed (buiten eerst, dan kas) ---------- */
  const timelineSegments = useMemo<TimelineSegment[]>(() => {
    const segs: TimelineSegment[] = [];
    if (!Array.isArray(beds) || beds.length === 0) return segs;

    const outdoor = beds.filter(b => !b.is_greenhouse).sort((a, b) => (a?.sort_order || 0) - (b?.sort_order || 0));
    const greenhouse = beds.filter(b => b.is_greenhouse).sort((a, b) => (a?.sort_order || 0) - (b?.sort_order || 0));

    const pushBed = (bedList: GardenBed[]) => {
      for (const bed of bedList) {
        if (!bed?.id || !bed?.name) continue;
        const count = Math.max(1, Number(bed.segments) || 1);
        for (let i = 0; i < count; i++) {
          segs.push({
            bedId: bed.id,
            bedName: bed.name,
            segmentIndex: i,
            isGreenhouse: !!bed.is_greenhouse,
          });
        }
      }
    };

    pushBed(outdoor);
    pushBed(greenhouse);
    return segs;
  }, [beds]);

  /* ---------- derived: events (per segment) ---------- */
  const timelineEvents = useMemo<TimelineEvent[]>(() => {
    if (!Array.isArray(plantings) || plantings.length === 0) return [];
    const seedById: Record<string, Seed> = Object.fromEntries((seeds || []).filter(Boolean).map(s => [s.id, s]));

    const events: TimelineEvent[] = [];

    for (const p of plantings) {
      if (!p?.id || !p?.garden_bed_id || !p?.seed_id) continue;
      const start = parseISO(p.planned_date);
      const end = parseISO(p.planned_harvest_end);
      if (!start || !end) continue;

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
          startDate: start,
          endDate: end, // einddatum is inclusief
          hasConflict: conflicts.length > 0,
          conflictCount: conflicts.length,
          planting: p,
        });
      }
    }

    return events;
  }, [plantings, seeds, conflictsMap]);

  /* ---------- current week bounds (ma -> zo) ---------- */
  const weekBounds = useMemo(() => {
    const start = new Date(currentWeek);
    // forceer op maandag (ISO): currentWeek wordt als maandag aangeleverd in jouw PlannerPage
    // maar voor de zekerheid normaliseren we naar begin van de dag.
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 6 * DAY);
    return { start, end };
  }, [currentWeek]);

  /* ---------- events overlappend met huidige week ---------- */
  const weekEvents = useMemo(() => {
    return timelineEvents.filter(ev => ev.startDate <= weekBounds.end && ev.endDate >= weekBounds.start);
  }, [timelineEvents, weekBounds]);

  /* ---------- helpers voor renderpositie (inclusieve einddag!) ---------- */
  function calculateEventStyle(ev: TimelineEvent) {
    const clampedStart = Math.max(ev.startDate.getTime(), weekBounds.start.getTime());
    const clampedEnd = Math.min(ev.endDate.getTime(), weekBounds.end.getTime());

    const startOffsetDays = Math.floor((clampedStart - weekBounds.start.getTime()) / DAY);
    const spanDaysInclusive = Math.floor((clampedEnd - clampedStart) / DAY) + 1; // +1 want einddag telt mee

    const leftPct = (startOffsetDays / 7) * 100;
    const widthPct = (spanDaysInclusive / 7) * 100;

    const left = Math.max(0, Math.min(100, leftPct));
    const width = Math.max(2, Math.min(100 - left, widthPct)); // minimaal zichtbaar

    return { left: `${left}%`, width: `${width}%` };
  }

  /* ---------- groeperen per bed ---------- */
  const segmentsByBed = useMemo(() => {
    const map = new Map<string, TimelineSegment[]>();
    for (const seg of timelineSegments) {
      if (!seg?.bedId) continue;
      if (!map.has(seg.bedId)) map.set(seg.bedId, []);
      map.get(seg.bedId)!.push(seg);
    }
    return map;
  }, [timelineSegments]);

  const orderedBedGroups = useMemo(() => {
    const outdoor = (beds || [])
      .filter(b => !b.is_greenhouse)
      .sort((a, b) => (a?.sort_order || 0) - (b?.sort_order || 0));
    const greenhouse = (beds || [])
      .filter(b => b.is_greenhouse)
      .sort((a, b) => (a?.sort_order || 0) - (b?.sort_order || 0));
    return { outdoor, greenhouse };
  }, [beds]);

  /* ---------- acties ---------- */
  const handleEdit = (planting: Planting) => setEditPlanting(planting);

  const handleDelete = async (planting: Planting) => {
    const seedName = seeds.find(s => s.id === planting.seed_id)?.name || "planting";
    if (!confirm(`Weet je zeker dat je "${seedName}" wilt verwijderen?`)) return;
    try {
      await deletePlanting(planting.id);
      await onReload();
    } catch (e) {
      alert("Kon planting niet verwijderen: " + e);
    }
  };

  const handleSaveEdit = async (newDateISO: string) => {
    if (!editPlanting) return;
    try {
      const seed = seeds.find(s => s.id === editPlanting.seed_id);
      if (!seed?.grow_duration_weeks || !seed?.harvest_duration_weeks) {
        alert("Zaad heeft geen geldige groei- of oogstduur ingesteld");
        return;
      }
      const plantDate = parseISO(newDateISO);
      if (!plantDate) return;

      const harvestStart = new Date(plantDate.getTime() + seed.grow_duration_weeks * 7 * DAY);
      // inclusieve einddag: start + harvest_weken - 1 dag
      const harvestEnd = new Date(harvestStart.getTime() + (seed.harvest_duration_weeks * 7 * DAY) - DAY);

      await updatePlanting(editPlanting.id, {
        planned_date: newDateISO,
        planned_harvest_start: harvestStart.toISOString().slice(0, 10),
        planned_harvest_end: harvestEnd.toISOString().slice(0, 10),
      } as any);

      await onReload();
      setEditPlanting(null);
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
        <div className="text-center py-8 text-muted-foreground">
          Geen bedden gevonden. Voeg eerst bedden toe in de instellingen.
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-white">
          {/* Day Headers */}
          <div className="bg-muted border-b">
            <div className="flex">
              <div className="w-48 p-3 border-r bg-muted-foreground/5 font-medium text-sm">
                Bak / Segment
              </div>
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

          {/* Timeline Rows */}
          <div className="max-h-96 overflow-y-auto">
            {/* Outdoor */}
            {orderedBedGroups.outdoor.length > 0 && (
              <div>
                <div className="bg-blue-50 border-b">
                  <div className="flex items-center">
                    <div className="w-48 p-2 border-r font-semibold text-sm text-blue-700">
                      🌱 Buitenbakken
                    </div>
                    <div className="flex-1" />
                  </div>
                </div>

                {orderedBedGroups.outdoor.map(bed => {
                  const segs = segmentsByBed.get(bed.id) || [];
                  return (
                    <div key={`bed-${bed.id}`} className="border-b">
                      {/* Bed Header */}
                      <div className="bg-muted/30 border-b">
                        <div className="flex items-center">
                          <div className="w-48 p-2 border-r font-medium text-sm">{bed.name}</div>
                          <div className="flex-1" />
                        </div>
                      </div>

                      {/* Segment Rows */}
                      {segs.map(segment => {
                        const segmentKey = `${segment.bedId}-${segment.segmentIndex}`;
                        const segEvents = weekEvents.filter(e => e.segmentKey === segmentKey);

                        return (
                          <div key={`seg-${segment.bedId}-${segment.segmentIndex}`} className="relative">
                            <div className="flex items-center min-h-[48px]">
                              <div className="w-48 p-3 border-r text-sm text-muted-foreground">
                                Segment {segment.segmentIndex + 1}
                              </div>

                              {/* Timeline area */}
                              <div className="flex-1 relative h-12 bg-muted/10">
                                {/* Day dividers */}
                                {Array.from({ length: 7 }, (_, i) => (
                                  <div
                                    key={`div-${segment.bedId}-${segment.segmentIndex}-${i}`}
                                    className="absolute top-0 bottom-0 border-r border-muted-foreground/20"
                                    style={{ left: `${(i / 7) * 100}%` }}
                                  />
                                ))}

                                {/* Events */}
                                {segEvents.map((ev, idx) => {
                                  const style = calculateEventStyle(ev);
                                  return (
                                    <div
                                      key={ev.id}
                                      className={`absolute top-1 h-10 rounded px-2 text-white text-xs flex items-center justify-between cursor-pointer hover:opacity-90 transition-opacity ${
                                        ev.hasConflict ? "ring-2 ring-red-500 ring-offset-1" : ""
                                      }`}
                                      style={{ ...style, backgroundColor: ev.color, zIndex: 10 + idx }}
                                      title={`${ev.seedName}\n${formatDate(ev.startDate)} - ${formatDate(ev.endDate)}\nWeken ${getWeekNumber(ev.startDate)}-${getWeekNumber(ev.endDate)}`}
                                    >
                                      <div className="flex items-center gap-1 min-w-0">
                                        <span className="truncate">{ev.seedName}</span>
                                        {ev.hasConflict && <AlertTriangle className="w-3 h-3 text-yellow-300" />}
                                      </div>

                                      <div className="flex items-center gap-1 ml-1">
                                        <button
                                          onClick={e => {
                                            e.stopPropagation();
                                            handleEdit(ev.planting);
                                          }}
                                          className="p-0.5 hover:bg-white/20 rounded"
                                          aria-label="Bewerken"
                                        >
                                          <Edit3 className="w-3 h-3" />
                                        </button>
                                        <button
                                          onClick={e => {
                                            e.stopPropagation();
                                            handleDelete(ev.planting);
                                          }}
                                          className="p-0.5 hover:bg-white/20 rounded"
                                          aria-label="Verwijderen"
                                        >
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
                      {/* Bed Header */}
                      <div className="bg-muted/30 border-b">
                        <div className="flex items-center">
                          <div className="w-48 p-2 border-r font-medium text-sm">
                            {bed.name}
                            <span className="ml-2 px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded">Kas</span>
                          </div>
                          <div className="flex-1" />
                        </div>
                      </div>

                      {/* Segment Rows */}
                      {segs.map(segment => {
                        const segmentKey = `${segment.bedId}-${segment.segmentIndex}`;
                        const segEvents = weekEvents.filter(e => e.segmentKey === segmentKey);

                        return (
                          <div key={`seg-${segment.bedId}-${segment.segmentIndex}`} className="relative">
                            <div className="flex items-center min-h-[48px]">
                              <div className="w-48 p-3 border-r text-sm text-muted-foreground">
                                Segment {segment.segmentIndex + 1}
                              </div>

                              <div className="flex-1 relative h-12 bg-muted/10">
                                {Array.from({ length: 7 }, (_, i) => (
                                  <div
                                    key={`div-${segment.bedId}-${segment.segmentIndex}-${i}`}
                                    className="absolute top-0 bottom-0 border-r border-muted-foreground/20"
                                    style={{ left: `${(i / 7) * 100}%` }}
                                  />
                                ))}

                                {segEvents.map((ev, idx) => {
                                  const style = calculateEventStyle(ev);
                                  return (
                                    <div
                                      key={ev.id}
                                      className={`absolute top-1 h-10 rounded px-2 text-white text-xs flex items-center justify-between cursor-pointer hover:opacity-90 transition-opacity ${
                                        ev.hasConflict ? "ring-2 ring-red-500 ring-offset-1" : ""
                                      }`}
                                      style={{ ...style, backgroundColor: ev.color, zIndex: 10 + idx }}
                                      title={`${ev.seedName}\n${formatDate(ev.startDate)} - ${formatDate(ev.endDate)}\nWeken ${getWeekNumber(ev.startDate)}-${getWeekNumber(ev.endDate)}`}
                                    >
                                      <div className="flex items-center gap-1 min-w-0">
                                        <span className="truncate">{ev.seedName}</span>
                                        {ev.hasConflict && <AlertTriangle className="w-3 h-3 text-yellow-300" />}
                                      </div>

                                      <div className="flex items-center gap-1 ml-1">
                                        <button
                                          onClick={e => {
                                            e.stopPropagation();
                                            handleEdit(ev.planting);
                                          }}
                                          className="p-0.5 hover:bg-white/20 rounded"
                                          aria-label="Bewerken"
                                        >
                                          <Edit3 className="w-3 h-3" />
                                        </button>
                                        <button
                                          onClick={e => {
                                            e.stopPropagation();
                                            handleDelete(ev.planting);
                                          }}
                                          className="p-0.5 hover:bg-white/20 rounded"
                                          aria-label="Verwijderen"
                                        >
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
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span>Conflict gedetecteerd</span>
          </div>
          <div className="flex items-center gap-2">
            <Edit3 className="w-4 h-4" />
            <span>Bewerk planting</span>
          </div>
          <div className="flex items-center gap-2">
            <Trash2 className="w-4 h-4" />
            <span>Verwijder planting</span>
          </div>
        </div>
      </div>

      {/* Edit Dialog */}
      {editPlanting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              Planting Bewerken: {seeds.find(s => s.id === editPlanting.seed_id)?.name || "—"}
            </h3>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const newDate = String(formData.get("date") || "");
                if (newDate) handleSaveEdit(newDate);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium mb-1">Nieuwe plantdatum</label>
                <input
                  type="date"
                  name="date"
                  defaultValue={editPlanting.planned_date || ""}
                  className="w-full border rounded px-3 py-2"
                  required
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditPlanting(null)}
                  className="px-4 py-2 border rounded hover:bg-muted"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
                >
                  Opslaan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
