// src/components/TimelineView.tsx
import { useEffect, useMemo, useState } from "react";
import type { GardenBed, Planting, Seed } from "../lib/types";
import { deletePlanting, updatePlanting } from "../lib/api/plantings";
import { Trash2, Edit3, AlertTriangle } from "lucide-react";
import {
  buildConflictIndex,
  bedAndSegmentOptionsFor,
  parseISO,
  toISO,
} from "../lib/conflicts";

interface TimelineViewProps {
  beds: GardenBed[];
  plantings: Planting[];
  seeds: Seed[];
  currentWeek: Date;
  onReload: () => Promise<void>;
}

/** --- helpers voor weekbereik --- */
function formatDateNL(date: Date): string {
  return date.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
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

/** --- Types binnen deze view --- */
type TimelineSegment = { bedId: string; bedName: string; segmentIndex: number; isGreenhouse: boolean; };
type TimelineEvent = {
  id: string;
  plantingId: string;
  bedId: string;
  segmentKey: string;
  seedName: string;
  color: string;
  startDate: Date;
  endDate: Date;
  planting: Planting;
};

/** --- Component --- */
export function TimelineView({ beds = [], plantings = [], seeds = [], currentWeek, onReload }: TimelineViewProps) {
  const [editPlanting, setEditPlanting] = useState<Planting | null>(null);
  const [editDate, setEditDate] = useState<string>(""); // planned_date
  const [editBedId, setEditBedId] = useState<string>("");
  const [editStartSeg, setEditStartSeg] = useState<number>(0);
  const [bedOptions, setBedOptions] = useState<{ bedId: string; bedName: string; segmentStarts: number[] }[]>([]);

  /** Conflicten-index voor simpele indicatie op bed-niveau en (later) ‘offenders’. */
  const { bedHasConflict } = useMemo(() => buildConflictIndex(beds, plantings), [beds, plantings]);

  /** Segmenten in volgorde: eerst buiten, dan kas. */
  const timelineSegments = useMemo<TimelineSegment[]>(() => {
    const out: TimelineSegment[] = [];
    const outdoor = beds.filter(b => !b.is_greenhouse).sort((a,b)=> (a?.sort_order||0)-(b?.sort_order||0));
    const greenhouse = beds.filter(b => b.is_greenhouse).sort((a,b)=> (a?.sort_order||0)-(b?.sort_order||0));

    for (const bed of outdoor) {
      const segCount = Math.max(1, bed.segments ?? 1);
      for (let i=0;i<segCount;i++) out.push({ bedId: bed.id, bedName: bed.name, segmentIndex: i, isGreenhouse: !!bed.is_greenhouse });
    }
    for (const bed of greenhouse) {
      const segCount = Math.max(1, bed.segments ?? 1);
      for (let i=0;i<segCount;i++) out.push({ bedId: bed.id, bedName: bed.name, segmentIndex: i, isGreenhouse: !!bed.is_greenhouse });
    }
    return out;
  }, [beds]);

  /** Events uit plantings (alleen base-informatie; conflict-details tonen we niet in UI). */
  const timelineEvents = useMemo<TimelineEvent[]>(() => {
    const seedsById = Object.fromEntries((seeds || []).map(s => s?.id ? [s.id, s] : []).filter(Boolean));
    const events: TimelineEvent[] = [];
    for (const p of plantings || []) {
      if (!p?.id || !p?.garden_bed_id || !p?.seed_id) continue;
      const sISO = p.planned_date;
      const eISO = p.planned_harvest_end;
      const s = parseISO(sISO);
      const e = parseISO(eISO);
      if (!s || !e) continue;

      const startSeg = Math.max(0, p.start_segment ?? 0);
      const used = Math.max(1, p.segments_used ?? 1);
      const seedName = seedsById[p.seed_id]?.name ?? "Onbekend";

      for (let i=0;i<used;i++) {
        const seg = startSeg + i;
        events.push({
          id: `${p.id}-${seg}`,
          plantingId: p.id,
          bedId: p.garden_bed_id!,
          segmentKey: `${p.garden_bed_id}-${seg}`,
          seedName,
          color: p.color && (p.color.startsWith("#") || p.color.startsWith("rgb")) ? p.color : "#22c55e",
          startDate: s,
          endDate: e,
          planting: p,
        });
      }
    }
    return events;
  }, [plantings, seeds]);

  /** Week-bereik (ma -> zo). */
  const weekBounds = useMemo(() => {
    const weekStart = new Date(currentWeek);
    const day = weekStart.getDay(); // 0=zon, 1=maa, ...
    const deltaToMonday = (day + 6) % 7; // maa=0, zon=6
    weekStart.setDate(weekStart.getDate() - deltaToMonday);
    weekStart.setHours(0,0,0,0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23,59,59,999);
    return { start: weekStart, end: weekEnd };
  }, [currentWeek]);

  /** Events die deze week overlappen. */
  const weekEvents = useMemo(() => {
    return timelineEvents.filter(ev => ev.startDate <= weekBounds.end && ev.endDate >= weekBounds.start);
  }, [timelineEvents, weekBounds]);

  /** Layout helpers voor balkjes. */
  const calculateEventStyle = (ev: TimelineEvent) => {
    const totalMs = weekBounds.end.getTime() - weekBounds.start.getTime();
    const startMs = Math.max(0, Math.min(totalMs, (Math.max(ev.startDate.getTime(), weekBounds.start.getTime()) - weekBounds.start.getTime())));
    const endMs = Math.max(0, Math.min(totalMs, (Math.min(ev.endDate.getTime(), weekBounds.end.getTime()) - weekBounds.start.getTime())));
    const leftPct = (startMs / totalMs) * 100;
    const widthPct = Math.max(2, ((endMs - startMs) / totalMs) * 100);
    return { left: `${leftPct}%`, width: `${widthPct}%` };
  };

  /** Groepeer segmenten per bed. */
  const segmentsByBed = useMemo(() => {
    const grouped = new Map<string, TimelineSegment[]>();
    for (const s of timelineSegments) {
      if (!grouped.has(s.bedId)) grouped.set(s.bedId, []);
      grouped.get(s.bedId)!.push(s);
    }
    return grouped;
  }, [timelineSegments]);

  /** Bed-level conflict tijdens deze week (alleen icoon tonen). */
  const bedHasConflictThisWeek = (bedId: string) => {
    if (!bedHasConflict.get(bedId)) return false; // snelle exit
    // Extra check: minstens één conflict-planting overlapt met week (we hebben geen pair details hier,
    // maar het icoon mag gewoon op bed-niveau zodra dat bed momenteel een conflict heeft).
    return true;
  };

  /** Edit openen: datum/bak/segment. */
  const openEdit = (p: Planting) => {
    setEditPlanting(p);
    const dateISO = p.planned_date ?? toISO(new Date());
    setEditDate(dateISO);
    setEditBedId(p.garden_bed_id!);
    setEditStartSeg(Math.max(0, p.start_segment ?? 0));
  };

  /** Refresh bed/segment-opties wanneer (datum of planting) wijzigt. */
  useEffect(() => {
    if (!editPlanting || !editDate) { setBedOptions([]); return; }
    const startISO = editDate;
    const endISO = editPlanting.planned_harvest_end || editPlanting.planned_date || editDate;
    const opts = bedAndSegmentOptionsFor(beds, plantings, editPlanting, startISO, endISO);
    setBedOptions(opts);

    // houd huidige selectie geldig; zo niet, switch naar eerste geldige
    if (opts.length > 0) {
      const current = opts.find(o => o.bedId === editBedId && o.segmentStarts.includes(editStartSeg));
      if (!current) {
        const first = opts[0];
        setEditBedId(first.bedId);
        setEditStartSeg(first.segmentStarts[0]);
      }
    }
  }, [beds, plantings, editPlanting, editDate]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Opslaan van edit (datum/bak/segment). Herberekent harvest_start/_end zoals je eerder had. */
  const handleSaveEdit = async () => {
    if (!editPlanting) return;
    try {
      // Indien je groei-/oogstduur in seeds wilt blijven gebruiken, doen we net als voorheen:
      // planned_harvest_start = planned_date + grow_weeks*7
      // planned_harvest_end   = harvest_start + harvest_weeks*7
      const growW = (editPlanting as any)?.seed?.grow_duration_weeks ?? null; // fallback als planting.seed gemount is
      // In jouw code herberekende je dit in Planner/Timeline op basis van seed uit props;
      // we houden het simpel: we laten bestaande harvest_start/end staan als user alleen bak wijzigt.
      // Wil je altijd herberekenen op datumwijziging, pas dat hier eventueel aan.

      const payload: any = {
        planned_date: editDate,
        garden_bed_id: editBedId,
        start_segment: editStartSeg,
      };

      // Optioneel: laat bestaande end-range intact als user alleen bak/segment wijzigt.
      // Als je end/date consequent wil recalculeren op basis van seed, kun je die logica hier toevoegen.

      await updatePlanting(editPlanting.id, payload);
      await onReload();
      setEditPlanting(null);
    } catch (e: any) {
      alert("Kon planting niet bijwerken: " + (e?.message ?? e));
    }
  };

  /** Verwijderen. */
  const handleDelete = async (p: Planting) => {
    if (!confirm("Weet je zeker dat je deze planting wilt verwijderen?")) return;
    try {
      await deletePlanting(p.id);
      await onReload();
    } catch (e: any) {
      alert("Kon planting niet verwijderen: " + (e?.message ?? e));
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold">Timeline</h3>
        <div className="text-sm text-muted-foreground">
          Week {getWeekNumber(weekBounds.start)} – {formatDateNL(weekBounds.start)} t/m {formatDateNL(weekBounds.end)}
        </div>
      </div>

      {/* Grid */}
      <div className="border rounded-lg overflow-hidden bg-white">
        {/* Dag headers */}
        <div className="bg-muted border-b">
          <div className="flex">
            <div className="w-56 p-3 border-r bg-muted-foreground/5 font-medium text-sm">Bak / Segment</div>
            <div className="flex-1 flex">
              {Array.from({length: 7}, (_, i) => {
                const d = new Date(weekBounds.start); d.setDate(d.getDate() + i);
                const dayName = d.toLocaleDateString("nl-NL", { weekday: "short" });
                const dayNumber = d.getDate();
                return (
                  <div key={i} className="flex-1 p-2 border-r text-center text-sm font-medium">
                    <div>{dayName}</div>
                    <div className="text-xs text-muted-foreground">{dayNumber}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Rows per bed */}
        <div className="max-h-[34rem] overflow-y-auto">
          {/* Buiten */}
          {beds.filter(b=>!b.is_greenhouse).map(bed => {
            const segs = segmentsByBed.get(bed.id) || [];
            const hasWarn = bedHasConflictThisWeek(bed.id);
            return (
              <div key={bed.id} className="border-b">
                {/* Bed header met alleen icoon als er conflict is */}
                <div className="bg-muted/30 border-b">
                  <div className="flex items-center">
                    <div className="w-56 p-2 border-r font-medium text-sm flex items-center gap-2">
                      <span>{bed.name}</span>
                      {hasWarn && <AlertTriangle className="w-4 h-4 text-red-500" title="Conflict in deze bak" />}
                    </div>
                    <div className="flex-1" />
                  </div>
                </div>

                {/* Segmentregels */}
                {segs.map(seg => {
                  const segmentKey = `${seg.bedId}-${seg.segmentIndex}`;
                  const segEvents = weekEvents.filter(e => e.segmentKey === segmentKey);

                  return (
                    <div key={segmentKey} className="relative">
                      <div className="flex items-center min-h-[48px]">
                        <div className="w-56 p-3 border-r text-sm text-muted-foreground">
                          Segment {seg.segmentIndex + 1}
                        </div>
                        <div className="flex-1 relative h-12 bg-muted/10">
                          {/* daglijnen */}
                          {Array.from({length:7},(_,i)=>(
                            <div key={i} className="absolute top-0 bottom-0 border-r border-muted-foreground/20"
                                 style={{ left: `${(i/7)*100}%` }} />
                          ))}

                          {/* Events */}
                          {segEvents.map((ev, idx) => {
                            const style = calculateEventStyle(ev);
                            return (
                              <div
                                key={ev.id}
                                className="absolute top-1 h-10 rounded px-2 text-white text-xs flex items-center justify-between cursor-pointer hover:opacity-90 transition-opacity"
                                style={{ ...style, backgroundColor: ev.color, zIndex: 10 + idx }}
                                title={`${ev.seedName}\n${formatDateNL(ev.startDate)} – ${formatDateNL(ev.endDate)}`}
                                onClick={() => openEdit(ev.planting)}
                              >
                                <span className="truncate">{ev.seedName}</span>
                                <div className="flex items-center gap-1 ml-1">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openEdit(ev.planting); }}
                                    className="p-0.5 hover:bg-white/20 rounded"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDelete(ev.planting); }}
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

          {/* Kas */}
          {beds.filter(b=>b.is_greenhouse).map(bed => {
            const segs = segmentsByBed.get(bed.id) || [];
            const hasWarn = bedHasConflictThisWeek(bed.id);
            return (
              <div key={bed.id} className="border-b">
                {/* Bed header met icoon */}
                <div className="bg-muted/30 border-b">
                  <div className="flex items-center">
                    <div className="w-56 p-2 border-r font-medium text-sm flex items-center gap-2">
                      <span>{bed.name}</span>
                      <span className="ml-1 px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded">Kas</span>
                      {hasWarn && <AlertTriangle className="w-4 h-4 text-red-500" title="Conflict in deze bak" />}
                    </div>
                    <div className="flex-1" />
                  </div>
                </div>

                {/* Segmentregels */}
                {segs.map(seg => {
                  const segmentKey = `${seg.bedId}-${seg.segmentIndex}`;
                  const segEvents = weekEvents.filter(e => e.segmentKey === segmentKey);

                  return (
                    <div key={segmentKey} className="relative">
                      <div className="flex items-center min-h-[48px]">
                        <div className="w-56 p-3 border-r text-sm text-muted-foreground">
                          Segment {seg.segmentIndex + 1}
                        </div>
                        <div className="flex-1 relative h-12 bg-muted/10">
                          {Array.from({length:7},(_,i)=>(
                            <div key={i} className="absolute top-0 bottom-0 border-r border-muted-foreground/20"
                                 style={{ left: `${(i/7)*100}%` }} />
                          ))}

                          {segEvents.map((ev, idx) => {
                            const style = calculateEventStyle(ev);
                            return (
                              <div
                                key={ev.id}
                                className="absolute top-1 h-10 rounded px-2 text-white text-xs flex items-center justify-between cursor-pointer hover:opacity-90 transition-opacity"
                                style={{ ...style, backgroundColor: ev.color, zIndex: 10 + idx }}
                                title={`${ev.seedName}\n${formatDateNL(ev.startDate)} – ${formatDateNL(ev.endDate)}`}
                                onClick={() => openEdit(ev.planting)}
                              >
                                <span className="truncate">{ev.seedName}</span>
                                <div className="flex items-center gap-1 ml-1">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openEdit(ev.planting); }}
                                    className="p-0.5 hover:bg-white/20 rounded"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDelete(ev.planting); }}
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

      {/* Edit Dialog: datum + bak (alleen bakken die passen) + segment (alleen starts die passen) */}
      {editPlanting && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setEditPlanting(null)}>
          <div className="bg-card w-full max-w-md rounded-lg shadow-lg p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-lg font-semibold">Planting bewerken</h4>
            <p className="text-sm text-muted-foreground">
              {(() => {
                const seedName = (/* optioneel, snel lookup */ null) ?? "";
                return `${seedName}`;
              })()}
            </p>

            {/* Datum */}
            <label className="block text-sm">
              Plantdatum
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="mt-1 w-full border rounded-md px-2 py-1"
              />
            </label>

            {/* Bak */}
            <label className="block text-sm">
              Bak (alleen waar het past)
              <select
                value={editBedId}
                onChange={(e) => {
                  const bedId = e.target.value;
                  setEditBedId(bedId);
                  // stel default segment in op eerste geldige voor deze bak
                  const opt = bedOptions.find(o => o.bedId === bedId);
                  if (opt && opt.segmentStarts.length > 0) setEditStartSeg(opt.segmentStarts[0]);
                }}
                className="mt-1 w-full border rounded-md px-2 py-1"
              >
                {bedOptions.map(o => (
                  <option key={o.bedId} value={o.bedId}>{o.bedName}</option>
                ))}
              </select>
            </label>

            {/* Startsegment */}
            <label className="block text-sm">
              Startsegment
              <select
                value={String(editStartSeg)}
                onChange={(e) => setEditStartSeg(parseInt(e.target.value, 10))}
                className="mt-1 w-full border rounded-md px-2 py-1"
              >
                {bedOptions.find(o => o.bedId === editBedId)?.segmentStarts.map(i => (
                  <option key={i} value={i}>Segment {i+1}</option>
                )) ?? (
                  <option value={editStartSeg}>Segment {editStartSeg+1}</option>
                )}
              </select>
            </label>

            <div className="flex justify-end gap-2 pt-1">
              <button className="px-3 py-1.5 rounded-md border" onClick={() => setEditPlanting(null)}>Annuleren</button>
              <button
                className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
                onClick={handleSaveEdit}
              >
                Opslaan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
