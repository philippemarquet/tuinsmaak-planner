// src/components/TimelineView.tsx
import { useMemo, useState } from "react";
import type { GardenBed, Planting, Seed } from "../lib/types";
import { deletePlanting, updatePlanting } from "../lib/api/plantings";
import { Trash2, Edit3, Calendar, AlertTriangle } from "lucide-react";

interface TimelineViewProps {
  beds: GardenBed[];
  plantings: Planting[];
  seeds: Seed[];
  conflictsMap: Map<string, Planting[]>;
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

// Helper functions
function parseISO(iso?: string | null): Date | null {
  return iso ? new Date(iso) : null;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("nl-NL", { 
    day: "2-digit", 
    month: "2-digit",
    year: "numeric"
  });
}

function getWeekNumber(date: Date): number {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}

export function TimelineView({ beds = [], plantings = [], seeds = [], conflictsMap = new Map(), onReload }: TimelineViewProps) {
  const [editPlanting, setEditPlanting] = useState<Planting | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  // Early return if no data
  if (!beds.length) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Geen bedden gevonden. Voeg eerst bedden toe in de instellingen.
      </div>
    );
  }
  
  // Create timeline segments (one per bed segment)
  const timelineSegments = useMemo((): TimelineSegment[] => {
    try {
      const segments: TimelineSegment[] = [];
      
      if (!beds || beds.length === 0) return segments;
      
      for (const bed of beds.sort((a, b) => (a?.sort_order || 0) - (b?.sort_order || 0))) {
        if (!bed?.id || !bed?.name || typeof bed.segments !== 'number') continue;
        
        const segmentCount = Math.max(1, bed.segments);
        for (let i = 0; i < segmentCount; i++) {
          segments.push({
            bedId: bed.id,
            bedName: bed.name,
            segmentIndex: i,
            isGreenhouse: Boolean(bed.is_greenhouse),
          });
        }
      }
      
      return segments;
    } catch (error) {
      console.error("Error creating timeline segments:", error);
      return [];
    }
  }, [beds]);

  // Create timeline events from plantings
  const timelineEvents = useMemo((): TimelineEvent[] => {
    try {
      const events: TimelineEvent[] = [];
      
      if (!seeds || !plantings || !conflictsMap) return events;
      
      const seedsById = Object.fromEntries((seeds || []).map(s => s?.id ? [s.id, s] : []).filter(Boolean));
      
      for (const planting of plantings || []) {
        if (!planting?.id || !planting?.garden_bed_id || !planting?.seed_id) continue;
        
        const startISO = planting.planned_date;
        const endISO = planting.planned_harvest_end;
        
        if (!startISO || !endISO) continue;
        
        const startDate = parseISO(startISO);
        const endDate = parseISO(endISO);
        
        if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) continue;
        
        const seed = seedsById[planting.seed_id];
        const startSeg = Math.max(0, planting.start_segment || 0);
        const usedSegs = Math.max(1, planting.segments_used || 1);
        
        // Create events for each segment this planting occupies
        for (let i = 0; i < usedSegs; i++) {
          const segmentIndex = startSeg + i;
          const segmentKey = `${planting.garden_bed_id}-${segmentIndex}`;
          
          const conflicts = conflictsMap.get(planting.id) || [];
          
          events.push({
            id: `${planting.id}-${segmentIndex}`,
            plantingId: planting.id,
            segmentKey,
            seedName: seed?.name || "Onbekend",
            color: planting.color?.startsWith("#") ? planting.color : "#22c55e",
            startDate,
            endDate,
            hasConflict: conflicts.length > 0,
            conflictCount: conflicts.length,
            planting,
          });
        }
      }
      
      return events;
    } catch (error) {
      console.error("Error creating timeline events:", error);
      return [];
    }
  }, [plantings, seeds, conflictsMap]);

  // Filter events by selected year
  const yearEvents = useMemo(() => {
    return timelineEvents.filter(event => 
      event.startDate.getFullYear() === selectedYear || 
      event.endDate.getFullYear() === selectedYear
    );
  }, [timelineEvents, selectedYear]);

  // Calculate timeline bounds for the selected year
  const timelineBounds = useMemo(() => {
    const yearStart = new Date(selectedYear, 0, 1);
    const yearEnd = new Date(selectedYear, 11, 31);
    return { start: yearStart, end: yearEnd };
  }, [selectedYear]);

  // Calculate position and width for events
  const calculateEventStyle = (event: TimelineEvent) => {
    const totalDays = (timelineBounds.end.getTime() - timelineBounds.start.getTime()) / (1000 * 60 * 60 * 24);
    
    const eventStart = Math.max(event.startDate.getTime(), timelineBounds.start.getTime());
    const eventEnd = Math.min(event.endDate.getTime(), timelineBounds.end.getTime());
    
    const startOffset = (eventStart - timelineBounds.start.getTime()) / (1000 * 60 * 60 * 24);
    const duration = (eventEnd - eventStart) / (1000 * 60 * 60 * 24);
    
    const left = (startOffset / totalDays) * 100;
    const width = Math.max(0.5, (duration / totalDays) * 100);
    
    return { left: `${left}%`, width: `${width}%` };
  };

  // Group segments by bed
  const segmentsByBed = useMemo(() => {
    try {
      const grouped = new Map<string, TimelineSegment[]>();
      
      for (const segment of timelineSegments || []) {
        if (!segment?.bedId) continue;
        
        if (!grouped.has(segment.bedId)) {
          grouped.set(segment.bedId, []);
        }
        grouped.get(segment.bedId)?.push(segment);
      }
      
      return grouped;
    } catch (error) {
      console.error("Error grouping segments:", error);
      return new Map();
    }
  }, [timelineSegments]);

  // Handle edit planting
  const handleEdit = (planting: Planting) => {
    setEditPlanting(planting);
  };

  // Handle delete planting
  const handleDelete = async (planting: Planting) => {
    if (confirm(`Weet je zeker dat je "${seeds.find(s => s.id === planting.seed_id)?.name}" wilt verwijderen?`)) {
      try {
        await deletePlanting(planting.id);
        await onReload();
      } catch (error) {
        alert("Kon planting niet verwijderen: " + error);
      }
    }
  };

  // Handle save edit
  const handleSaveEdit = async (newDate: string) => {
    if (!editPlanting) return;
    
    try {
      const seed = seeds.find(s => s.id === editPlanting.seed_id);
      if (!seed?.grow_duration_weeks || !seed?.harvest_duration_weeks) {
        alert("Zaad heeft geen geldige groei- of oogstduur ingesteld");
        return;
      }
      
      const plantDate = new Date(newDate);
      const harvestStart = new Date(plantDate);
      harvestStart.setDate(harvestStart.getDate() + (seed.grow_duration_weeks * 7));
      const harvestEnd = new Date(harvestStart);
      harvestEnd.setDate(harvestEnd.getDate() + (seed.harvest_duration_weeks * 7));
      
      await updatePlanting(editPlanting.id, {
        planned_date: newDate,
        planned_harvest_start: harvestStart.toISOString().slice(0, 10),
        planned_harvest_end: harvestEnd.toISOString().slice(0, 10),
      } as any);
      
      await onReload();
      setEditPlanting(null);
    } catch (error) {
      alert("Kon planting niet bijwerken: " + error);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold">Timeline Weergave</h3>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            Jaar:
            <select 
              value={selectedYear} 
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="border rounded px-2 py-1"
            >
              {Array.from({length: 5}, (_, i) => {
                const year = new Date().getFullYear() + i - 2;
                return (
                  <option key={year} value={year}>{year}</option>
                );
              })}
            </select>
          </label>
        </div>
      </div>

      {/* Timeline Grid */}
      <div className="border rounded-lg overflow-hidden bg-white">
        {/* Month Headers */}
        <div className="bg-muted border-b">
          <div className="flex">
            <div className="w-48 p-3 border-r bg-muted-foreground/5 font-medium text-sm">
              Bak / Segment
            </div>
            <div className="flex-1 flex">
              {Array.from({length: 12}, (_, i) => {
                const monthDate = new Date(selectedYear, i, 1);
                const monthName = monthDate.toLocaleDateString("nl-NL", { month: "short" });
                return (
                  <div key={i} className="flex-1 p-2 border-r text-center text-sm font-medium">
                    {monthName}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Timeline Rows */}
        <div className="max-h-96 overflow-y-auto">
          {Array.from(segmentsByBed.entries()).map(([bedId, segments]) => {
            const bed = beds.find(b => b.id === bedId)!;
            
            return (
              <div key={bedId} className="border-b">
                {/* Bed Header */}
                <div className="bg-muted/30 border-b">
                  <div className="flex items-center">
                    <div className="w-48 p-2 border-r font-medium text-sm">
                      {bed.name}
                      {bed.is_greenhouse && (
                        <span className="ml-2 px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded">
                          Kas
                        </span>
                      )}
                    </div>
                    <div className="flex-1"></div>
                  </div>
                </div>
                
                {/* Segment Rows */}
                {segments.map((segment) => {
                  const segmentKey = `${segment.bedId}-${segment.segmentIndex}`;
                  const segmentEvents = yearEvents.filter(e => e.segmentKey === segmentKey);
                  
                  return (
                    <div key={`${segment.bedId}-${segment.segmentIndex}`} className="relative">
                      <div className="flex items-center min-h-[48px]">
                        <div className="w-48 p-3 border-r text-sm text-muted-foreground">
                          Segment {segment.segmentIndex + 1}
                        </div>
                        
                        {/* Timeline Area */}
                        <div className="flex-1 relative h-12 bg-muted/10">
                          {/* Month Dividers */}
                          {Array.from({length: 12}, (_, i) => (
                            <div 
                              key={i}
                              className="absolute top-0 bottom-0 border-r border-muted-foreground/20"
                              style={{ left: `${(i / 12) * 100}%` }}
                            />
                          ))}
                          
                          {/* Events */}
                          {segmentEvents.map((event, index) => {
                            const style = calculateEventStyle(event);
                            
                            return (
                              <div
                                key={event.id}
                                className={`absolute top-1 h-10 rounded px-2 text-white text-xs flex items-center justify-between cursor-pointer hover:opacity-90 transition-opacity ${
                                  event.hasConflict ? 'ring-2 ring-red-500 ring-offset-1' : ''
                                }`}
                                style={{
                                  ...style,
                                  backgroundColor: event.color,
                                  zIndex: 10 + index,
                                }}
                                title={`${event.seedName}\n${formatDate(event.startDate)} - ${formatDate(event.endDate)}\nWeken ${getWeekNumber(event.startDate)}-${getWeekNumber(event.endDate)}`}
                              >
                                <div className="flex items-center gap-1 min-w-0">
                                  <span className="truncate">{event.seedName}</span>
                                  {event.hasConflict && (
                                    <AlertTriangle className="w-3 h-3 text-yellow-300" />
                                  )}
                                </div>
                                
                                <div className="flex items-center gap-1 ml-1">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEdit(event.planting);
                                    }}
                                    className="p-0.5 hover:bg-white/20 rounded"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDelete(event.planting);
                                    }}
                                    className="p-0.5 hover:bg-white/20 rounded"
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
      </div>

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
              Planting Bewerken: {seeds.find(s => s.id === editPlanting.seed_id)?.name}
            </h3>
            
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const newDate = formData.get("date") as string;
                handleSaveEdit(newDate);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium mb-1">
                  Nieuwe plantdatum
                </label>
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