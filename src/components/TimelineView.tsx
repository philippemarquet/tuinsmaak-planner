// src/components/TimelineView.tsx
import { useMemo, useState, useEffect } from "react";
import type { GardenBed, Planting, Seed } from "../lib/types";
import { deletePlanting, updatePlanting, createPlanting } from "../lib/api/plantings";
import { occupancyWindow } from "../lib/conflicts";
import { Trash2, Edit3, AlertTriangle, X, CalendarIcon } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Button } from "./ui/button";
import { format, addDays as dateAddDays } from "date-fns";
import { nl } from "date-fns/locale";
import { cn } from "../lib/utils";
import { toast } from "sonner";

interface TimelineViewProps {
  beds: GardenBed[];
  plantings: Planting[];
  seeds: Seed[];
  conflictsMap: Map<string, Planting[]>;
  currentWeek: Date;
  onReload: () => Promise<void>;
  gardenId?: string;
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

// Droppable segment for timeline
function TimelineDroppable({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-1 relative h-12 transition-colors duration-150",
        isOver ? "bg-primary/20" : "bg-muted/10"
      )}
    >
      {children}
    </div>
  );
}

export function TimelineView({
  beds = [],
  plantings = [],
  seeds = [],
  conflictsMap = new Map(),
  currentWeek,
  onReload,
  gardenId,
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
    try { 
      await deletePlanting(p.id); 
      toast.success("Planting verwijderd");
      await onReload(); 
    } catch (e) { 
      toast.error("Kon planting niet verwijderen");
    }
  };

  /* ======= Edit popup logic: bed wisselen met alleen passende opties ======= */
  const [editDate, setEditDate] = useState<Date | undefined>(undefined);
  const [bedOptions, setBedOptions] = useState<Array<{ bed: GardenBed; seg: number }>>([]);
  const [selectedBedId, setSelectedBedId] = useState<string>("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  useEffect(() => {
    if (!editPlanting) return;
    setEditDate(parseISO(editPlanting.planned_date) || undefined);
    setSelectedBedId(editPlanting.garden_bed_id || "");
  }, [editPlanting?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!editPlanting) { setBedOptions([]); return; }
    const seed = seeds.find(s => s.id === editPlanting.seed_id);
    if (!seed) { setBedOptions([]); return; }

    // Bereken bezettingsperiode o.b.v. gekozen datum + grow/harvest (einddag inclusief)
    const plantDate = editDate || parseISO(editPlanting.planned_date);
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
    if (!editPlanting || !editDate) return;
    const seed = seeds.find(s => s.id === editPlanting.seed_id);
    if (!seed) return;

    const harvestStart = new Date(editDate.getTime() + (seed.grow_duration_weeks ?? 0) * 7 * DAY);
    const harvestEnd   = new Date(harvestStart.getTime() + (seed.harvest_duration_weeks ?? 0) * 7 * DAY - DAY);

    const choice = bedOptions.find(o => o.bed.id === selectedBedId);
    if (!choice) { 
      toast.error("Geen passende bak beschikbaar voor deze datum");
      return; 
    }

    try {
      await updatePlanting(editPlanting.id, {
        garden_bed_id: choice.bed.id,
        start_segment: choice.seg,
        planned_date: editDate.toISOString().slice(0,10),
        planned_harvest_start: harvestStart.toISOString().slice(0,10),
        planned_harvest_end: harvestEnd.toISOString().slice(0,10),
      } as any);
      toast.success("Planting bijgewerkt");
      setEditPlanting(null);
      await onReload();
    } catch (e) {
      toast.error("Kon planting niet bijwerken");
    }
  };

  const renderBedRows = (bedList: GardenBed[], isGreenhouse: boolean) => (
    <>
      {bedList.map(bed => {
        const segs = segmentsByBed.get(bed.id) || [];
        return (
          <div key={`bed-${bed.id}`} className="border-b border-border/30">
            {/* Bed header */}
            <div className="bg-muted/20 border-b border-border/20">
              <div className="flex items-center">
                <div className="w-40 px-3 py-2 border-r border-border/30 font-medium text-sm flex items-center gap-2">
                  {bed.name}
                  {isGreenhouse && (
                    <span className="px-1.5 py-0.5 text-[10px] bg-emerald-100 text-emerald-700 rounded font-medium">Kas</span>
                  )}
                </div>
                <div className="flex-1" />
              </div>
            </div>

            {/* Segments */}
            {segs.map(segment => {
              const segmentKey = `${segment.bedId}-${segment.segmentIndex}`;
              const segEvents = weekEvents.filter(e => e.segmentKey === segmentKey);
              const droppableId = `timeline__${bed.id}__segment__${segment.segmentIndex}`;
              
              return (
                <div key={`seg-${segment.bedId}-${segment.segmentIndex}`} className="relative">
                  <div className="flex items-center min-h-[48px]">
                    <div className="w-40 px-3 py-2 border-r border-border/30 text-xs text-muted-foreground">
                      Segment {segment.segmentIndex + 1}
                    </div>

                    <TimelineDroppable id={droppableId}>
                      {/* Day dividers */}
                      {Array.from({ length: 7 }, (_, i) => (
                        <div 
                          key={`div-${segment.bedId}-${segment.segmentIndex}-${i}`} 
                          className="absolute top-0 bottom-0 border-r border-border/20" 
                          style={{ left: `${(i / 7) * 100}%` }} 
                        />
                      ))}

                      {/* Events */}
                      {segEvents.map((ev, idx) => {
                        const style = calculateEventStyle(ev);
                        return (
                          <div
                            key={ev.id}
                            className={cn(
                              "absolute top-1.5 h-9 rounded-lg px-2 text-white text-xs flex items-center justify-between cursor-pointer shadow-sm transition-all duration-150 hover:shadow-md hover:scale-[1.01]",
                              ev.hasConflict && "ring-2 ring-red-500 ring-offset-1"
                            )}
                            style={{ ...style, backgroundColor: ev.color, zIndex: 10 + idx }}
                            title={`${ev.seedName}\n${formatDate(ev.startDate)} - ${formatDate(ev.endDate)}\nWeken ${getWeekNumber(ev.startDate)}-${getWeekNumber(ev.endDate)}`}
                          >
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="truncate font-medium">{ev.seedName}</span>
                              {ev.hasConflict && <AlertTriangle className="w-3 h-3 text-yellow-300 flex-shrink-0" />}
                            </div>

                            <div className="flex items-center gap-0.5 ml-1 flex-shrink-0">
                              <button 
                                onClick={e => { e.stopPropagation(); handleEdit(ev.planting); }} 
                                className="p-1 hover:bg-white/20 rounded-md transition-colors" 
                                aria-label="Bewerken"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                              <button 
                                onClick={e => { e.stopPropagation(); handleDelete(ev.planting); }} 
                                className="p-1 hover:bg-white/20 rounded-md transition-colors" 
                                aria-label="Verwijderen"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </TimelineDroppable>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );

  /* ================================ RENDER ================================ */

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Timeline Weergave</h3>
        <p className="text-sm text-muted-foreground">
          Week {getWeekNumber(weekBounds.start)} • {format(weekBounds.start, "d MMM", { locale: nl })} - {format(weekBounds.end, "d MMM yyyy", { locale: nl })}
        </p>
      </div>

      {!beds || beds.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
          Geen bedden gevonden. Voeg eerst bedden toe in de instellingen.
        </div>
      ) : (
        <div className="border border-border/50 rounded-xl overflow-hidden bg-card shadow-sm">
          {/* Day Headers */}
          <div className="bg-muted/30 border-b border-border/30">
            <div className="flex">
              <div className="w-40 px-3 py-2.5 border-r border-border/30 bg-muted/20 font-medium text-sm text-muted-foreground">
                Bak / Segment
              </div>
              <div className="flex-1 flex">
                {Array.from({ length: 7 }, (_, i) => {
                  const dayDate = new Date(weekBounds.start.getTime() + i * DAY);
                  const dayName = dayDate.toLocaleDateString("nl-NL", { weekday: "short" });
                  const dayNumber = dayDate.getDate();
                  const isToday = new Date().toDateString() === dayDate.toDateString();
                  return (
                    <div 
                      key={`day-${i}`} 
                      className={cn(
                        "flex-1 py-2 border-r border-border/20 text-center text-sm",
                        isToday && "bg-primary/10"
                      )}
                    >
                      <div className={cn("font-medium", isToday && "text-primary")}>{dayName}</div>
                      <div className={cn("text-xs", isToday ? "text-primary" : "text-muted-foreground")}>{dayNumber}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Rows */}
          <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
            {/* Outdoor */}
            {orderedBedGroups.outdoor.length > 0 && (
              <div>
                <div className="bg-blue-50/50 border-b border-blue-100">
                  <div className="flex items-center">
                    <div className="w-40 px-3 py-2 border-r border-blue-100 font-semibold text-sm text-blue-700 flex items-center gap-2">
                      🌱 Buitenbakken
                    </div>
                    <div className="flex-1" />
                  </div>
                </div>
                {renderBedRows(orderedBedGroups.outdoor, false)}
              </div>
            )}

            {/* Greenhouse */}
            {orderedBedGroups.greenhouse.length > 0 && (
              <div>
                <div className="bg-emerald-50/50 border-b border-emerald-100">
                  <div className="flex items-center">
                    <div className="w-40 px-3 py-2 border-r border-emerald-100 font-semibold text-sm text-emerald-700 flex items-center gap-2">
                      🏠 Kasbakken
                    </div>
                    <div className="flex-1" />
                  </div>
                </div>
                {renderBedRows(orderedBedGroups.greenhouse, true)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-6 text-xs text-muted-foreground px-1">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
          <span>Conflict</span>
        </div>
        <div className="flex items-center gap-2">
          <Edit3 className="w-3.5 h-3.5" />
          <span>Bewerken</span>
        </div>
        <div className="flex items-center gap-2">
          <Trash2 className="w-3.5 h-3.5" />
          <span>Verwijderen</span>
        </div>
      </div>

      {/* Edit Dialog - Modern Style */}
      <Dialog open={!!editPlanting} onOpenChange={(open) => !open && setEditPlanting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div 
                className="w-4 h-4 rounded-full ring-2 ring-white shadow-md"
                style={{ background: editPlanting?.color || "#22c55e" }}
              />
              <span>Planting bewerken</span>
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {seeds.find(s => s.id === editPlanting?.seed_id)?.name || "Onbekend"}
            </p>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Date picker */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Plantdatum</label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm border-b border-border/50 hover:border-primary/50 transition-colors bg-transparent text-left"
                  >
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    {editDate ? format(editDate, "EEEE d MMMM yyyy", { locale: nl }) : "Selecteer datum"}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={editDate}
                    onSelect={(d) => { setEditDate(d); setDatePickerOpen(false); }}
                    initialFocus
                    className="pointer-events-auto"
                    locale={nl}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Bed selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Bak (alleen waar het past)</label>
              <Select value={selectedBedId} onValueChange={setSelectedBedId}>
                <SelectTrigger className="w-full border-0 border-b border-border/50 rounded-none hover:border-primary/50 transition-colors">
                  <SelectValue placeholder="Selecteer bak" />
                </SelectTrigger>
                <SelectContent>
                  {bedOptions.map(o => (
                    <SelectItem key={o.bed.id} value={o.bed.id}>
                      {o.bed.name} — segment {o.seg + 1}
                      {o.bed.is_greenhouse && " (kas)"}
                    </SelectItem>
                  ))}
                  {bedOptions.length === 0 && (
                    <SelectItem value="none" disabled>
                      Geen passende bakken
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditPlanting(null)}>
              Annuleren
            </Button>
            <Button 
              onClick={handleSaveEdit} 
              disabled={!selectedBedId || bedOptions.length === 0}
            >
              Opslaan
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
