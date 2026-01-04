// src/components/CapacityTimelineView.tsx
import React, { useMemo, useState } from "react";
import type { GardenBed, Planting, Seed } from "../lib/types";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { ChevronDown, ChevronRight } from "lucide-react";

/* Locale-vaste ISO helpers */
const toISO = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const parseISO = (x?: string | null) => {
  if (!x) return null;
  const [y, m, d] = x.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const daysInMonth = (y: number, m0to11: number) => new Date(y, m0to11 + 1, 0).getDate();

/* Bezettingskleur: 0 -> wit, 1 -> heel donker groen (#064e3b) */
function occupancyColor(t: number) {
  const tt = clamp(t, 0, 1);
  const dark = { r: 6, g: 78, b: 59 }; // #064e3b
  const r = Math.round(255 - (255 - dark.r) * tt);
  const g = Math.round(255 - (255 - dark.g) * tt);
  const b = Math.round(255 - (255 - dark.b) * tt);
  return `rgb(${r}, ${g}, ${b})`;
}

/* Droppable cel */
function DroppableCell({ id }: { id: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`relative h-full w-full ${isOver ? "outline outline-2 outline-primary/60 bg-primary/5" : ""}`}
    />
  );
}

/* Draggable planting in timeline */
function DraggablePlanting({
  planting,
  label,
  gridColumnStart,
  gridColumnEnd,
  gridRowStart,
  gridRowEnd,
  color,
  onClick,
}: {
  planting: Planting;
  label: string;
  gridColumnStart: number;
  gridColumnEnd: number;
  gridRowStart: number;
  gridRowEnd: number;
  color: string;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `planting-${planting.id}` });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`absolute text-[10px] rounded px-1 py-0.5 cursor-grab active:cursor-grabbing select-none transition-transform ${
        isDragging ? "opacity-60 scale-[0.98]" : ""
      }`}
      style={{
        gridColumnStart,
        gridColumnEnd,
        gridRowStart,
        gridRowEnd,
        background: color,
        color: "#fff",
      } as React.CSSProperties}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={label}
    >
      <div className="truncate">{label}</div>
    </div>
  );
}

export default function CapacityTimelineView({
  beds,
  plantings,
  seeds,
  currentWeek,
  onReload,
  onPlantClick,
}: {
  beds: GardenBed[];
  plantings: Planting[];
  seeds: Seed[];
  currentWeek: Date;
  onReload: () => Promise<void>;
  onPlantClick: (p: Planting) => void;
}) {
  // Toon altijd een hele maand; start = eerste dag van maand van currentWeek
  const initialMonthStart = useMemo(() => new Date(currentWeek.getFullYear(), currentWeek.getMonth(), 1), [currentWeek]);
  const [monthStart, setMonthStart] = useState<Date>(initialMonthStart);

  // Reken de dagkolommen uit
  const year = monthStart.getFullYear();
  const month0 = monthStart.getMonth();
  const totalDays = daysInMonth(year, month0);
  const dayDates = useMemo(() => Array.from({ length: totalDays }, (_, i) => addDays(monthStart, i)), [monthStart, totalDays]);

  // Snelle index
  const seedsById = useMemo(() => Object.fromEntries(seeds.map((s) => [s.id, s])), [seeds]);

  // Dag-breedte & rijhoogte
  const DAY_W = 28;
  const ROW_H = 22;

  // Bezetting per bed per dag (percentage 0..1)
  const occupancyByBedDay = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const bed of beds) {
      const arr = new Array<number>(totalDays).fill(0);
      const segTotal = Math.max(1, bed.segments || 1);

      for (const p of plantings) {
        if (p.garden_bed_id !== bed.id) continue;
        const s = parseISO(p.planned_date);
        const e = parseISO(p.planned_harvest_end);
        if (!s || !e) continue;

        for (let di = 0; di < totalDays; di++) {
          const d = dayDates[di];
          if (s <= d && d <= e) {
            arr[di] += Math.max(1, p.segments_used ?? 1);
          }
        }
      }

      for (let i = 0; i < totalDays; i++) {
        arr[i] = Math.min(1, arr[i] / segTotal);
      }
      map.set(bed.id, arr);
    }
    return map;
  }, [beds, plantings, dayDates, totalDays]);

  // Expand/collapse state
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const allExpanded = expanded.size === beds.length;
  const expandAll = () => setExpanded(new Set(beds.map((b) => b.id)));
  const collapseAll = () => setExpanded(new Set());
  const toggleBed = (id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  // UI: Maandnavigatie
  const prevMonth = () => setMonthStart(new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1));
  const nextMonth = () => setMonthStart(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1));

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button className="px-2 py-1 rounded border bg-secondary hover:bg-secondary/80" onClick={prevMonth}>←</button>
          <div className="text-sm font-semibold">
            {monthStart.toLocaleString("nl-NL", { month: "long", year: "numeric" })}
          </div>
          <button className="px-2 py-1 rounded border bg-secondary hover:bg-secondary/80" onClick={nextMonth}>→</button>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-2 py-1 rounded border bg-muted hover:bg-muted/70 text-xs"
            onClick={allExpanded ? collapseAll : expandAll}
          >
            {allExpanded ? "Alles inklappen" : "Alles uitklappen"}
          </button>
          <div className="text-xs text-muted-foreground">
            Sleep seeds naar dag×segment of versleep blokken. Klik op een blok om te bewerken.
          </div>
        </div>
      </div>

      {/* Dag-header */}
      <div className="sticky top-0 z-10 bg-background">
        <div className="grid" style={{ gridTemplateColumns: `240px repeat(${totalDays}, ${DAY_W}px)` }}>
          <div className="h-8"></div>
          {dayDates.map((d, idx) => (
            <div key={idx} className="h-8 text-[10px] flex items-end justify-center text-muted-foreground">
              <div className="pb-1">{d.getDate()}</div>
            </div>
          ))}
        </div>
        <div className="grid" style={{ gridTemplateColumns: `240px repeat(${totalDays}, ${DAY_W}px)` }}>
          <div className="h-1"></div>
          {dayDates.map((_, idx) => (
            <div key={idx} className="h-1 border-t border-dashed border-muted-foreground/30" />
          ))}
        </div>
      </div>

      {/* Content per bed */}
      <div className="space-y-3">
        {beds.map((bed) => {
          const segCount = Math.max(1, bed.segments || 1);
          const occ = occupancyByBedDay.get(bed.id)!; // array length totalDays
          const isOpen = expanded.has(bed.id);

          // kolommen/rijen voor grid
          const gridCols = `repeat(${totalDays}, ${DAY_W}px)`;
          const gridRows = `repeat(${segCount}, ${ROW_H}px)`;

          return (
            <div key={bed.id} className="rounded-lg border bg-card/50 overflow-hidden">
              {/* Collapsed row: 1 regel met occupancy cells */}
              <button
                className="w-full px-3 py-2 text-sm font-medium flex items-center justify-between border-b bg-muted/40"
                onClick={() => toggleBed(bed.id)}
                title={isOpen ? "Inklappen" : "Uitklappen"}
              >
                <span className="flex items-center gap-2">
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <span className="truncate">{bed.name}</span>
                  {bed.is_greenhouse && <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-600 text-white">Kas</span>}
                </span>
                {/* mini percentage indicatie (gemiddelde) */}
                <span className="text-xs text-muted-foreground">
                  {Math.round((occ.reduce((a, b) => a + b, 0) / occ.length) * 100)}% gemiddeld bezet
                </span>
              </button>

              <div className="grid" style={{ gridTemplateColumns: `240px repeat(${totalDays}, ${DAY_W}px)` }}>
                {/* linker lege cel + dagkleuren */}
                <div className="bg-background/60 border-r px-3 py-2 text-[11px] text-muted-foreground">
                  {isOpen ? "Segmenten" : "Bezetting per dag"}
                </div>
                {occ.map((t, i) => (
                  <div
                    key={i}
                    className="h-[22px] border-r border-muted-foreground/10"
                    style={{ background: occupancyColor(t) }}
                    title={`${toISO(dayDates[i])}: ${Math.round(t * 100)}%`}
                  />
                ))}
              </div>

              {/* Expanded grid met segment-rijen en blokken */}
              {isOpen && (
                <div className="relative">
                  <div
                    className="relative"
                    style={{
                      display: "grid",
                      gridTemplateColumns: `240px 1fr`,
                    }}
                  >
                    {/* linker labelkolom met segmentnummers */}
                    <div className="border-r bg-background/60">
                      <div className="grid" style={{ gridTemplateRows: gridRows }}>
                        {Array.from({ length: segCount }, (_, r) => (
                          <div
                            key={r}
                            className="h-[22px] text-[10px] text-muted-foreground flex items-center justify-end pr-2 border-b border-dashed border-muted-foreground/20"
                            title={`Segment ${r + 1}`}
                          >
                            Seg {r + 1}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* rechter dag×segment grid */}
                    <div className="relative">
                      {/* droppable cellen */}
                      <div className="grid" style={{ gridTemplateColumns: gridCols, gridTemplateRows: gridRows }}>
                        {Array.from({ length: segCount }, (_, r) =>
                          dayDates.map((d, c) => {
                            const id = `timeline__${bed.id}__segment__${r}__date__${toISO(d)}`;
                            return (
                              <div key={`${r}-${c}`} className="border-b border-r border-transparent hover:border-muted-foreground/20">
                                <DroppableCell id={id} />
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* planting-blokken */}
                      <div className="absolute inset-0" style={{ display: "grid", gridTemplateColumns: gridCols, gridTemplateRows: gridRows }}>
                        {(plantings || [])
                          .filter((p) => p.garden_bed_id === bed.id)
                          .map((p) => {
                            const seed = seedsById[p.seed_id];
                            const s = parseISO(p.planned_date);
                            const e = parseISO(p.planned_harvest_end);
                            if (!s || !e) return null;

                            // Clip op maand
                            const startIdx = Math.max(0, Math.floor((s.getTime() - monthStart.getTime()) / 86400000));
                            const endIdx = Math.min(totalDays - 1, Math.floor((e.getTime() - monthStart.getTime()) / 86400000));
                            if (endIdx < 0 || startIdx > totalDays - 1) return null;

                            const gridColumnStart = Math.max(1, startIdx + 1);
                            const gridColumnEnd = Math.min(totalDays, endIdx + 1) + 1;

                            const used = Math.max(1, p.segments_used ?? 1);
                            const rStart = (p.start_segment ?? 0) + 1;
                            const rEnd = Math.min(segCount, rStart + used) + 1;

                            const label = seed?.name ?? "—";
                            const color = (p.color && p.color.startsWith("#")) ? p.color : (seed?.default_color?.startsWith("#") ? seed.default_color! : "#16a34a");

                            return (
                              <DraggablePlanting
                                key={p.id}
                                planting={p}
                                label={label}
                                gridColumnStart={gridColumnStart}
                                gridColumnEnd={gridColumnEnd}
                                gridRowStart={rStart}
                                gridRowEnd={rEnd}
                                color={color}
                                onClick={() => onPlantClick(p)}
                              />
                            );
                          })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
