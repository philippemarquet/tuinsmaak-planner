// src/components/CapacityTimelineView.tsx
// Compacte maand-timeline: alle bakken onder elkaar, segmenten in/uitklapbaar,
// laat bezetting en vrije ruimte zien en ondersteunt DnD (seed-* en planting-*).

import { useEffect, useMemo, useState } from "react";
import type { GardenBed, Planting, Seed } from "../lib/types";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ChevronDown } from "lucide-react";

/* ====== lokale helpers (zelfvoorzienend) ====== */
const toISO = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const parseISO = (x?: string | null) => (x ? new Date(x) : null);

/* ====== eenvoudige droppable cell ====== */
function CellDrop({ id }: { id: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`h-8 w-full ${isOver ? "bg-primary/20" : "bg-transparent"}`} />
  );
}

/* ====== Draggable planting blok ====== */
function DraggablePlanting({ planting, label, color, onEdit }: { planting: Planting; label: string; color: string; onEdit: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `planting-${planting.id}` });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`rounded-md text-[10px] px-1.5 py-1 border shadow-sm cursor-grab active:cursor-grabbing truncate ${isDragging ? "opacity-60" : ""}`}
      style={{ background: color, borderColor: color + "66", color: "#fff" }}
      title={label}
      onDoubleClick={(e) => { e.preventDefault(); onEdit(); }}
    >
      {label}
    </div>
  );
}

export default function CapacityTimelineView({
  beds,
  plantings,
  seeds,
  onEdit,
}: {
  beds: GardenBed[];
  plantings: Planting[];
  seeds: Seed[];
  onEdit: (p: Planting, bed: GardenBed) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [startISO, setStartISO] = useState<string>(() => localStorage.getItem("capTL:start") || toISO(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [days, setDays] = useState<number>(() => parseInt(localStorage.getItem("capTL:days") || "35", 10));

  useEffect(() => { localStorage.setItem("capTL:start", startISO); }, [startISO]);
  useEffect(() => { localStorage.setItem("capTL:days", String(days)); }, [days]);

  const startDate = useMemo(() => new Date(startISO), [startISO]);
  const endDate = useMemo(() => addDays(startDate, days - 1), [startDate, days]);
  const dayList = useMemo(() => Array.from({ length: days }, (_, i) => addDays(startDate, i)), [startDate, days]);
  const seedsById = useMemo(() => Object.fromEntries(seeds.map((s) => [s.id, s])), [seeds]);

  const gotoPrevMonth = () => setStartISO(toISO(addDays(new Date(startDate.getFullYear(), startDate.getMonth(), 1), -1)));
  const gotoNextMonth = () => setStartISO(toISO(addDays(new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0), 1)));
  const gotoThisMonth = () => setStartISO(toISO(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));

  function usedSegmentsForDay(bed: GardenBed, day: Date): number {
    let used = 0;
    for (const p of plantings) {
      if (p.garden_bed_id !== bed.id) continue;
      const s = parseISO(p.planned_date); const e = parseISO(p.planned_harvest_end);
      if (!s || !e) continue;
      if (!(s <= day && day <= e)) continue;
      used += Math.max(1, p.segments_used ?? 1);
    }
    return Math.min(used, Math.max(1, bed.segments || 1));
  }

  return (
    <section className="space-y-3">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold">Timeline (maand)</h3>
        <div className="flex items-center gap-2">
          <button className="px-2 py-1 rounded-md border bg-secondary hover:bg-secondary/80" onClick={gotoPrevMonth} title="Vorige maand">◀</button>
          <div className="min-w-[160px] text-center font-medium">
            {startDate.toLocaleDateString("nl-NL", { month: "long", year: "numeric" })}
          </div>
          <button className="px-2 py-1 rounded-md border bg-secondary hover:bg-secondary/80" onClick={gotoNextMonth} title="Volgende maand">▶</button>
          <button className="ml-2 px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 text-sm" onClick={gotoThisMonth}>Vandaag</button>
          <div className="ml-3 flex items-center gap-1 text-xs">
            <span>Dagen:</span>
            <input type="number" min={28} max={56} value={days} onChange={(e) => setDays(Math.max(28, Math.min(56, parseInt(e.target.value || "35", 10))))} className="w-14 bg-muted/40 border-0 rounded px-2 py-1" />
          </div>
        </div>
      </div>

      {/* Day header */}
      <div className="grid" style={{ gridTemplateColumns: `220px repeat(${days}, minmax(18px, 1fr))` }}>
        <div className="text-xs text-muted-foreground px-2 py-1">Bak / Segment</div>
        {dayList.map((d, i) => (
          <div key={i} className="text-[10px] text-muted-foreground px-1 py-1 text-center">
            {new Intl.DateTimeFormat("nl-NL", { day: "2-digit" }).format(d)}
          </div>
        ))}
      </div>

      {/* Beds */}
      <div className="space-y-2">
        {beds.map((bed) => {
          const segs = Math.max(1, bed.segments || 1);
          const isOpen = !!expanded[bed.id];

          return (
            <div key={bed.id} className="rounded-lg border bg-card overflow-hidden">
              {/* Bed header row (condensed heat-map) */}
              <div className="grid items-center" style={{ gridTemplateColumns: `220px repeat(${days}, minmax(18px, 1fr))` }}>
                <div className="flex items-center gap-2 px-2 py-1.5 border-r">
                  <button className="p-1 rounded hover:bg-muted" onClick={() => setExpanded((p) => ({ ...p, [bed.id]: !p[bed.id] }))} title={isOpen ? "Samenvouwen" : "Uitklappen"}>
                    <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  <div className="text-sm font-medium truncate" title={bed.name}>{bed.name}</div>
                  <span className="ml-auto text-[10px] text-muted-foreground">{segs} seg</span>
                </div>
                {dayList.map((d, i) => {
                  const used = usedSegmentsForDay(bed, d);
                  const total = segs; const ratio = total === 0 ? 0 : used / total;
                  return (
                    <div key={i} className="relative h-6">
                      <div className="absolute inset-0 rounded-sm" style={{ background: `linear-gradient(180deg, rgba(34,197,94,${0.08 + 0.25*ratio}) 0%, rgba(34,197,94,${0.08 + 0.25*ratio}) 100%)` }} />
                      <CellDrop id={`timeline__${bed.id}__segment__auto__date__${toISO(d)}`} />
                    </div>
                  );
                })}
              </div>

              {/* Expanded: per segment detail + DnD targets */}
              {isOpen && (
                <div className="border-t">
                  {Array.from({ length: segs }, (_, sIdx) => (
                    <div key={sIdx} className="grid relative" style={{ gridTemplateColumns: `220px repeat(${days}, minmax(18px, 1fr))` }}>
                      <div className="px-2 py-1.5 border-r text-[11px] text-muted-foreground">Segment {sIdx + 1}</div>

                      {/* droppable cells */}
                      {dayList.map((d) => (
                        <div key={toISO(d)} className="relative h-8">
                          <CellDrop id={`timeline__${bed.id}__segment__${sIdx}__date__${toISO(d)}`} />
                        </div>
                      ))}

                      {/* planting blocks (grid-positioned overlay) */}
                      <div className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: `220px repeat(${days}, minmax(18px, 1fr))` }}>
                        <div />
                        {plantings
                          .filter((p) => p.garden_bed_id === bed.id && (p.start_segment ?? 0) <= sIdx && sIdx < (p.start_segment ?? 0) + Math.max(1, p.segments_used ?? 1))
                          .map((p) => {
                            const s = parseISO(p.planned_date); const e = parseISO(p.planned_harvest_end);
                            if (!s || !e) return null;
                            const from = s < startDate ? startDate : s;
                            const to = e > endDate ? endDate : e;
                            if (from > to) return null;
                            const startCol = Math.max(0, Math.floor((from.getTime() - startDate.getTime()) / 86400000));
                            const span = Math.floor((to.getTime() - from.getTime()) / 86400000) + 1;
                            const seed = seedsById[p.seed_id];
                            const label = seed?.name || "—";
                            const color = (p.color && (p.color.startsWith("#") || p.color.startsWith("rgb"))) ? p.color : (seed?.default_color?.startsWith("#") ? seed.default_color! : "#22c55e");

                            return (
                              <div key={`${p.id}-seg-${sIdx}`} className="relative pointer-events-auto" style={{ gridColumn: `${2 + startCol} / span ${span}`, padding: 2 }}>
                                <DraggablePlanting planting={p} label={label} color={color!} onEdit={() => onEdit(p, bed)} />
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
