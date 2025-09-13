import { useEffect, useMemo, useState } from "react";
import type { Garden, GardenBed, Planting, Seed } from "../lib/types";
import { listBeds } from "../lib/api/beds";
import { listSeeds, updateSeed } from "../lib/api/seeds";
import { createPlanting, listPlantings, deletePlanting, updatePlanting } from "../lib/api/plantings";
import { DndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import { ColorField } from "./ColorField";

/* ========== kleine helpers ========== */
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addWeeks(d: Date, w: number) { return addDays(d, w * 7); }
function toISO(d: Date) { return d.toISOString().slice(0, 10); }
function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }

function isoWeekNumber(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // 1..7 (ma=1)
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d as any) - (yearStart as any)) / 86400000 + 1) / 7);
  return weekNo;
}

/* ========== UI hulpmiddelen ========== */
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

function DraggableSeed({ seed }: { seed: Seed }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: `seed-${seed.id}` });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}
         className="p-2 border rounded-md bg-secondary cursor-move text-sm flex items-center gap-2">
      {/* kleurpuntje */}
      {seed.default_color?.startsWith("#") ? (
        <span className="inline-block w-3 h-3 rounded" style={{ background: seed.default_color }} />
      ) : (
        <span className={`inline-block w-3 h-3 rounded ${seed.default_color ?? "bg-green-500"}`} />
      )}
      <span className="truncate">{seed.name}</span>
    </div>
  );
}

function DroppableSegment({
  bed, segmentIndex, occupied, children,
}: { bed: GardenBed; segmentIndex: number; occupied: boolean; children: React.ReactNode; }) {
  const { setNodeRef, isOver } = useDroppable({ id: `bed__${bed.id}__segment__${segmentIndex}` });
  const base = "flex items-center justify-center border border-dashed rounded-sm min-h-[60px] transition";
  const color = isOver ? "bg-green-200" : occupied ? "bg-emerald-50" : "bg-muted";
  return <div ref={setNodeRef} className={`${base} ${color}`}>{children}</div>;
}

/* ========== filters ========== */
type InPlannerFilter = 'all' | 'planned' | 'unplanned';
const MONTHS_SHORT = ["J","F","M","A","M","J","J","A","S","O","N","D"];

function MonthChips({
  selected, onToggle
}: { selected: number[]; onToggle: (m: number) => void; }) {
  return (
    <div className="flex flex-wrap gap-1">
      {MONTHS_SHORT.map((lbl, i) => {
        const m = i + 1;
        const on = selected.includes(m);
        return (
          <button key={m}
            type="button"
            onClick={() => onToggle(m)}
            className={`px-2 py-0.5 rounded text-xs border ${on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {lbl}
          </button>
        );
      })}
    </div>
  );
}

/* ========== planner pagina ========== */
export function PlannerPage({ garden }: { garden: Garden }) {
  const [beds, setBeds] = useState<GardenBed[]>([]);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [plantings, setPlantings] = useState<Planting[]>([]);
  const [popup, setPopup] = useState<
    | { mode: "create"; seed: Seed; bed: GardenBed; segmentIndex: number }
    | { mode: "edit"; planting: Planting; seed: Seed; bed: GardenBed; segmentIndex: number }
    | null
  >(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // weekstate (bewaar in LS)
  const [currentWeek, setCurrentWeek] = useState<Date>(() => {
    const saved = localStorage.getItem("plannerWeekISO");
    if (saved) return new Date(saved);
    const now = new Date();
    const d = new Date(now);
    // maandag
    d.setDate(now.getDate() - ((now.getDay()||7) - 1));
    return d;
  });
  useEffect(() => { localStorage.setItem("plannerWeekISO", toISO(currentWeek)); }, [currentWeek]);

  // filters (bewaar in LS)
  const [q, setQ] = useState<string>(() => localStorage.getItem("plannerQ") ?? "");
  const [inStockOnly, setInStockOnly] = useState<boolean>(() => localStorage.getItem("plannerInStock") === "1");
  const [inPlanner, setInPlanner] = useState<InPlannerFilter>(() => (localStorage.getItem("plannerInPlanner") as InPlannerFilter) ?? "all");
  const [greenhouseOnly, setGreenhouseOnly] = useState<boolean>(() => localStorage.getItem("plannerGHOnly") === "1");

  const [fPresow, setFPresow] = useState<number[]>(() => JSON.parse(localStorage.getItem("plannerM_presow") ?? "[]"));
  const [fDirect, setFDirect] = useState<number[]>(() => JSON.parse(localStorage.getItem("plannerM_direct") ?? "[]"));
  const [fPlant, setFPlant] = useState<number[]>(() => JSON.parse(localStorage.getItem("plannerM_plant") ?? "[]"));
  const [fHarvest, setFHarvest] = useState<number[]>(() => JSON.parse(localStorage.getItem("plannerM_harvest") ?? "[]"));

  useEffect(() => { localStorage.setItem("plannerQ", q); }, [q]);
  useEffect(() => { localStorage.setItem("plannerInStock", inStockOnly ? "1" : "0"); }, [inStockOnly]);
  useEffect(() => { localStorage.setItem("plannerInPlanner", inPlanner); }, [inPlanner]);
  useEffect(() => { localStorage.setItem("plannerGHOnly", greenhouseOnly ? "1" : "0"); }, [greenhouseOnly]);

  useEffect(() => { localStorage.setItem("plannerM_presow", JSON.stringify(fPresow)); }, [fPresow]);
  useEffect(() => { localStorage.setItem("plannerM_direct", JSON.stringify(fDirect)); }, [fDirect]);
  useEffect(() => { localStorage.setItem("plannerM_plant", JSON.stringify(fPlant)); }, [fPlant]);
  useEffect(() => { localStorage.setItem("plannerM_harvest", JSON.stringify(fHarvest)); }, [fHarvest]);

  async function reload() {
    const [b, s, p] = await Promise.all([listBeds(garden.id), listSeeds(garden.id), listPlantings(garden.id)]);
    setBeds(b); setSeeds(s); setPlantings(p);
  }
  useEffect(() => { reload().catch(console.error); }, [garden.id]);

  // sorteer bedden per groep op sort_order (consistent met Bakken)
  const outdoorBeds = useMemo(() => beds.filter(b => !b.is_greenhouse)
    .sort((a,b)=>(a.sort_order??0)-(b.sort_order??0) || a.created_at.localeCompare(b.created_at)), [beds]);
  const greenhouseBeds = useMemo(() => beds.filter(b => b.is_greenhouse)
    .sort((a,b)=>(a.sort_order??0)-(b.sort_order??0) || a.created_at.localeCompare(b.created_at)), [beds]);

  // plantings helpers voor week
  function isActiveInWeek(p: Planting, week: Date) {
    const start = new Date(p.planned_plant_date ?? p.planned_sow_date ?? "");
    const end = new Date(p.planned_harvest_end ?? "");
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
    const monday = new Date(week);
    const sunday = addDays(monday, 6);
    return start <= sunday && end >= monday;
  }

  function getPhase(p: Planting, week: Date): string {
    const start = p.planned_plant_date ? new Date(p.planned_plant_date) : null;
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

  // filterlogica voor sidebar
  const seedsById = useMemo(() => Object.fromEntries(seeds.map(s=>[s.id, s])), [seeds]);
  const seedHasPlanned = (seedId: string) => {
    const todayISO = toISO(new Date());
    return plantings.some(p => p.seed_id === seedId && (p.planned_harvest_end ?? p.actual_harvest_end ?? todayISO) >= todayISO);
  };

  const filteredSeeds = useMemo(() => {
    let arr = seeds.slice();

    // naam
    if (q.trim()) {
      const term = q.trim().toLowerCase();
      arr = arr.filter(s => s.name.toLowerCase().includes(term));
    }

    // voorraad
    if (inStockOnly) arr = arr.filter(s => !!s.in_stock);

    // kas-geschikt
    if (greenhouseOnly) arr = arr.filter(s => !!s.greenhouse_compatible);

    // in planner
    if (inPlanner !== 'all') {
      arr = arr.filter(s => {
        const has = seedHasPlanned(s.id);
        return inPlanner === 'planned' ? has : !has;
      });
    }

    // maandfilters: ANY-match per filter
    const anyMatch = (vals: number[] | null | undefined, selected: number[]) =>
      !selected.length || (vals ?? []).some(v => selected.includes(v));

    arr = arr.filter(s =>
      anyMatch(s.presow_months ?? [], fPresow) &&
      anyMatch(s.direct_sow_months ?? [], fDirect) &&
      anyMatch(s.plant_months ?? [], fPlant) &&
      anyMatch(s.harvest_months ?? [], fHarvest)
    );

    return arr;
  }, [seeds, q, inStockOnly, greenhouseOnly, inPlanner, fPresow, fDirect, fPlant, fHarvest, plantings]);

  // DnD drop -> open popup (met kas-rule)
  function handleDragEnd(event: any) {
    if (!event.over) return;
    const overId = event.over.id as string;
    const activeId = event.active.id as string;
    if (!overId.startsWith("bed__") || !activeId.startsWith("seed-")) return;

    const parts = overId.split("__");
    const bedId = parts[1];
    const segIdx = parseInt(parts[3], 10);
    const bed = beds.find((b) => b.id === bedId);
    const seedId = activeId.replace("seed-", "");
    const seed = seeds.find((s) => s.id === seedId);
    if (!bed || !seed) return;

    if (bed.is_greenhouse && !seed.greenhouse_compatible) {
      setToast({ message: "Dit zaad is niet geschikt voor de kas.", type: "error", });
      return;
    }

    setPopup({ mode: "create", seed, bed, segmentIndex: segIdx });
  }

  async function handleDeletePlanting(id: string) {
    if (!confirm("Weet je zeker dat je deze planting wilt verwijderen?")) return;
    try {
      await deletePlanting(id);
      setPlantings(plantings.filter((p) => p.id !== id));
      setToast({ message: "Planting verwijderd.", type: "success" });
    } catch (e: any) {
      setToast({ message: "Kon planting niet verwijderen: " + (e.message ?? e), type: "error" });
    }
  }

  // front-end collision precheck
  function wouldOverlap(bed: GardenBed, startSeg: number, segUsed: number, startDate: Date, endDate: Date, ignorePlantingId?: string) {
    const aStart = startDate, aEnd = endDate;
    const aSegStart = startSeg, aSegEnd = startSeg + segUsed - 1;

    for (const p of plantings) {
      if (p.garden_bed_id !== bed.id) continue;
      if (ignorePlantingId && p.id === ignorePlantingId) continue;

      const bStart = new Date(p.planned_plant_date ?? p.planned_sow_date ?? "");
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
    markOutOfStock: boolean;
  }) {
    const { mode, target, segmentsUsed, method, dateISO, hexColor, markOutOfStock } = opts;
    const { seed, bed, segmentIndex } = target;

    // Validaties op seed-velden
    if (!seed.grow_duration_weeks || !seed.harvest_duration_weeks) {
      setToast({ type: "error", message: "Vul eerst groei-/oogstduur weken in bij dit zaad voordat je plant." });
      return;
    }
    if (method === "presow" && !seed.presow_duration_weeks) {
      setToast({ type: "error", message: "Voorzaaien gekozen: vul eerst voorzaai-weken in bij dit zaad." });
      return;
    }

    // Bepaal datums vanuit één invoer-datum
    const chosen = new Date(dateISO);
    const plantDate = method === "presow"
      ? addWeeks(chosen, seed.presow_duration_weeks || 0)
      : chosen;
    const sowDate = chosen; // bij direct gelijk aan plant; bij presow = zaaidatum
    const harvestStart = addWeeks(plantDate, seed.grow_duration_weeks!);
    const harvestEnd   = addWeeks(harvestStart, seed.harvest_duration_weeks!);

    // Segment-cap
    const segUsedClamped = clamp(segmentsUsed, 1, bed.segments - segmentIndex);

    // Overlap-precheck
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

          // ✅ één invoer-datum → beide velden gevuld volgens methode
          planned_sow_date: toISO(sowDate),
          planned_plant_date: toISO(plantDate),
          planned_harvest_start: toISO(harvestStart),
          planned_harvest_end: toISO(harvestEnd),

          method,
          segments_used: segUsedClamped,
          start_segment: segmentIndex,
          color: hexColor || seed.default_color || "#22c55e",
          status: "planned",
        });
      } else {
        // snelle edit: datum/kleur/segmenten/methode
        const p = target.planting!;
        await updatePlanting(p.id, {
          planned_sow_date: toISO(sowDate),
          planned_plant_date: toISO(plantDate),
          planned_harvest_start: toISO(harvestStart),
          planned_harvest_end: toISO(harvestEnd),
          method,
          segments_used: segUsedClamped,
          // start_segment blijft het begin waar het blok staat
          start_segment: p.start_segment ?? segmentIndex,
          color: hexColor || p.color || seed.default_color || "#22c55e",
        });
      }

      // Eventueel voorraad direct op 'op' zetten
      if (markOutOfStock && seed.in_stock) {
        await updateSeed(seed.id, { in_stock: false });
      }

      await reload();
      setPopup(null);
      setToast({ message: mode === "create" ? "Planting toegevoegd." : "Planting bijgewerkt.", type: "success" });
    } catch (e: any) {
      setToast({ message: "Kon planting niet opslaan: " + (e?.message ?? e), type: "error" });
    }
  }

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">Planner</h2>
        <div className="flex items-center gap-4">
          <button onClick={prevWeek} className="px-2 py-1 border rounded">← Vorige week</button>
          <span className="font-medium">{formatWeek(currentWeek)}</span>
          <button onClick={nextWeek} className="px-2 py-1 border rounded">Volgende week →</button>
          <button onClick={goToToday} className="px-2 py-1 border rounded">Vandaag</button>
        </div>
      </div>

      <DndContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Sidebar: zoek & filters */}
          <div className="col-span-1 space-y-4">
            <h3 className="text-lg font-semibold">Zoek/filters</h3>
            <input
              value={q}
              onChange={(e)=>setQ(e.target.value)}
              placeholder="Zoek op naam…"
              className="w-full border rounded-md px-2 py-1"
            />

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

              <div className="space-y-2">
                <div>
                  <div className="text-xs mb-1">Voorzaai maanden</div>
                  <MonthChips selected={fPresow} onToggle={(m)=>setFPresow(prev=>prev.includes(m)? prev.filter(x=>x!==m): [...prev,m])}/>
                </div>
                <div>
                  <div className="text-xs mb-1">Direct zaaien</div>
                  <MonthChips selected={fDirect} onToggle={(m)=>setFDirect(prev=>prev.includes(m)? prev.filter(x=>x!==m): [...prev,m])}/>
                </div>
                <div>
                  <div className="text-xs mb-1">Plantmaanden</div>
                  <MonthChips selected={fPlant} onToggle={(m)=>setFPlant(prev=>prev.includes(m)? prev.filter(x=>x!==m): [...prev,m])}/>
                </div>
                <div>
                  <div className="text-xs mb-1">Oogstmaanden</div>
                  <MonthChips selected={fHarvest} onToggle={(m)=>setFHarvest(prev=>prev.includes(m)? prev.filter(x=>x!==m): [...prev,m])}/>
                </div>
              </div>
            </div>

            <h3 className="text-lg font-semibold mt-4">Beschikbare zaden</h3>
            <div className="space-y-2">
              {filteredSeeds.map((seed) => <DraggableSeed key={seed.id} seed={seed} />)}
              {filteredSeeds.length === 0 && <p className="text-xs text-muted-foreground">Geen zaden gevonden met deze filters.</p>}
            </div>
          </div>

          {/* Beds (lijstweergave per groep) */}
          <div className="col-span-3 space-y-10">
            {/* Buiten */}
            {outdoorBeds.length > 0 && (
              <div className="space-y-6">
                <h4 className="text-lg font-semibold">Buiten</h4>
                {outdoorBeds.map((bed) => {
                  const activePlantings = plantings.filter((p) => p.garden_bed_id === bed.id && isActiveInWeek(p, currentWeek));
                  const historyPlantings = plantings.filter((p) => p.garden_bed_id === bed.id && getPhase(p, currentWeek) === "afgelopen");

                  return (
                    <div key={bed.id} className="space-y-4">
                      <h5 className="font-semibold">{bed.name} ({bed.segments} segmenten)</h5>
                      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${bed.segments}, 1fr)` }}>
                        {Array.from({ length: bed.segments }, (_, i) => {
                          const covering = activePlantings.filter((p) => {
                            const start = p.start_segment ?? 0;
                            const used = p.segments_used ?? 1;
                            return i >= start && i < start + used;
                          });
                          return (
                            <DroppableSegment key={i} bed={bed} segmentIndex={i} occupied={covering.length > 0}>
                              <div className="flex flex-col gap-1 w-full px-1">
                                {covering.map((p) => {
                                  const seed = seedsById[p.seed_id];
                                  const isHex = p.color?.startsWith("#") || p.color?.startsWith("rgb");
                                  return (
                                    <div key={`${p.id}-${i}`}
                                         className={`${isHex ? "" : (p.color ?? "bg-primary")} text-white text-xs rounded px-2 py-1 flex flex-col cursor-pointer`}
                                         style={isHex ? { backgroundColor: p.color ?? "#22c55e" } : undefined}
                                         onClick={() => setPopup({ mode: "edit", bed, seed, planting: p, segmentIndex: p.start_segment ?? i })}
                                    >
                                      <div className="flex justify-between items-center">
                                        <span>{seed?.name ?? "Onbekend"}</span>
                                        {i === p.start_segment && (
                                          <button onClick={(e) => { e.stopPropagation(); handleDeletePlanting(p.id); }}
                                                  className="ml-2 text-red-200 hover:text-red-500">✕</button>
                                        )}
                                      </div>
                                      <span className="italic text-[10px]">{getPhase(p, currentWeek)}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </DroppableSegment>
                          );
                        })}
                      </div>

                      {historyPlantings.length > 0 && (
                        <div>
                          <h6 className="text-sm font-semibold mt-2">Historie</h6>
                          <ul className="text-xs space-y-1">
                            {historyPlantings.map((p) => {
                              const seed = seedsById[p.seed_id];
                              return (
                                <li key={p.id} className="text-muted-foreground">
                                  {seed?.name ?? "Onbekend"} (geoogst tot {p.planned_harvest_end ?? p.actual_harvest_end})
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Kas */}
            {greenhouseBeds.length > 0 && (
              <div className="space-y-6">
                <h4 className="text-lg font-semibold">Kas</h4>
                {greenhouseBeds.map((bed) => {
                  const activePlantings = plantings.filter((p) => p.garden_bed_id === bed.id && isActiveInWeek(p, currentWeek));
                  const historyPlantings = plantings.filter((p) => p.garden_bed_id === bed.id && getPhase(p, currentWeek) === "afgelopen");

                  return (
                    <div key={bed.id} className="space-y-4">
                      <h5 className="font-semibold">{bed.name} ({bed.segments} segmenten)</h5>
                      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${bed.segments}, 1fr)` }}>
                        {Array.from({ length: bed.segments }, (_, i) => {
                          const covering = activePlantings.filter((p) => {
                            const start = p.start_segment ?? 0;
                            const used = p.segments_used ?? 1;
                            return i >= start && i < start + used;
                          });
                          return (
                            <DroppableSegment key={i} bed={bed} segmentIndex={i} occupied={covering.length > 0}>
                              <div className="flex flex-col gap-1 w-full px-1">
                                {covering.map((p) => {
                                  const seed = seedsById[p.seed_id];
                                  const isHex = p.color?.startsWith("#") || p.color?.startsWith("rgb");
                                  return (
                                    <div key={`${p.id}-${i}`}
                                         className={`${isHex ? "" : (p.color ?? "bg-primary")} text-white text-xs rounded px-2 py-1 flex flex-col cursor-pointer`}
                                         style={isHex ? { backgroundColor: p.color ?? "#22c55e" } : undefined}
                                         onClick={() => setPopup({ mode: "edit", bed, seed, planting: p, segmentIndex: p.start_segment ?? i })}
                                    >
                                      <div className="flex justify-between items-center">
                                        <span>{seed?.name ?? "Onbekend"}</span>
                                        {i === p.start_segment && (
                                          <button onClick={(e) => { e.stopPropagation(); handleDeletePlanting(p.id); }}
                                                  className="ml-2 text-red-200 hover:text-red-500">✕</button>
                                        )}
                                      </div>
                                      <span className="italic text-[10px]">{getPhase(p, currentWeek)}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </DroppableSegment>
                          );
                        })}
                      </div>

                      {historyPlantings.length > 0 && (
                        <div>
                          <h6 className="text-sm font-semibold mt-2">Historie</h6>
                          <ul className="text-xs space-y-1">
                            {historyPlantings.map((p) => {
                              const seed = seedsById[p.seed_id];
                              return (
                                <li key={p.id} className="text-muted-foreground">
                                  {seed?.name ?? "Onbekend"} (geoogst tot {p.planned_harvest_end ?? p.actual_harvest_end})
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DndContext>

      {/* Popup */}
      {popup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg shadow-lg w-full max-w-md space-y-4"
               onPointerDown={(e)=>e.stopPropagation()}>
            <h3 className="text-lg font-semibold">{popup.mode === "create" ? "Nieuwe planting" : "Planting bewerken"}</h3>
            <PlantingForm
              mode={popup.mode}
              seed={popup.mode === "create" ? popup.seed : popup.seed}
              bed={popup.mode === "create" ? popup.bed : popup.bed}
              defaultSegment={popup.segmentIndex}
              existing={popup.mode === "edit" ? popup.planting : undefined}
              onCancel={() => setPopup(null)}
              onConfirm={(segmentsUsed, method, date, hex, markOut) =>
                handleConfirmPlanting({
                  mode: popup.mode,
                  target: popup.mode === "create"
                    ? { seed: popup.seed, bed: popup.bed, segmentIndex: popup.segmentIndex }
                    : { seed: popup.seed, bed: popup.bed, segmentIndex: popup.segmentIndex, planting: popup.planting },
                  segmentsUsed, method, dateISO: date, hexColor: hex, markOutOfStock: markOut
                })
              }
            />
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

/* ========== PlantingForm (snelle popup) ========== */
function PlantingForm({
  mode,
  seed,
  bed,
  defaultSegment,
  existing,
  onCancel,
  onConfirm,
}: {
  mode: "create" | "edit";
  seed: Seed;
  bed: GardenBed;
  defaultSegment: number;
  existing?: Planting;
  onCancel: () => void;
  onConfirm: (segmentsUsed: number, method: "direct" | "presow", dateISO: string, hexColor: string, markOutOfStock: boolean) => void;
}) {
  const mondayOf = (d: Date) => { const x = new Date(d); x.setDate(d.getDate() - ((d.getDay()||7) - 1)); return x; };

  const [segmentsUsed, setSegmentsUsed] = useState<number>(existing?.segments_used ?? 1);
  const [method, setMethod] = useState<"direct" | "presow">(
    existing?.method ?? ((seed.sowing_type === "direct" || seed.sowing_type === "presow") ? seed.sowing_type : "direct")
  );

  // default = maandag van huidige (of bestaande) week
  const initial = existing?.planned_sow_date ?? existing?.planned_plant_date ?? toISO(mondayOf(new Date()));
  const [date, setDate] = useState<string>(initial);

  const [color, setColor] = useState<string>(() => {
    const source = existing?.color ?? seed.default_color ?? "#22c55e";
    return source.startsWith("#") || source.startsWith("rgb") ? source : "#22c55e";
  });

  const [markOut, setMarkOut] = useState<boolean>(false);

  const maxSeg = Math.max(1, bed.segments - defaultSegment);

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onConfirm(segmentsUsed, method, date, color, markOut); }}
      className="space-y-4"
    >
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
          <div className="text-sm">{seed.sowing_type === "direct" ? "Direct" : "Voorzaaien"}</div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Zaai-/Plantdatum</label>
        <input type="date" name="date" value={date} onChange={(e) => setDate(e.target.value)}
               className="border rounded-md px-2 py-1 w-full" />
        <p className="text-xs text-muted-foreground mt-1">
          Bij <strong>voorzaaien</strong> is dit de <em>zaaidatum</em> (uitplantdatum berekenen we automatisch).
        </p>
      </div>

      <ColorField
        label="Kleur in planner"
        value={color}
        onChange={setColor}
        helperText="Voer #RRGGBB of rgb(r,g,b) in. We slaan #hex op."
      />

      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={markOut} onChange={(e)=>setMarkOut(e.target.checked)} />
        Zijn de zaden nu op? (zet voorraad op “niet op voorraad”)
      </label>

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
