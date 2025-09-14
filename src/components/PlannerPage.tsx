// src/components/PlannerPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { Garden, GardenBed, Planting, Seed } from "../lib/types";
import { listBeds } from "../lib/api/beds";
import { listSeeds } from "../lib/api/seeds";
import { createPlanting, listPlantings, deletePlanting, updatePlanting } from "../lib/api/plantings";
import { DndContext, useDraggable, useDroppable, DragOverlay } from "@dnd-kit/core";
import { ColorField } from "./ColorField";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

/* ========== helpers ========== */
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addWeeks(d: Date, w: number) { return addDays(d, w * 7); }
function toISO(d: Date) { return d.toISOString().slice(0, 10); }
function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
function isoWeekNumber(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d as any) - (yearStart as any)) / 86400000 + 1) / 7);
}

/* ========== tiny UI bits ========== */
function Toast({ message, type, onClose }: { message: string; type: "success" | "error" | "info"; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  const base = "fixed top-4 right-4 z-50 px-4 py-2 rounded shadow-lg text-sm";
  const color = type === "success" ? "bg-green-600 text-white" : type === "error" ? "bg-red-600 text-white" : "bg-gray-800 text-white";
  return (
    <div className={`${base} ${color}`}>
      <div className="flex items-center gap-2">
        <span>{message}</span>
        <button onClick={onClose} className="ml-2 text-white/90 hover:text-white">✕</button>
      </div>
    </div>
  );
}

function DraggableSeed({ seed, isDragging = false }: { seed: Seed; isDragging?: boolean }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: `seed-${seed.id}` });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const dot =
    seed.default_color?.startsWith("#")
      ? <span className="inline-block w-3 h-3 rounded" style={{ background: seed.default_color }} />
      : <span className={`inline-block w-3 h-3 rounded ${seed.default_color ?? "bg-green-500"}`} />;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`px-2 py-1 border rounded-md bg-secondary cursor-move text-sm flex items-center gap-2 ${isDragging ? "opacity-50" : ""}`}
    >
      {dot}
      <span className="truncate">{seed.name}</span>
    </div>
  );
}

/* compacte droppable “segment-rij” voor LIST-view */
function DroppableSegment({
  bed, segmentIndex, occupied, children,
}: { bed: GardenBed; segmentIndex: number; occupied: boolean; children: React.ReactNode; }) {
  const { setNodeRef, isOver } = useDroppable({ id: `bed__${bed.id}__segment__${segmentIndex}` });
  const base = "flex items-center justify-center border border-dashed rounded-sm min-h-[28px] transition";
  const color = isOver ? "bg-green-200" : occupied ? "bg-emerald-50" : "bg-muted";
  return <div ref={setNodeRef} className={`${base} ${color}`}>{children}</div>;
}

/* ========== filters ========== */
type InPlannerFilter = 'all' | 'planned' | 'unplanned';
const MONTHS_SHORT = ["J","F","M","A","M","J","J","A","S","O","N","D"];

function MonthChips({ selected, onToggle }: { selected: number[]; onToggle: (m: number) => void; }) {
  return (
    <div className="flex flex-wrap gap-1">
      {MONTHS_SHORT.map((lbl, i) => {
        const m = i + 1;
        const on = selected.includes(m);
        return (
          <button key={m}
            type="button"
            onClick={() => onToggle(m)}
            className={`px-1.5 py-0.5 rounded text-[11px] border ${on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {lbl}
          </button>
        );
      })}
    </div>
  );
}

/* ========== Plattegrond subview (compact, strakke uitlijning) ========== */
function PlannerMap({
  beds, seedsById, plantings, currentWeek, showGhosts,
}: {
  beds: GardenBed[];
  seedsById: Record<string, Seed>;
  plantings: Planting[];
  currentWeek: Date;
  showGhosts: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const CANVAS_W = 2400;
  const CANVAS_H = 1400;
  const [zoom, setZoom] = useState(0.8);
  const minZoom = 0.25, maxZoom = 3;
  const setZoomClamped = (v: number) => setZoom(Math.max(minZoom, Math.min(maxZoom, v)));
  const fitToViewport = () => {
    const vp = viewportRef.current; if (!vp) return;
    const vw = vp.clientWidth - 24; const vh = vp.clientHeight - 24;
    const zx = vw / CANVAS_W; const zy = vh / CANVAS_H;
    setZoomClamped(Math.min(zx, zy));
  };
  useEffect(() => { fitToViewport(); }, []);

  const isActiveInWeek = (p: Planting) => {
    const start = new Date(p.planned_date ?? "");
    const end = new Date(p.planned_harvest_end ?? "");
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
    const monday = new Date(currentWeek);
    const sunday = addDays(monday, 6);
    return start <= sunday && end >= monday;
  };
  const isFutureRelativeToWeek = (p: Planting) => {
    const start = new Date(p.planned_date ?? "");
    if (isNaN(start.getTime())) return false;
    const monday = new Date(currentWeek);
    const sunday = addDays(monday, 6);
    return start > sunday;
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold">Plattegrond</h3>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-1 border rounded-md px-2 py-1 bg-secondary hover:bg-secondary/80" onClick={() => setZoomClamped(zoom - 0.1)} title="Uitzoomen">
            <ZoomOut className="h-4 w-4" />-
          </button>
          <input type="range" min={minZoom} max={maxZoom} step={0.05} value={zoom} onChange={(e) => setZoomClamped(parseFloat(e.target.value))} className="w-40" />
          <button className="inline-flex items-center gap-1 border rounded-md px-2 py-1 bg-secondary hover:bg-secondary/80" onClick={() => setZoomClamped(zoom + 0.1)} title="Inzoomen">
            <ZoomIn className="h-4 w-4" />+
          </button>
          <button className="inline-flex items-center gap-1 border rounded-md px-2 py-1" onClick={() => setZoomClamped(1)} title="100%">
            100%
          </button>
          <button className="inline-flex items-center gap-1 border rounded-md px-2 py-1" onClick={fitToViewport} title="Passend maken">
            <Maximize2 className="h-4 w-4" /> Fit
          </button>
          <span className="text-xs text-muted-foreground ml-1">{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      <div ref={viewportRef} className="relative w-full h-[70vh] rounded-xl border border-border overflow-auto bg-background">
        <div className="relative" style={{ width: 2400 * zoom, height: 1400 * zoom }}>
          <div
            className="absolute left-0 top-0"
            style={{
              width: 2400, height: 1400,
              transform: `scale(${zoom})`, transformOrigin: "0 0",
              backgroundImage:
                "linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(180deg, rgba(0,0,0,0.04) 1px, transparent 1px)",
              backgroundSize: "24px 24px", borderRadius: 12,
            }}
          >
            {beds.map((bed) => {
              const w = Math.max(60, Math.round((bed.length_cm || 200)));
              const h = Math.max(36, Math.round((bed.width_cm || 100)));
              const x = bed.location_x ?? 20;
              const y = bed.location_y ?? 20;
              const segH = h / Math.max(1, bed.segments);

              const active = plantings.filter(p => p.garden_bed_id === bed.id && isActiveInWeek(p));
              const future = showGhosts ? plantings.filter(p => p.garden_bed_id === bed.id && !isActiveInWeek(p) && isFutureRelativeToWeek(p)) : [];

              const segmentFreeNow = (rs: number, len: number) => {
                const re = rs + len - 1;
                return !active.some(p => {
                  const ps = p.start_segment ?? 0, pe = ps + (p.segments_used ?? 1) - 1;
                  return rs <= pe && ps <= re;
                });
              };

              return (
                <div key={bed.id}
                     className={`absolute rounded-lg shadow-sm border select-none ${bed.is_greenhouse ? "border-green-600/60 bg-green-50" : "bg-white"}`}
                     style={{ left: x, top: y, width: w, height: h }}>
                  <div className="flex items-center justify-between px-2 py-1 border-b bg-muted/50 rounded-t-lg">
                    <span className="text-xs font-medium truncate">{bed.name}</span>
                    {bed.is_greenhouse && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-600 text-white">Kas</span>}
                  </div>

                  {/* segmenten (HORIZONTAAL = rijen) + plantingen */}
                  <div className="relative w-full h-[calc(100%-28px)]">
                    {/* droppable segment-rijen */}
                    <div className="absolute inset-0 grid gap-[2px]" style={{ gridTemplateRows: `repeat(${bed.segments}, 1fr)` }}>
                      {Array.from({ length: bed.segments }, (_, i) => <MapDroppableSegment key={i} bed={bed} segmentIndex={i} />)}
                    </div>

                    {/* actieve plantingen */}
                    <div className="absolute inset-0">
                      {active.map((p) => {
                        const seed = seedsById[p.seed_id];
                        const start = p.start_segment ?? 0;
                        const used = p.segments_used ?? 1;
                        const top = start * segH;
                        const height = used * segH;
                        const isHex = p.color?.startsWith("#") || p.color?.startsWith("rgb");
                        return (
                          <div
                            key={p.id}
                            className={`absolute left-[3px] right-[3px] rounded ${isHex ? "" : (p.color ?? "bg-primary")} text-white text-[10px] px-1 flex items-center`}
                            style={{
                              top,
                              height: Math.max(14, height - 2),
                              backgroundColor: isHex ? (p.color ?? "#22c55e") : undefined,
                              outline: "1px solid rgba(0,0,0,.06)"
                            }}
                            title={seed?.name ?? "Onbekend"}
                          >
                            <span className="truncate">{seed?.name ?? "—"}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* toekomstige (ghosts) */}
                    {future.length > 0 && (
                      <div className="absolute inset-0 pointer-events-none">
                        {future.map((p) => {
                          const seed = seedsById[p.seed_id];
                          if (!seed) return null;
                          const start = p.start_segment ?? 0;
                          const used = p.segments_used ?? 1;
                          if (!segmentFreeNow(start, used)) return null;
                          const top = start * segH;
                          const height = used * segH;
                          const isHex = p.color?.startsWith("#") || p.color?.startsWith("rgb");
                          const bg = isHex ? p.color! : "rgba(34,197,94,.35)";
                          return (
                            <div
                              key={`ghost-${p.id}`}
                              className="absolute left-[3px] right-[3px] rounded text-white text-[10px] px-1 flex items-center"
                              style={{
                                top,
                                height: Math.max(14, height - 2),
                                backgroundColor: bg,
                                opacity: 0.35,
                                border: "1px dashed rgba(0,0,0,.45)"
                              }}>
                              <span className="truncate">{seed.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function MapDroppableSegment({ bed, segmentIndex }: { bed: GardenBed; segmentIndex: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `mapbed__${bed.id}__segment__${segmentIndex}` });
  return <div ref={setNodeRef} className={`w-full h-full border border-dashed ${isOver ? "bg-green-200/70" : "bg-transparent"}`} />;
}

/* ========== compacte kaart per bak voor LIST-view ========== */
function BedCard({
  bed, seedsById, plantings, currentWeek, showGhosts, onDeletePlanting, onClickPlanting,
}: {
  bed: GardenBed;
  seedsById: Record<string, Seed>;
  plantings: Planting[];
  currentWeek: Date;
  showGhosts: boolean;
  onDeletePlanting: (id: string) => void;
  onClickPlanting: (p: Planting, seed: Seed, startSegFallback: number) => void;
}) {
  const isActiveInWeek = (p: Planting) => {
    const start = new Date(p.planned_date ?? "");
    const end = new Date(p.planned_harvest_end ?? "");
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
    const monday = new Date(currentWeek);
    const sunday = addDays(monday, 6);
    return start <= sunday && end >= monday;
  };
  const isFutureRelativeToWeek = (p: Planting) => {
    const start = new Date(p.planned_date ?? "");
    if (isNaN(start.getTime())) return false;
    const monday = new Date(currentWeek);
    const sunday = addDays(monday, 6);
    return start > sunday;
  };

  const activePlantings = plantings.filter((p) => p.garden_bed_id === bed.id && isActiveInWeek(p));
  const futurePlantings = showGhosts ? plantings.filter((p) => p.garden_bed_id === bed.id && !isActiveInWeek(p) && isFutureRelativeToWeek(p)) : [];

  const segmentIsFreeNow = (idx: number) =>
    !activePlantings.some(p => {
      const s = p.start_segment ?? 0;
      const e = s + (p.segments_used ?? 1) - 1;
      return idx >= s && idx <= e;
    });

  return (
    <div className="p-2.5 border rounded-xl bg-card shadow-sm hover:shadow-md transition">
      <div className="flex items-center justify-between mb-1.5">
        <div>
          <h5 className="font-semibold text-sm">{bed.name}</h5>
          <p className="text-[11px] text-muted-foreground">{bed.segments} segmenten</p>
        </div>
        {bed.is_greenhouse && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-600 text-white">Kas</span>}
      </div>

      {/* HORIZONTAAL = rijen, compact */}
      <div className="grid gap-1" style={{ gridTemplateRows: `repeat(${bed.segments}, minmax(26px, auto))` }}>
        {Array.from({ length: bed.segments }, (_, i) => {
          const covering = activePlantings.filter((p) => {
            const start = p.start_segment ?? 0;
            const used = p.segments_used ?? 1;
            return i >= start && i < start + used;
          });
          const ghosts = segmentIsFreeNow(i)
            ? futurePlantings.filter((p) => {
                const start = p.start_segment ?? 0;
                const used = p.segments_used ?? 1;
                return i >= start && i < start + used;
              })
            : [];

          return (
            <DroppableSegment key={i} bed={bed} segmentIndex={i} occupied={covering.length > 0}>
              <div className="flex flex-col gap-0.5 w-full px-1">
                {covering.map((p) => {
                  const seed = seedsById[p.seed_id];
                  const isHex = p.color?.startsWith("#") || p.color?.startsWith("rgb");
                  return (
                    <div
                      key={`${p.id}-${i}`}
                      className="text-white text-[11px] rounded px-2 py-1 flex items-center justify-between gap-2 cursor-pointer"
                      style={{ background: isHex ? (p.color ?? "#22c55e") : undefined }}
                      onClick={() => seed && onClickPlanting(p, seed, p.start_segment ?? i)}
                    >
                      <span className="truncate">{seed?.name ?? "Onbekend"}</span>
                      {(i === p.start_segment) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeletePlanting(p.id); }}
                          className="text-white/80 hover:text-white text-xs"
                          title="Verwijderen"
                        >✕</button>
                      )}
                    </div>
                  );
                })}
                {ghosts.map((p) => {
                  const seed = seedsById[p.seed_id];
                  const isHex = p.color?.startsWith("#") || p.color?.startsWith("rgb");
                  const bg = isHex ? (p.color ?? "#22c55e") : "rgba(34,197,94,.35)";
                  return (
                    <div
                      key={`ghost-${p.id}-${i}`}
                      className="text-white text-[11px] rounded px-2 py-1 flex items-center gap-2"
                      style={{ background: bg, opacity: 0.35, border: "1px dashed rgba(0,0,0,.45)" }}
                      title={`${seed?.name ?? "Onbekend"} (toekomstig)`}
                    >
                      <span className="truncate">{seed?.name ?? "Onbekend"}</span>
                    </div>
                  );
                })}
              </div>
            </DroppableSegment>
          );
        })}
      </div>
    </div>
  );
}

/* ========== hoofdpagina ========== */
export function PlannerPage({ garden }: { garden: Garden }) {
  const [beds, setBeds] = useState<GardenBed[]>([]);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [plantings, setPlantings] = useState<Planting[]>([]);
  const [view, setView] = useState<"list" | "map">(() => (localStorage.getItem("plannerView") as any) || "list");

  const [popup, setPopup] = useState<
    | { mode: "create"; seed: Seed; bed: GardenBed; segmentIndex: number }
    | { mode: "edit"; planting: Planting; seed: Seed; bed: GardenBed; segmentIndex: number }
    | null
  >(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // dnd overlay state (tegen verspringen)
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const activeSeed = useMemo(() => {
    if (!activeDragId) return null;
    const id = activeDragId.replace("seed-", "");
    return seeds.find(s => s.id === id) || null;
  }, [activeDragId, seeds]);

  const [currentWeek, setCurrentWeek] = useState<Date>(() => {
    const saved = localStorage.getItem("plannerWeekISO");
    if (saved) return new Date(saved);
    const now = new Date();
    const d = new Date(now);
    d.setDate(now.getDate() - ((now.getDay()||7) - 1)); // maandag
    return d;
  });
  useEffect(() => { localStorage.setItem("plannerWeekISO", toISO(currentWeek)); }, [currentWeek]);
  useEffect(() => { localStorage.setItem("plannerView", view); }, [view]);

  // filters
  const [q, setQ] = useState<string>(() => localStorage.getItem("plannerQ") ?? "");
  const [inStockOnly, setInStockOnly] = useState<boolean>(() => localStorage.getItem("plannerInStock") === "1");
  const [inPlanner, setInPlanner] = useState<InPlannerFilter>(() => (localStorage.getItem("plannerInPlanner") as InPlannerFilter) ?? "all");
  const [greenhouseOnly, setGreenhouseOnly] = useState<boolean>(() => localStorage.getItem("plannerGHOnly") === "1");

  // 3 definitieve maandfilters
  const [fPresow, setFPresow] = useState<number[]>(() => JSON.parse(localStorage.getItem("plannerM_presow") ?? "[]"));
  const [fDirectPlant, setFDirectPlant] = useState<number[]>(() => JSON.parse(localStorage.getItem("plannerM_directplant") ?? "[]"));
  const [fHarvest, setFHarvest] = useState<number[]>(() => JSON.parse(localStorage.getItem("plannerM_harvest") ?? "[]"));

  const [showGhosts, setShowGhosts] = useState<boolean>(() => localStorage.getItem("plannerShowGhosts") === "1");

  useEffect(() => { localStorage.setItem("plannerQ", q); }, [q]);
  useEffect(() => { localStorage.setItem("plannerInStock", inStockOnly ? "1" : "0"); }, [inStockOnly]);
  useEffect(() => { localStorage.setItem("plannerInPlanner", inPlanner); }, [inPlanner]);
  useEffect(() => { localStorage.setItem("plannerGHOnly", greenhouseOnly ? "1" : "0"); }, [greenhouseOnly]);

  useEffect(() => { localStorage.setItem("plannerM_presow", JSON.stringify(fPresow)); }, [fPresow]);
  useEffect(() => { localStorage.setItem("plannerM_directplant", JSON.stringify(fDirectPlant)); }, [fDirectPlant]);
  useEffect(() => { localStorage.setItem("plannerM_harvest", JSON.stringify(fHarvest)); }, [fHarvest]);

  useEffect(() => { localStorage.setItem("plannerShowGhosts", showGhosts ? "1" : "0"); }, [showGhosts]);

  async function reload() {
    const [b, s, p] = await Promise.all([listBeds(garden.id), listSeeds(garden.id), listPlantings(garden.id)]);
    setBeds(b); setSeeds(s); setPlantings(p);
  }
  useEffect(() => { reload().catch(console.error); }, [garden.id]);

  // sort bedden per groep
  const outdoorBeds = useMemo(() => beds.filter(b => !b.is_greenhouse)
    .sort((a,b)=>(a.sort_order??0)-(b.sort_order??0) || a.created_at.localeCompare(b.created_at)), [beds]);
  const greenhouseBeds = useMemo(() => beds.filter(b => b.is_greenhouse)
    .sort((a,b)=>(a.sort_order??0)-(b.sort_order??0) || a.created_at.localeCompare(b.created_at)), [beds]);

  function isActiveInWeek(p: Planting, week: Date) {
    const start = new Date(p.planned_date ?? "");
    const end = new Date(p.planned_harvest_end ?? "");
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
    const monday = new Date(week);
    const sunday = addDays(monday, 6);
    return start <= sunday && end >= monday;
  }
  function isFutureRelativeToWeek(p: Planting, week: Date) {
    const start = new Date(p.planned_date ?? "");
    if (isNaN(start.getTime())) return false;
    const monday = new Date(week);
    const sunday = addDays(monday, 6);
    return start > sunday;
  }
  function getPhase(p: Planting, week: Date): string {
    const start = p.planned_date ? new Date(p.planned_date) : null;
    const harvestStart = p.planned_harvest_start ? new Date(p.planned_harvest_start) : null;
    const harvestEnd = p.planned_harvest_end ? new Date(p.planned_harvest_end) : null;
    if (!start) return "onbekend";
    if (harvestEnd && harvestEnd < week) return "afgelopen";
    if (harvestStart && harvestStart <= week && (!harvestEnd || harvestEnd >= week)) return "oogsten";
    if (start <= week && (!harvestStart || harvestStart > week)) return "groeit";
    return "gepland";
  }

  function nextWeek() { setCurrentWeek(addDays(currentWeek, 7)); }
  function prevWeek() { setCurrentWeek(addDays(currentWeek, -7)); }
  function goToToday() {
    const now = new Date(); const d = new Date(now);
    d.setDate(now.getDate() - ((now.getDay()||7) - 1));
    setCurrentWeek(d);
  }
  function formatWeek(d: Date) {
    const end = addDays(d, 6);
    const wk = isoWeekNumber(d);
    return `WK ${wk} • ${d.getDate()}/${d.getMonth()+1} – ${end.getDate()}/${end.getMonth()+1}`;
  }

  const seedsById = useMemo(() => Object.fromEntries(seeds.map(s=>[s.id, s])), [seeds]);
  const seedHasPlanned = (seedId: string) => {
    const todayISO = toISO(new Date());
    return plantings.some(p => p.seed_id === seedId && (p.planned_harvest_end ?? p.actual_harvest_end ?? todayISO) >= todayISO);
  };

  const filteredSeeds = useMemo(() => {
    let arr = seeds.slice();
    if (q.trim()) {
      const term = q.trim().toLowerCase();
      arr = arr.filter(s => s.name.toLowerCase().includes(term));
    }
    if (inStockOnly) arr = arr.filter(s => (s as any).in_stock ?? true);
    if (greenhouseOnly) arr = arr.filter(s => !!s.greenhouse_compatible);
    if (inPlanner !== 'all') {
      arr = arr.filter(s => (inPlanner === 'planned') ? seedHasPlanned(s.id) : !seedHasPlanned(s.id));
    }
    const anyMatch = (vals: number[] | null | undefined, selected: number[]) =>
      !selected.length || (vals ?? []).some(v => selected.includes(v));
    arr = arr.filter(s =>
      anyMatch(s.presow_months ?? [], fPresow) &&
      anyMatch((s as any).direct_plant_months ?? [], fDirectPlant) &&
      anyMatch(s.harvest_months ?? [], fHarvest)
    );
    return arr;
  }, [seeds, q, inStockOnly, greenhouseOnly, inPlanner, fPresow, fDirectPlant, fHarvest, plantings]);

  function openCreatePopup(bed: GardenBed, seed: Seed, segIdx: number) {
    if (bed.is_greenhouse && !seed.greenhouse_compatible) {
      setToast({ message: "Dit zaad is niet geschikt voor de kas.", type: "error" });
      return;
    }
    setPopup({ mode: "create", seed, bed, segmentIndex: segIdx });
  }

  function handleDragStart(event: any) {
    setActiveDragId(String(event.active?.id ?? ""));
  }
  function handleDragEnd(event: any) {
    const over = event.over;
    const activeId = String(event.active?.id ?? "");
    setActiveDragId(null);
    if (!over || !activeId.startsWith("seed-")) return;

    const seedId = activeId.replace("seed-", "");
    const seed = seeds.find((s) => s.id === seedId);
    if (!seed) return;

    const overId = String(over.id);
    if (overId.startsWith("bed__") || overId.startsWith("mapbed__")) {
      const parts = overId.split("__");
      const bedId = parts[1];
      const segIdx = parseInt(parts[3], 10);
      const bed = beds.find((b) => b.id === bedId);
      if (bed) openCreatePopup(bed, seed, segIdx);
    }
  }

  async function reloadAll() {
    const [b, s, p] = await Promise.all([listBeds(garden.id), listSeeds(garden.id), listPlantings(garden.id)]);
    setBeds(b); setSeeds(s); setPlantings(p);
  }

  async function handleDeletePlanting(id: string) {
    if (!confirm("Weet je zeker dat je deze planting wilt verwijderen?")) return;
    try {
      await deletePlanting(id);
      setPlantings((prev) => prev.filter((p) => p.id !== id));
      setToast({ message: "Planting verwijderd.", type: "success" });
    } catch (e: any) {
      setToast({ message: "Kon planting niet verwijderen: " + (e?.message ?? e), type: "error" });
    }
  }

  function wouldOverlap(bed: GardenBed, startSeg: number, segUsed: number, startDate: Date, endDate: Date, ignorePlantingId?: string) {
    const aStart = startDate, aEnd = endDate;
    const aSegStart = startSeg, aSegEnd = startSeg + segUsed - 1;
    for (const p of plantings) {
      if (p.garden_bed_id !== bed.id) continue;
      if (ignorePlantingId && p.id === ignorePlantingId) continue;
      const bStart = new Date(p.planned_date ?? "");
      const bEnd   = new Date(p.planned_harvest_end ?? "");
      if (isNaN(bStart.getTime()) || isNaN(bEnd.getTime())) continue;
      const timeOverlap = (aStart <= bEnd) && (bStart <= aEnd);
      if (!timeOverlap) continue;
      const ps = p.start_segment ?? 0;
      const pe = (p.start_segment ?? 0) + (p.segments_used ?? 1) - 1;
      const segOverlap = (aSegStart <= pe) && (ps <= aSegEnd);
      if (segOverlap) return true;
    }
    return false;
  }

  async function handleConfirmPlanting(opts: {
    mode: "create" | "edit";
    target: { seed: Seed; bed: GardenBed; segmentIndex: number; planting?: Planting };
    segmentsUsed: number;
    method: "direct" | "presow";
    dateISO: string;
    hexColor: string;
  }) {
    const { mode, target, segmentsUsed, method, dateISO, hexColor } = opts;
    const { seed, bed, segmentIndex } = target;

    if (!seed.grow_duration_weeks || !seed.harvest_duration_weeks) {
      setToast({ type: "error", message: "Vul eerst groei-/oogstduur weken in bij dit zaad voordat je plant." });
      return;
    }
    if (method === "presow" && !seed.presow_duration_weeks) {
      setToast({ type: "error", message: "Voorzaaien gekozen: vul eerst voorzaai-weken in bij dit zaad." });
      return;
    }

    // GEKOZEN DATUM = in de grond (plant of direct)
    const plantDate = new Date(dateISO);
    // sowDate wordt alleen conceptueel gebruikt (triggers/server kunnen dit berekenen uit presow_weeks)
    const harvestStart = addWeeks(plantDate, seed.grow_duration_weeks!);
    const harvestEnd   = addWeeks(harvestStart, seed.harvest_duration_weeks!);

    const segUsedClamped = clamp(segmentsUsed, 1, bed.segments - segmentIndex);
    if (wouldOverlap(bed, segmentIndex, segUsedClamped, plantDate, harvestEnd, mode === "edit" ? target.planting?.id : undefined)) {
      setToast({ type: "error", message: "Deze planning botst in tijd/segment met een bestaande teelt." });
      return;
    }

    try {
      if (mode === "create") {
        await createPlanting({
          seed_id: seed.id,
          garden_bed_id: bed.id,
          garden_id: bed.garden_id,
          planned_date: toISO(plantDate),
          planned_harvest_start: toISO(harvestStart),
          planned_harvest_end: toISO(harvestEnd),
          method,
          segments_used: segUsedClamped,
          start_segment: segmentIndex,
          color: hexColor || seed.default_color || "#22c55e",
          status: "planned",
        } as any);
      } else {
        const p = target.planting!;
        await updatePlanting(p.id, {
          planned_date: toISO(plantDate),
          planned_harvest_start: toISO(harvestStart),
          planned_harvest_end: toISO(harvestEnd),
          method,
          segments_used: segUsedClamped,
          start_segment: p.start_segment ?? segmentIndex,
          color: hexColor || p.color || seed.default_color || "#22c55e",
        } as any);
      }

      const monday = new Date(currentWeek);
      const sunday = addDays(monday, 6);
      const activeNow = plantDate <= sunday && harvestEnd >= monday;
      await reloadAll();
      setPopup(null);
      setToast({ message: mode === "create" ? "Planting toegevoegd." : "Planting bijgewerkt.", type: "success" });
      if (!activeNow) {
        const wk = isoWeekNumber(plantDate);
        setToast({ message: `Gepland — zichtbaar vanaf week WK ${wk}.`, type: "info" });
      }
    } catch (e: any) {
      setToast({ message: "Kon planting niet opslaan: " + (e?.message ?? e), type: "error" });
    }
  }

  /* sticky header */
  const HeaderBar = (
    <div className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
      <div className="py-2.5 flex items-center justify-between">
        <h2 className="text-2xl font-bold">Planner</h2>
        <div className="flex items-center gap-2 text-sm">
          <button onClick={prevWeek} className="px-2 py-1 border rounded">← Vorige week</button>
          <span className="font-medium whitespace-nowrap">{formatWeek(currentWeek)}</span>
          <button onClick={nextWeek} className="px-2 py-1 border rounded">Volgende week →</button>
          <button onClick={goToToday} className="px-2 py-1 border rounded">Vandaag</button>
        </div>
      </div>

      {/* subtabs */}
      <div className="flex items-center gap-3 pb-2">
        {[
          { k: "list", label: "Lijstweergave" },
          { k: "map",  label: "Plattegrond"   },
        ].map(t => {
          const active = view === (t.k as any);
          return (
            <button key={t.k}
              onClick={() => setView(t.k as any)}
              className={[
                "px-3 py-1.5 text-sm rounded-md border transition",
                active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"
              ].join(" ")}
            >
              {t.label}
            </button>
          );
        })}

        <label className="ml-auto mr-1 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showGhosts} onChange={(e)=>setShowGhosts(e.target.checked)} />
          Toon toekomstige plantingen
        </label>
      </div>
    </div>
  );

  /* --- render --- */
  return (
    <div className="space-y-6">
      {HeaderBar}

      <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          {/* Sidebar (STICKY + eigen scroll, stabiele scrollbar) */}
          <div className="col-span-1">
            <div className="sticky top-24">
              <div
                className="space-y-3 max-h-[calc(100vh-7rem)] overflow-auto pr-1 pb-3"
                style={{ scrollbarGutter: "stable both-edges" as any }}
              >
                <h3 className="text-base font-semibold">Zoek/filters</h3>
                <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Zoek op naam…"
                       className="w-full border rounded-md px-2 py-1" />

                <div className="space-y-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={inStockOnly} onChange={e=>setInStockOnly(e.target.checked)} />
                    In voorraad
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={greenhouseOnly} onChange={e=>setGreenhouseOnly(e.target.checked)} />
                    Alleen kas-geschikt
                  </label>

                  <div>
                    <div className="mb-1">In planner</div>
                    <div className="flex flex-wrap gap-2">
                      {([
                        ['all','Alle'],
                        ['planned','Reeds gepland'],
                        ['unplanned','Nog niet gepland'],
                      ] as const).map(([k, lbl]) => (
                        <button key={k}
                          className={`px-2 py-0.5 rounded border text-xs ${inPlanner===k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                          onClick={()=>setInPlanner(k as InPlannerFilter)}
                          type="button"
                        >{lbl}</button>
                      ))}
                    </div>
                  </div>

                  {/* maandfilters — definitief 3 */}
                  <div className="space-y-1.5">
                    <div>
                      <div className="text-[11px] mb-1">Voorzaaimaanden</div>
                      <MonthChips selected={fPresow} onToggle={(m)=>setFPresow(prev=>prev.includes(m)? prev.filter(x=>x!==m): [...prev,m])}/>
                    </div>
                    <div>
                      <div className="text-[11px] mb-1">Direct/Plant maanden</div>
                      <MonthChips selected={fDirectPlant} onToggle={(m)=>setFDirectPlant(prev=>prev.includes(m)? prev.filter(x=>x!==m): [...prev,m])}/>
                    </div>
                    <div>
                      <div className="text-[11px] mb-1">Oogstmaanden</div>
                      <MonthChips selected={fHarvest} onToggle={(m)=>setFHarvest(prev=>prev.includes(m)? prev.filter(x=>x!==m): [...prev,m])}/>
                    </div>
                  </div>
                </div>

                <h3 className="text-base font-semibold mt-1.5">Beschikbare zaden</h3>
                <div className="space-y-1.5">
                  {filteredSeeds.map((seed) => (
                    <DraggableSeed key={seed.id} seed={seed} isDragging={activeDragId === `seed-${seed.id}`} />
                  ))}
                  {filteredSeeds.length === 0 && <p className="text-xs text-muted-foreground">Geen zaden gevonden met deze filters.</p>}
                </div>
              </div>
            </div>
          </div>

          {/* Content area */}
          <div className="col-span-3 space-y-6">
            {view === "list" ? (
              <>
                {/* Buiten */}
                {outdoorBeds.length > 0 && (
                  <section className="space-y-2">
                    <h4 className="text-lg font-semibold">Buiten</h4>
                    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                      {outdoorBeds.map((bed) => (
                        <BedCard
                          key={bed.id}
                          bed={bed}
                          seedsById={seedsById}
                          plantings={plantings}
                          currentWeek={currentWeek}
                          showGhosts={showGhosts}
                          onDeletePlanting={handleDeletePlanting}
                          onClickPlanting={(p, seed, seg) => setPopup({ mode: "edit", bed, seed, planting: p, segmentIndex: seg })}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* Kas */}
                {greenhouseBeds.length > 0 && (
                  <section className="space-y-2">
                    <h4 className="text-lg font-semibold">Kas</h4>
                    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                      {greenhouseBeds.map((bed) => (
                        <BedCard
                          key={bed.id}
                          bed={bed}
                          seedsById={seedsById}
                          plantings={plantings}
                          currentWeek={currentWeek}
                          showGhosts={showGhosts}
                          onDeletePlanting={handleDeletePlanting}
                          onClickPlanting={(p, seed, seg) => setPopup({ mode: "edit", bed, seed, planting: p, segmentIndex: seg })}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </>
            ) : (
              <PlannerMap
                beds={beds}
                seedsById={seedsById}
                plantings={plantings}
                currentWeek={currentWeek}
                showGhosts={showGhosts}
              />
            )}
          </div>
        </div>

        {/* Drag overlay zodat de sidebar niet verspringt */}
        <DragOverlay dropAnimation={null}>
          {activeSeed ? (
            <div className="px-2 py-1 border rounded-md bg-secondary text-sm flex items-center gap-2 pointer-events-none shadow-lg">
              {activeSeed.default_color?.startsWith("#")
                ? <span className="inline-block w-3 h-3 rounded" style={{ background: activeSeed.default_color }} />
                : <span className={`inline-block w-3 h-3 rounded ${activeSeed.default_color ?? "bg-green-500"}`} />
              }
              <span className="truncate">{activeSeed.name}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Popup */}
      {popup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-card p-5 rounded-lg shadow-lg w-full max-w-md space-y-4"
               onPointerDown={(e)=>e.stopPropagation()}>
            <h3 className="text-lg font-semibold">{popup.mode === "create" ? "Nieuwe planting" : "Planting bewerken"}</h3>
            <PlantingForm
              mode={popup.mode}
              seed={popup.seed}
              bed={popup.bed}
              defaultSegment={popup.segmentIndex}
              defaultDateISO={popup.mode === "edit" ? (popup.planting.planned_date ?? toISO(currentWeek)) : toISO(currentWeek)}
              existing={popup.mode === "edit" ? popup.planting : undefined}
              onCancel={() => setPopup(null)}
              onConfirm={(segmentsUsed, method, date, hex) =>
                handleConfirmPlanting({
                  mode: popup.mode,
                  target: popup.mode === "create"
                    ? { seed: popup.seed, bed: popup.bed, segmentIndex: popup.segmentIndex }
                    : { seed: popup.seed, bed: popup.bed, segmentIndex: popup.segmentIndex, planting: popup.planting },
                  segmentsUsed, method, dateISO: date, hexColor: hex
                })
              }
            />
          </div>
        </div>
      )}

      {/* Floating naar-boven knop */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="fixed bottom-6 right-6 z-40 px-3 py-2 rounded-full border bg-background/90 backdrop-blur shadow"
        title="Naar boven"
      >
        ↥
      </button>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

/* ========== PlantingForm (snelle popup) ========== */
function PlantingForm({
  mode, seed, bed, defaultSegment, defaultDateISO, existing, onCancel, onConfirm,
}: {
  mode: "create" | "edit";
  seed: Seed;
  bed: GardenBed;
  defaultSegment: number;
  defaultDateISO: string;
  existing?: Planting;
  onCancel: () => void;
  onConfirm: (segmentsUsed: number, method: "direct" | "presow", dateISO: string, hexColor: string) => void;
}) {
  const [segmentsUsed, setSegmentsUsed] = useState<number>(existing?.segments_used ?? 1);
  const [method, setMethod] = useState<"direct" | "presow">(
    existing?.method ?? ((seed.sowing_type === "direct" || seed.sowing_type === "presow") ? seed.sowing_type : "direct")
  );
  const [date, setDate] = useState<string>(existing?.planned_date ?? defaultDateISO);
  const [color, setColor] = useState<string>(() => {
    const source = existing?.color ?? seed.default_color ?? "#22c55e";
    return source.startsWith("#") || source.startsWith("rgb") ? source : "#22c55e";
  });
  const maxSeg = Math.max(1, bed.segments - defaultSegment);

  return (
    <form onSubmit={(e) => { e.preventDefault(); onConfirm(segmentsUsed, method, date, color); }} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Aantal segmenten</label>
        <input type="number" name="segmentsUsed" min={1} max={maxSeg} value={segmentsUsed}
               onChange={(e) => setSegmentsUsed(Number(e.target.value))}
               className="border rounded-md px-2 py-1 w-full" />
        <p className="text-xs text-muted-foreground mt-1">
          Start in segment {defaultSegment + 1} en beslaat {segmentsUsed} segment(en).
        </p>
      </div>

      {seed.sowing_type === "both" ? (
        <div>
          <label className="block text-sm font-medium mb-1">Zaaimethode</label>
          <select name="method" value={method} onChange={(e) => setMethod(e.target.value as "direct" | "presow")}
                  className="border rounded-md px-2 py-1 w-full">
            <option value="direct">Direct</option>
            <option value="presow">Voorzaaien</option>
          </select>
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium mb-1">Zaaimethode</label>
          <div className="text-sm">{seed.sowing_type === "direct" ? "Direct" : seed.sowing_type === "presow" ? "Voorzaaien" : "—"}</div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Zaai-/Plantdatum</label>
        <input type="date" name="date" value={date} onChange={(e) => setDate(e.target.value)}
               className="border rounded-md px-2 py-1 w-full" />
        <p className="text-xs text-muted-foreground mt-1">
          Bij <strong>voorzaaien</strong> is dit de <em>uitplantdatum</em> (zaaidatum berekenen we automatisch terug).
        </p>
      </div>

      <ColorField
        label="Kleur in planner"
        value={color}
        onChange={setColor}
        helperText="Voer #RRGGBB of rgb(r,g,b) in. We slaan #hex op."
      />

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel}
                className="px-3 py-1 border border-border rounded-md bg-muted">Annuleren</button>
        <button type="submit"
                className="px-3 py-1 rounded-md bg-primary text-primary-foreground">
          {mode === "create" ? "Opslaan" : "Bijwerken"}
        </button>
      </div>
    </form>
  );
}
