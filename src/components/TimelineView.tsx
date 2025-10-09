// src/components/TimelineView.tsx
import { useMemo } from "react";
import type { GardenBed, Planting, Seed } from "../lib/types";
import { AlertTriangle, Edit3 } from "lucide-react";

interface Props {
  beds: GardenBed[];
  plantings: Planting[];
  seeds: Seed[];
  conflictsMap: Map<string, Planting[]>;
  currentWeek: Date;
  onReload: () => Promise<void>;
  onEdit: (p: Planting) => void;
}

type TimelineEvent = {
  id: string;
  planting: Planting;
  segmentKey: string;
  seedName: string;
  color: string;
  startDate: Date;
  endDate: Date;
  hasConflict: boolean;
};

const fmt = (d: Date) => d.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit" });

export default function TimelineView({ beds, plantings, seeds, conflictsMap, currentWeek, onEdit }: Props) {
  const seedsById = useMemo(() => Object.fromEntries(seeds.map(s => [s.id, s])), [seeds]);

  const segments = useMemo(() => {
    // Volgorde: buiten → kas
    const outdoors = beds.filter(b => !b.is_greenhouse);
    const greenhouse = beds.filter(b => b.is_greenhouse);
    const ordered = [...outdoors, ...greenhouse];
    const out: { bed: GardenBed; segIndex: number }[] = [];
    for (const bed of ordered) {
      const n = Math.max(1, bed.segments || 1);
      for (let i=0;i<n;i++) out.push({ bed, segIndex: i });
    }
    return out;
  }, [beds]);

  const weekBounds = useMemo(() => {
    const start = new Date(currentWeek);
    // maandag = begin
    const day = start.getDay(); // 0=zo
    const diffToMon = (day + 6) % 7;
    start.setDate(start.getDate() - diffToMon);
    const end = new Date(start); end.setDate(start.getDate()+6);
    return { start, end };
  }, [currentWeek]);

  const events = useMemo((): TimelineEvent[] => {
    const list: TimelineEvent[] = [];
    for (const p of plantings) {
      if (!p?.planned_date || !p?.planned_harvest_end) continue;
      const sD = new Date(p.planned_date);
      const eD = new Date(p.planned_harvest_end);
      const seed = seedsById[p.seed_id];
      const used = Math.max(1, p.segments_used ?? 1);
      const startSeg = Math.max(0, p.start_segment ?? 0);
      for (let i=0; i<used; i++) {
        const seg = startSeg + i;
        list.push({
          id: `${p.id}-${seg}`,
          planting: p,
          segmentKey: `${p.garden_bed_id}-${seg}`,
          seedName: seed?.name ?? "Onbekend",
          color: p.color ?? "#22c55e",
          startDate: sD,
          endDate: eD,
          hasConflict: conflictsMap.has(p.id),
        });
      }
    }
    return list;
  }, [plantings, conflictsMap, seedsById]);

  const dayPct = (d: Date) => {
    const total = 6;
    const p = (d.getTime() - weekBounds.start.getTime()) / (weekBounds.end.getTime() - weekBounds.start.getTime());
    const pct = Math.max(0, Math.min(1, p)) * 100;
    return pct;
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* header */}
      <div className="flex">
        <div className="w-48 p-2 border-r bg-muted/40 text-sm font-medium">Bak / Segment</div>
        <div className="flex-1 grid grid-cols-7 text-center text-sm font-medium bg-muted/40">
          {Array.from({length:7},(_,i)=>{
            const d = new Date(weekBounds.start);
            d.setDate(d.getDate()+i);
            return <div key={i} className="p-2 border-r">{fmt(d)}</div>
          })}
        </div>
      </div>

      {/* rows */}
      <div className="max-h-[520px] overflow-y-auto">
        {segments.map(({ bed, segIndex }) => {
          const bedHasC = plantings.some(p => p.garden_bed_id === bed.id && conflictsMap.has(p.id));
          const segEvents = events.filter(e => e.segmentKey === `${bed.id}-${segIndex}`)
            .filter(e => e.endDate >= weekBounds.start && e.startDate <= weekBounds.end);

          return (
            <div key={`${bed.id}-${segIndex}`} className="relative border-t">
              <div className="flex items-center">
                <div className="w-48 p-2 border-r text-xs">
                  <div className="font-medium flex items-center gap-1">
                    {segIndex===0 && bedHasC && <AlertTriangle className="w-3 h-3 text-red-500" title="Conflicten in deze bak" />}
                    {bed.name}{segIndex===0 ? "" : ""}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Segment {segIndex+1}</div>
                </div>
                <div className="flex-1 relative h-12">
                  {/* daglijnen */}
                  {Array.from({length:7},(_,i)=>(
                    <div key={i} className="absolute top-0 bottom-0 border-r" style={{left:`${(i/7)*100}%`}} />
                  ))}
                  {/* events */}
                  {segEvents.map((ev, idx) => {
                    const left = dayPct(ev.startDate);
                    const right = dayPct(ev.endDate);
                    const width = Math.max(2, right-left);
                    return (
                      <div key={ev.id}
                        className="absolute top-1 bottom-1 rounded px-2 text-white text-[11px] flex items-center justify-between shadow"
                        style={{left:`${left}%`, width:`${width}%`, backgroundColor: ev.color, zIndex:10+idx}}
                        title={`${ev.seedName} • ${ev.startDate.toISOString().slice(0,10)} → ${ev.endDate.toISOString().slice(0,10)}`}
                      >
                        <div className="truncate">{ev.seedName}</div>
                        <div className="flex items-center gap-1 ml-2">
                          {ev.hasConflict && <AlertTriangle className="w-3 h-3 text-yellow-300" />}
                          <button className="p-0.5 bg-white/20 rounded" onClick={()=>onEdit(ev.planting)} title="Bewerken">
                            <Edit3 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  );
}
