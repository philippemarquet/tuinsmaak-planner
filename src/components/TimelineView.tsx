// src/components/TimelineView.tsx
import { useMemo, useState } from "react";
import type { GardenBed, Planting, Seed } from "../lib/types";
import { Trash2, Edit3, AlertTriangle } from "lucide-react";
import PlantingEditor from "./PlantingEditor";
import { buildConflictsMap } from "../lib/conflicts";

interface TimelineViewProps {
  beds: GardenBed[];
  plantings: Planting[];
  seeds: Seed[];
  currentWeek: Date;
  onReload: () => Promise<void>;
}

type SegmentKey = string;

function parseISO(iso?: string | null): Date | null { return iso ? new Date(iso) : null; }

export default function TimelineView({ beds, plantings, seeds, currentWeek, onReload }: TimelineViewProps) {
  const [edit, setEdit] = useState<Planting | null>(null);

  const conflictsMap = useMemo(() => buildConflictsMap(plantings), [plantings]);

  // Build flat events map by bed-segment
  const weekBounds = useMemo(() => {
    const s = new Date(currentWeek); s.setHours(0,0,0,0);
    const e = new Date(s); e.setDate(e.getDate() + 6);
    return { start: s, end: e };
  }, [currentWeek]);

  const events = useMemo(() => {
    const out: {
      id: string; bedId: string; seg: number; start: Date; end: Date; seedName: string; color: string; hasConflict: boolean; planting: Planting;
    }[] = [];
    const seedById = Object.fromEntries(seeds.map(s => [s.id, s]));
    for (const p of plantings) {
      const s = parseISO(p.planned_date); const e = parseISO(p.planned_harvest_end);
      if (!s || !e) continue;
      const count = Math.max(1, p.segments_used ?? 1);
      const startSeg = Math.max(0, p.start_segment ?? 0);
      for (let i=0;i<count;i++) {
        const seg = startSeg + i;
        out.push({
          id: `${p.id}-${seg}`,
          bedId: p.garden_bed_id,
          seg,
          start: s, end: e,
          seedName: seedById[p.seed_id]?.name ?? "Onbekend",
          color: p.color?.startsWith("#") ? p.color! : "#22c55e",
          hasConflict: Boolean(conflictsMap.get(p.id)?.length),
          planting: p,
        });
      }
    }
    return out;
  }, [plantings, seeds, conflictsMap]);

  function calcStyle(start: Date, end: Date) {
    const total = 7 * 24 * 60 * 60 * 1000;
    const clampedStart = Math.max(+start, +weekBounds.start);
    const clampedEnd = Math.min(+end, +weekBounds.end);
    const left = ((clampedStart - +weekBounds.start) / total) * 100;
    const width = Math.max(2, ((clampedEnd - clampedStart) / total) * 100);
    return { left: `${left}%`, width: `${width}%` };
  }

  const segmentsByBed = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of beds) m.set(b.id, Math.max(1, b.segments ?? 1));
    return m;
  }, [beds]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="font-medium">Weekoverzicht</h4>
        <div className="text-sm text-muted-foreground">
          {weekBounds.start.toLocaleDateString("nl-NL")} – {weekBounds.end.toLocaleDateString("nl-NL")}
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="bg-muted border-b">
          <div className="flex">
            <div className="w-48 p-2 border-r text-sm font-medium">Bak / Segment</div>
            {Array.from({length:7}).map((_,i)=>(
              <div key={i} className="flex-1 p-2 text-center text-sm font-medium border-r">{["Ma","Di","Wo","Do","Vr","Za","Zo"][i]}</div>
            ))}
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {beds.map(bed => (
            <div key={bed.id} className="border-b">
              <div className="bg-muted/40">
                <div className="flex items-center">
                  <div className="w-48 p-2 border-r font-medium text-sm flex items-center gap-2">
                    {bed.name}
                    {/* only an icon when that bed has any conflict */}
                    {plantings.some(p => p.garden_bed_id===bed.id && conflictsMap.get(p.id)?.length) && (
                      <AlertTriangle className="w-4 h-4 text-amber-500" title="Conflict in deze bak" />
                    )}
                  </div>
                  <div className="flex-1" />
                </div>
              </div>

              {Array.from({length: segmentsByBed.get(bed.id) ?? 1}).map((_, seg) => {
                const segEvents = events.filter(e => e.bedId===bed.id && e.seg===seg && e.end >= weekBounds.start && e.start <= weekBounds.end);
                return (
                  <div key={seg} className="relative">
                    <div className="flex items-center min-h-[46px]">
                      <div className="w-48 p-2 border-r text-xs text-muted-foreground">Segment {seg+1}</div>
                      <div className="flex-1 relative h-10 bg-card">
                        {/* day guides */}
                        {Array.from({length:7}).map((_,i)=>(
                          <div key={i} className="absolute inset-y-0 border-r" style={{left: `${(i/7)*100}%`}} />
                        ))}
                        {/* events */}
                        {segEvents.map((ev, idx) => {
                          const style = calcStyle(ev.start, ev.end);
                          return (
                            <div
                              key={ev.id}
                              className="absolute top-1 h-8 rounded px-2 text-white text-xs flex items-center justify-between cursor-pointer shadow"
                              style={{...style, backgroundColor: ev.color, zIndex: 10+idx}}
                              title={`${ev.seedName}`}
                              onClick={() => setEdit(ev.planting)}
                            >
                              <span className="truncate">{ev.seedName}</span>
                              {ev.hasConflict && <AlertTriangle className="w-3 h-3 text-yellow-200 ml-1" />}
                              <div className="flex items-center gap-1 ml-2 opacity-80">
                                <button onClick={(e)=>{e.stopPropagation(); setEdit(ev.planting);}} className="p-0.5 hover:opacity-80"><Edit3 className="w-3 h-3" /></button>
                                <button onClick={(e)=>{e.stopPropagation(); /* deletion can be elsewhere */}} className="p-0.5 hover:opacity-80"><Trash2 className="w-3 h-3" /></button>
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
          ))}
        </div>
      </div>

      {edit && (
        <PlantingEditor
          beds={beds}
          seeds={seeds}
          plantings={plantings}
          planting={edit}
          onClose={()=>setEdit(null)}
          onSaved={onReload}
        />
      )}
    </div>
  );
}
