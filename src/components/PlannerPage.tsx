// src/components/PlannerPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { Garden, GardenBed, Planting, Seed } from "../lib/types";
import { listBeds } from "../lib/api/beds";
import { listSeeds } from "../lib/api/seeds";
import { createPlanting, listPlantings, deletePlanting, updatePlanting } from "../lib/api/plantings";
import { DndContext, useDraggable, useDroppable, DragOverlay } from "@dnd-kit/core";
import { supabase } from "../lib/supabaseClient";

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
function fmtDMY(iso?: string | null) {
  if (!iso) return "—";
  const [y,m,d] = iso.split("-");
  return `${d}-${m}-${y}`;
}
function parseISO(x?: string | null) { return x ? new Date(x) : null; }

/** Compute all planned_* from a GROUND date (keeps method/seed durations). */
function planFromGroundDate(seed: Seed, method: "direct"|"presow", groundISO: string) {
  const ground = new Date(groundISO);
  const growW = seed.grow_duration_weeks ?? 0;
  const harvestW = seed.harvest_duration_weeks ?? 0;
  const hs = toISO(addWeeks(ground, growW));
  const he = toISO(addWeeks(new Date(hs), harvestW));
  const presow = method === "presow" && seed.presow_duration_weeks
    ? toISO(addWeeks(ground, -(seed.presow_duration_weeks ?? 0)))
    : null;
  return {
    planned_date: groundISO,
    planned_presow_date: presow,
    planned_harvest_start: hs,
    planned_harvest_end: he,
  };
}

/** Recompute planned_* fields given an anchor (presow/ground/harvest_start/harvest_end). */
function computePlanFromAnchor(params: {
  method: "direct" | "presow";
  seed: Seed;
  anchorType: "presow" | "ground" | "harvest_start" | "harvest_end";
  anchorISO: string;
  prev?: Pick<Planting, "planned_date" | "planned_presow_date" | "planned_harvest_start" | "planned_harvest_end">;
}) {
  const { method, seed, anchorType, anchorISO, prev } = params;
  const presowW = seed.presow_duration_weeks ?? null;
  const growW = seed.grow_duration_weeks ?? null;
  const harvestW = seed.harvest_duration_weeks ?? null;

  let planned_date = prev?.planned_date || anchorISO;
  let planned_presow_date = prev?.planned_presow_date || null;
  let planned_harvest_start = prev?.planned_harvest_start || null;
  let planned_harvest_end = prev?.planned_harvest_end || null;

  const A = new Date(anchorISO);

  if (anchorType === "presow") {
    planned_presow_date = anchorISO;
    if (presowW != null) planned_date = toISO(addWeeks(A, presowW));
    if (growW != null) planned_harvest_start = toISO(addWeeks(new Date(planned_date), growW));
    if (harvestW != null && planned_harvest_start) planned_harvest_end = toISO(addWeeks(new Date(planned_harvest_start), harvestW));
  } else if (anchorType === "ground") {
    planned_date = anchorISO;
    if (method === "direct") planned_presow_date = null;
    else if (method === "presow" && presowW != null) planned_presow_date = toISO(addWeeks(new Date(planned_date), -presowW));
    if (growW != null) planned_harvest_start = toISO(addWeeks(new Date(planned_date), growW));
    if (harvestW != null && planned_harvest_start) planned_harvest_end = toISO(addWeeks(new Date(planned_harvest_start), harvestW));
  } else if (anchorType === "harvest_start") {
    planned_harvest_start = anchorISO;
    if (harvestW != null) planned_harvest_end = toISO(addWeeks(A, harvestW));
    if (growW != null) {
      planned_date = toISO(addWeeks(A, -growW));
      if (method === "presow" && presowW != null) planned_presow_date = toISO(addWeeks(new Date(planned_date), -presowW));
      if (method === "direct") planned_presow_date = null;
    }
  } else if (anchorType === "harvest_end") {
    planned_harvest_end = anchorISO;
    if (harvestW != null) {
      const hs = addWeeks(A, -harvestW);
      planned_harvest_start = toISO(hs);
      if (growW != null) {
        planned_date = toISO(addWeeks(hs, -growW));
        if (method === "presow" && presowW != null) planned_presow_date = toISO(addWeeks(new Date(planned_date), -presowW));
        if (method === "direct") planned_presow_date = null;
      }
    }
  }

  return { planned_date, planned_presow_date, planned_harvest_start, planned_harvest_end };
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

/* droppable cel (plattegrond) */
function MapDroppableSegment({ bed, segmentIndex }: { bed: GardenBed; segmentIndex: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `mapbed__${bed.id}__segment__${segmentIndex}` });
  return (
    <div
      ref={setNodeRef}
      className={`w-full h-full ${isOver ? "bg-green-200/50" : "bg-transparent"}`}
      style={{ transition: "background-color .12s ease" }}
    />
  );
}

/* ========== hoofdpagina ========== */
type InPlannerFilter = 'all' | 'planned' | 'unplanned';
export function PlannerPage({ garden }: { garden: Garden }) {
  const [beds, setBeds] = useState<GardenBed[]>([]);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [plantings, setPlantings] = useState<Planting[]>([]);

  // views: list | map | conflicts  (timeline verwijderd)
  const [view, setView] = useState<"list" | "map" | "conflicts">(() => {
    const open = localStorage.getItem("plannerOpenTab") as any;
    return open === "conflicts" ? "conflicts" : ((localStorage.getItem("plannerView") as any) || "list");
  });

  // UI/filters
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [q, setQ] = useState<string>(() => localStorage.getItem("plannerQ") ?? "");
  const [inStockOnly, setInStockOnly] = useState<boolean>(() => localStorage.getItem("plannerInStock") === "1");
  const [inPlanner, setInPlanner] = useState<InPlannerFilter>(() => (localStorage.getItem("plannerInPlanner") as InPlannerFilter) ?? "all");
  const [greenhouseOnly, setGreenhouseOnly] = useState<boolean>(() => localStorage.getItem("plannerGHOnly") === "1");
  const [fPresow, setFPresow] = useState<number[]>(() => JSON.parse(localStorage.getItem("plannerM_presow") ?? "[]"));
  const [fDirectPlant, setFDirectPlant] = useState<number[]>(() => JSON.parse(localStorage.getItem("plannerM_directplant") ?? "[]"));
  const [fHarvest, setFHarvest] = useState<number[]>(() => JSON.parse(localStorage.getItem("plannerM_harvest") ?? "[]"));
  const [showGhosts, setShowGhosts] = useState<boolean>(() => {
    const raw = localStorage.getItem("plannerShowGhosts");
    return raw ? raw === "1" : true; // default AAN
  });

  // highlight/focus (vanuit dashboard)
  const [focusId, setFocusId] = useState<string | null>(null);
  const [flashStamp, setFlashStamp] = useState<number | null>(null);

  // weeknavigatie
  const [currentWeek, setCurrentWeek] = useState<Date>(() => {
    const saved = localStorage.getItem("plannerWeekISO");
    if (saved) return new Date(saved);
    const now = new Date();
    const d = new Date(now);
    d.setDate(now.getDate() - ((now.getDay()||7) - 1)); // maandag
    return d;
  });

  useEffect(() => { localStorage.setItem("plannerWeekISO", toISO(currentWeek)); }, [currentWeek]);
  useEffect(() => { localStorage.setItem("plannerView", view); localStorage.removeItem("plannerOpenTab"); }, [view]);
  useEffect(() => { localStorage.setItem("plannerQ", q); }, [q]);
  useEffect(() => { localStorage.setItem("plannerInStock", inStockOnly ? "1" : "0"); }, [inStockOnly]);
  useEffect(() => { localStorage.setItem("plannerInPlanner", inPlanner); }, [inPlanner]);
  useEffect(() => { localStorage.setItem("plannerGHOnly", greenhouseOnly ? "1" : "0"); }, [greenhouseOnly]);
  useEffect(() => { localStorage.setItem("plannerM_presow", JSON.stringify(fPresow)); }, [fPresow]);
  useEffect(() => { localStorage.setItem("plannerM_directplant", JSON.stringify(fDirectPlant)); }, [fDirectPlant]);
  useEffect(() => { localStorage.setItem("plannerM_harvest", JSON.stringify(fHarvest)); }, [fHarvest]);
  useEffect(() => { localStorage.setItem("plannerShowGhosts", showGhosts ? "1" : "0"); }, [showGhosts]);

  // state voor modals
  const [popup, setPopup] = useState<
    | { mode: "create"; seed: Seed; bed: GardenBed; segmentIndex: number }
    | { mode: "edit"; planting: Planting; seed: Seed; bed: GardenBed; segmentIndex: number }
    | null
  >(null);

  // Conflictoplossing (inline modal – voor generieke, maar echte resolver zit in Conflicts-tab)
  const [resolver, setResolver] = useState<null | {
    planting: Planting;
    seed: Seed;
    proposed: { planned_date: string; planned_presow_date: string | null; planned_harvest_start: string | null; planned_harvest_end: string | null };
  }>(null);

  // dnd overlay state
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const activeSeed = useMemo(() => {
    if (!activeDragId) return null;
    const id = activeDragId.replace("seed-", "");
    return seeds.find(s => s.id === id) || null;
  }, [activeDragId, seeds]);

  // data laden
  async function reload() {
    const [b, s, p] = await Promise.all([listBeds(garden.id), listSeeds(garden.id), listPlantings(garden.id)]);
    setBeds(b); setSeeds(s); setPlantings(p);
  }
  useEffect(() => { reload().catch(console.error); }, [garden.id]);

  // realtime
  useEffect(() => {
    const channel = supabase
      .channel('realtime-plantings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plantings', filter: `garden_id=eq.${garden.id}` }, () => {
        reload().catch(() => {});
      })
      .subscribe();
    return () => { try { supabase.removeChannel(channel); } catch {} };
  }, [garden.id]);

  // focus vanuit dashboard
  useEffect(() => {
    const need = localStorage.getItem("plannerNeedsAttention") === "1";
    const id = localStorage.getItem("plannerConflictFocusId");
    const at = localStorage.getItem("plannerFlashAt");
    if (need && id) {
      setView("conflicts");
      setFocusId(id);
      setFlashStamp(at ? Number(at) : Date.now());
      try {
        localStorage.removeItem("plannerNeedsAttention");
      } catch {}
    }
  }, []);

  // sort bedden
  const outdoorBeds = useMemo(() => beds.filter(b => !b.is_greenhouse)
    .sort((a,b)=>(a.sort_order??0)-(b.sort_order??0) || a.created_at.localeCompare(b.created_at)), [beds]);
  const greenhouseBeds = useMemo(() => beds.filter(b => b.is_greenhouse)
    .sort((a,b)=>(a.sort_order??0)-(b.sort_order??0) || a.created_at.localeCompare(b.created_at)), [beds]);

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

  /* ====== detectie: pending herberekening uit actual_* ====== */
  type PendingRecalc = {
    planting: Planting;      // de bron (met actual_*)
    seed: Seed;
    proposed: { planned_date: string; planned_presow_date: string | null; planned_harvest_start: string | null; planned_harvest_end: string | null };
    conflicts: string[];     // planting.id’s die botsen met de voorgestelde bronplanning
  };

  function chooseAnchorFor(p: Planting): null | { type: "presow"|"ground"|"harvest_start"|"harvest_end"; iso: string } {
    if (p.actual_harvest_end)   return { type: "harvest_end", iso: p.actual_harvest_end };
    if (p.actual_harvest_start) return { type: "harvest_start", iso: p.actual_harvest_start };
    if (p.method === "presow" && p.actual_presow_date) return { type: "presow", iso: p.actual_presow_date };
    if (p.actual_ground_date)   return { type: "ground", iso: p.actual_ground_date };
    return null;
  }

  function differsFromCurrent(p: Planting, proposed: PendingRecalc["proposed"]) {
    return (
      (proposed.planned_date && proposed.planned_date !== p.planned_date) ||
      (proposed.planned_presow_date ?? null) !== (p.planned_presow_date ?? null) ||
      (proposed.planned_harvest_start ?? null) !== (p.planned_harvest_start ?? null) ||
      (proposed.planned_harvest_end ?? null) !== (p.planned_harvest_end ?? null)
    );
  }

  // overlap (met optionele “virtuele” blokkers)
  function wouldOverlapWithExtras(
    bed: GardenBed, startSeg: number, segUsed: number, startDate: Date, endDate: Date,
    ignorePlantingId?: string,
    extras?: Array<{ bed_id: string; startSeg: number; segUsed: number; start: Date; end: Date }>
  ) {
    const aStart = startDate, aEnd = endDate;
    const aSegStart = startSeg, aSegEnd = startSeg + segUsed - 1;
    // tegen bestaande plantings
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
    // tegen extra “virtuele” blokkers
    if (extras) {
      for (const ex of extras) {
        if (ex.bed_id !== bed.id) continue;
        const timeOverlap = (aStart <= ex.end) && (ex.start <= aEnd);
        if (!timeOverlap) continue;
        const segOverlap = (aSegStart <= (ex.startSeg + ex.segUsed - 1)) && (ex.startSeg <= aSegEnd);
        if (segOverlap) return true;
      }
    }
    return false;
  }

  const pendingRecalcs = useMemo<PendingRecalc[]>(() => {
    const list: PendingRecalc[] = [];
    for (const p of plantings) {
      const seed = seedsById[p.seed_id]; if (!seed) continue;
      const anchor = chooseAnchorFor(p);
      if (!anchor) continue;
      const proposed = computePlanFromAnchor({
        method: (p.method as "direct"|"presow") ?? "direct",
        seed,
        anchorType: anchor.type,
        anchorISO: anchor.iso,
        prev: {
          planned_date: p.planned_date,
          planned_presow_date: p.planned_presow_date,
          planned_harvest_start: p.planned_harvest_start,
          planned_harvest_end: p.planned_harvest_end,
        },
      });

      if (!differsFromCurrent(p, proposed)) continue;

      // check conflicts als we dit zouden toepassen
      const start    = new Date(proposed.planned_date);
      const end      = new Date(proposed.planned_harvest_end ?? proposed.planned_date);
      const startSeg = p.start_segment ?? 0;
      const segUsed  = p.segments_used ?? 1;

      const conflictsWith: string[] = [];
      for (const q of plantings) {
        if (q.id === p.id) continue;
        if (q.garden_bed_id !== p.garden_bed_id) continue;
        const bStart = new Date(q.planned_date ?? "");
        const bEnd   = new Date(q.planned_harvest_end ?? "");
        if (isNaN(bStart.getTime()) || isNaN(bEnd.getTime())) continue;

        const timeOverlap = (start <= bEnd) && (bStart <= end);
        if (!timeOverlap) continue;

        const ps = q.start_segment ?? 0;
        const pe = (q.start_segment ?? 0) + (q.segments_used ?? 1) - 1;
        const aSegStart = startSeg, aSegEnd = startSeg + segUsed - 1;
        const segOverlap = (aSegStart <= pe) && (ps <= aSegEnd);
        if (segOverlap) conflictsWith.push(q.id);
      }

      list.push({ planting: p, seed, proposed, conflicts: conflictsWith });
    }
    return list;
  }, [plantings, seedsById, beds]);

  const pendingCount = pendingRecalcs.length;
  const conflictsGroups = pendingRecalcs.filter(x => x.conflicts.length > 0);
  const conflictsCount = conflictsGroups.reduce((acc, pr) => acc + pr.conflicts.length, 0);

  /* ====== oplossers (algemeen) ====== */

  // zoek eerstvolgende vrije startdatum (per 1 week) o.b.v. evt. extra blokkers
  function findNextFreeStartDateEx(
    bed: GardenBed, startSeg: number, segUsed: number, startDate: Date, endDate: Date,
    extras?: Array<{ bed_id: string; startSeg: number; segUsed: number; start: Date; end: Date }>,
    maxWeeks = 52
  ) {
    let s = new Date(startDate);
    let e = new Date(endDate);
    for (let i = 0; i < maxWeeks; i++) {
      if (!wouldOverlapWithExtras(bed, startSeg, segUsed, s, e, undefined, extras)) return { start: s, end: e };
      s = addWeeks(s, 1);
      e = addWeeks(e, 1);
    }
    return null;
  }

  // alternatieve segmenten bij zelfde periode
  function findAlternateSegmentEx(
    bed: GardenBed, segUsed: number, startDate: Date, endDate: Date,
    extras?: Array<{ bed_id: string; startSeg: number; segUsed: number; start: Date; end: Date }>
  ) {
    const maxStart = Math.max(0, (bed.segments ?? 1) - segUsed);
    for (let startSeg = 0; startSeg <= maxStart; startSeg++) {
      if (!wouldOverlapWithExtras(bed, startSeg, segUsed, startDate, endDate, undefined, extras)) return startSeg;
    }
    return null;
  }

  async function applyProposed(pr: PendingRecalc) {
    // alleen mogelijk wanneer conflicts == 0
    if (pr.conflicts.length > 0) {
      setToast({ message: "Los eerst de conflicten op.", type: "error" });
      return;
    }
    try {
      await updatePlanting(pr.planting.id, { ...pr.proposed } as any);
      await reload();
      setToast({ message: "Voorgestelde planning toegepast.", type: "success" });
    } catch (e: any) {
      setToast({ message: "Kon planning niet toepassen: " + (e?.message ?? e), type: "error" });
    }
  }

  /* ====== resolvers gericht op het LATERE gewas ====== */
  function extrasFor(pr: PendingRecalc) {
    const p = pr.planting;
    const bed = beds.find(b => b.id === p.garden_bed_id)!;
    const startSeg = p.start_segment ?? 0;
    const segUsed  = p.segments_used ?? 1;
    const s = new Date(pr.proposed.planned_date);
    const e = new Date(pr.proposed.planned_harvest_end ?? pr.proposed.planned_date);
    return [{ bed_id: bed.id, startSeg, segUsed, start: s, end: e }];
  }

  async function shiftTargetForward(pr: PendingRecalc, targetId: string) {
    const target = plantings.find(x => x.id === targetId);
    if (!target) return;
    const bed = beds.find(b => b.id === target.garden_bed_id)!;
    const seed = seedsById[target.seed_id]!;
    const method = (target.method as "direct"|"presow") ?? "direct";

    const start = new Date(target.planned_date ?? toISO(new Date()));
    const plan = planFromGroundDate(seed, method, toISO(start));
    const s = new Date(plan.planned_date);
    const e = new Date(plan.planned_harvest_end ?? plan.planned_date);

    const slot = findNextFreeStartDateEx(bed, target.start_segment ?? 0, target.segments_used ?? 1, s, e, extrasFor(pr));
    if (!slot) {
      setToast({ message: "Geen vrije week gevonden binnen 52 weken voor dit gewas.", type: "error" });
      return;
    }
    try {
      const newPlan = planFromGroundDate(seed, method, toISO(slot.start));
      await updatePlanting(target.id, {
        planned_date: newPlan.planned_date,
        planned_presow_date: newPlan.planned_presow_date,
        planned_harvest_start: newPlan.planned_harvest_start,
        planned_harvest_end: newPlan.planned_harvest_end,
      } as any);
      await reload();
      setToast({ message: "Gewas verschoven naar eerstvolgende vrije week.", type: "success" });
    } catch (e: any) {
      setToast({ message: "Kon gewas niet verschuiven: " + (e?.message ?? e), type: "error" });
    }
  }

  async function tryTargetOtherSegments(pr: PendingRecalc, targetId: string) {
    const target = plantings.find(x => x.id === targetId);
    if (!target) return;
    const bed = beds.find(b => b.id === target.garden_bed_id)!;

    const s = new Date(target.planned_date ?? "");
    const e = new Date(target.planned_harvest_end ?? "");
    if (isNaN(s.getTime()) || isNaN(e.getTime())) {
      setToast({ message: "Doeldatums ontbreken; verschuif in de tijd of vul eerst de planning aan.", type: "error" });
      return;
    }

    const alt = findAlternateSegmentEx(bed, target.segments_used ?? 1, s, e, extrasFor(pr));
    if (alt == null) {
      setToast({ message: "Geen vrij segmentblok voor deze periode.", type: "error" });
      return;
    }
    try {
      await updatePlanting(target.id, { start_segment: alt } as any);
      await reload();
      setToast({ message: "Segmenten aangepast.", type: "success" });
    } catch (e: any) {
      setToast({ message: "Kon segmenten niet aanpassen: " + (e?.message ?? e), type: "error" });
    }
  }

  async function moveTargetToBed(pr: PendingRecalc, targetId: string, destBedId: string) {
    const target = plantings.find(x => x.id === targetId);
    if (!target) return;
    const dest = beds.find(b => b.id === destBedId);
    if (!dest) return;

    const s = new Date(target.planned_date ?? "");
    const e = new Date(target.planned_harvest_end ?? "");
    if (isNaN(s.getTime()) || isNaN(e.getTime())) {
      setToast({ message: "Doeldatums ontbreken; verschuif in de tijd of vul eerst de planning aan.", type: "error" });
      return;
    }

    // 1) probeer zelfde datums, andere segmenten in dest
    let newStartSeg = findAlternateSegmentEx(dest, target.segments_used ?? 1, s, e, extrasFor(pr));
    let newDates: { start: Date; end: Date } | null = null;

    // 2) anders zoek eerstvolgende vrije week in dest
    if (newStartSeg == null) {
      const slot = findNextFreeStartDateEx(dest, 0, target.segments_used ?? 1, s, e, extrasFor(pr));
      if (!slot) {
        setToast({ message: "Geen plekje gevonden in de gekozen bak.", type: "error" });
        return;
      }
      newDates = slot;
      newStartSeg = 0;
    }

    try {
      const seed = seedsById[target.seed_id]!;
      const method = (target.method as "direct"|"presow") ?? "direct";
      const groundISO = newDates ? toISO(newDates.start) : toISO(s);
      const newPlan = planFromGroundDate(seed, method, groundISO);

      await updatePlanting(target.id, {
        garden_bed_id: dest.id,
        start_segment: newStartSeg,
        planned_date: newPlan.planned_date,
        planned_presow_date: newPlan.planned_presow_date,
        planned_harvest_start: newPlan.planned_harvest_start,
        planned_harvest_end: newPlan.planned_harvest_end,
      } as any);
      await reload();
      setToast({ message: "Gewas verplaatst.", type: "success" });
    } catch (e: any) {
      setToast({ message: "Kon niet verplaatsen: " + (e?.message ?? e), type: "error" });
    }
  }

  /* ====== conflictdetectie bestaande planning (visueel) ====== */
  const conflictsExisting = useMemo(() => {
    const list: Array<{plantingId: string; withIds: string[]}> = [];
    for (let i = 0; i < plantings.length; i++) {
      const p1 = plantings[i];
      const withIds: string[] = [];
      for (let j = i + 1; j < plantings.length; j++) {
        const p2 = plantings[j];
        if (p1.garden_bed_id !== p2.garden_bed_id) continue;
        const p1Start = new Date(p1.planned_date ?? "");
        const p1End   = new Date(p1.planned_harvest_end ?? "");
        const p2Start = new Date(p2.planned_date ?? "");
        const p2End   = new Date(p2.planned_harvest_end ?? "");
        if ([p1Start,p1End,p2Start,p2End].some(d=>isNaN(d.getTime()))) continue;
        const timeOverlap = (p1Start <= p2End) && (p2Start <= p1End);
        if (!timeOverlap) continue;
        const p1s = p1.start_segment ?? 0, p1e = p1s + (p1.segments_used ?? 1) - 1;
        const p2s = p2.start_segment ?? 0, p2e = p2s + (p2.segments_used ?? 1) - 1;
        const segOverlap = (p1s <= p2e) && (p2s <= p1e);
        if (segOverlap) withIds.push(p2.id);
      }
      if (withIds.length) list.push({ plantingId: p1.id, withIds });
    }
    return list;
  }, [plantings]);

  /* ====== DND ====== */
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
      if (!bed) return;
      if (bed.is_greenhouse && !seed.greenhouse_compatible) {
        setToast({ message: "Dit zaad is niet geschikt voor de kas.", type: "error" });
        return;
      }
      setPopup({ mode: "create", seed, bed, segmentIndex: segIdx });
    }
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

    const plantDate = new Date(dateISO);
    const harvestStart = addWeeks(plantDate, seed.grow_duration_weeks!);
    const harvestEnd   = addWeeks(harvestStart, seed.harvest_duration_weeks!);

    const segUsedClamped = clamp(segmentsUsed, 1, bed.segments - segmentIndex);
    const overlap = wouldOverlapWithExtras(bed, segmentIndex, segUsedClamped, plantDate, harvestEnd);
    if (overlap) {
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

      await reload();
      setPopup(null);
      setToast({ message: mode === "create" ? "Planting toegevoegd." : "Planting bijgewerkt.", type: "success" });
    } catch (e: any) {
      setToast({ message: "Kon planting niet opslaan: " + (e?.message ?? e), type: "error" });
    }
  }

  /* ====== header + tabs ====== */
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

  const HeaderBar = (
    <div className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
      {/* Badge: pending recalcs / conflicts */}
      {(pendingCount > 0) && (
        <div className={`${conflictsCount > 0 ? "bg-red-50 border-red-200 text-red-800" : "bg-amber-50 border-amber-200 text-amber-800"} px-4 py-2 border-b text-sm`}>
          {conflictsCount > 0 ? <>⚠️ {conflictsCount} conflict{conflictsCount>1?"en":""} om op te lossen.</> : <>🕒 {pendingCount} herberekening{pendingCount>1?"en":""} te verwerken.</>}
        </div>
      )}

      <div className="py-2.5 flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          Planner
          {(pendingCount > 0) && (
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${conflictsCount>0 ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
              {conflictsCount>0 ? "Actie vereist" : "Te verwerken"} • {conflictsCount>0 ? conflictsCount : pendingCount}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2 text-sm">
          <button onClick={prevWeek} className="px-2 py-1 border rounded">← Vorige week</button>
          <span className="font-medium whitespace-nowrap px-2 py-1 rounded">{formatWeek(currentWeek)}</span>
          <button onClick={nextWeek} className="px-2 py-1 border rounded">Volgende week →</button>
          <button onClick={goToToday} className="px-2 py-1 border rounded">Vandaag</button>
        </div>
      </div>

      {/* tabs */}
      <div className="flex items-center gap-3 pb-2">
        {[
          { k: "list", label: "Lijstweergave" },
          { k: "map",  label: "Plattegrond"   },
          { k: "conflicts", label: `Conflicten${conflictsCount>0?` (${conflictsCount})`:""}` },
        ].map(t => {
          const active = view === (t.k as any);
          const danger = t.k === "conflicts" && conflictsCount > 0;
          return (
            <button key={t.k}
              onClick={() => setView(t.k as any)}
              className={[
                "px-3 py-1.5 text-sm rounded-md border transition",
                active ? (danger ? "bg-red-600 text-white border-red-600" : "bg-primary text-primary-foreground")
                       : (danger ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                                 : "bg-card text-muted-foreground hover:text-foreground")
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

  /* ====== hulpfuncties voor week-actief, met seed fallback ====== */
  function plannedRange(p: Planting) {
    const seed = seedsById[p.seed_id];
    let start = parseISO(p.planned_date) ?? parseISO(p.actual_ground_date) ?? null;
    // fallback: als geen start, probeer via harvest_start - grow
    if (!start && seed?.grow_duration_weeks && p.planned_harvest_start) {
      start = addWeeks(new Date(p.planned_harvest_start), -(seed.grow_duration_weeks));
    }
    if (!start) return null;

    let end = parseISO(p.planned_harvest_end) ?? null;
    if (!end && seed?.grow_duration_weeks && seed?.harvest_duration_weeks) {
      const hs = addWeeks(new Date(start), seed.grow_duration_weeks);
      end = addWeeks(hs, seed.harvest_duration_weeks);
    }
    // als nog steeds niks, neem 1 dag window
    if (!end) end = new Date(start);
    return { start, end };
  }

  function isActiveInWeek(p: Planting, week: Date) {
    const rng = plannedRange(p); if (!rng) return false;
    const monday = new Date(week);
    const sunday = addDays(monday, 6);
    return rng.start <= sunday && rng.end >= monday;
  }
  function isFutureRelativeToWeek(p: Planting, week: Date) {
    const rng = plannedRange(p); if (!rng) return false;
    const monday = new Date(week);
    const sunday = addDays(monday, 6);
    return rng.start > sunday;
  }

  /* ====== LIST Card ====== */
  function BedCard({
    bed, seedsById, plantings, currentWeek, showGhosts, onDeletePlanting, onClickPlanting,
    conflicts, pendingsById, focusId, flashStamp,
  }: {
    bed: GardenBed;
    seedsById: Record<string, Seed>;
    plantings: Planting[];
    currentWeek: Date;
    showGhosts: boolean;
    onDeletePlanting: (id: string) => void;
    onClickPlanting: (p: Planting, seed: Seed, startSegFallback: number) => void;
    conflicts: Array<{plantingId: string; conflictsWith: string[]}>;
    pendingsById: Set<string>;
    focusId: string | null;
    flashStamp: number | null;
  }) {
    const activePlantings = plantings.filter((p) => p.garden_bed_id === bed.id && isActiveInWeek(p, currentWeek));
    const futurePlantings = showGhosts ? plantings.filter((p) => p.garden_bed_id === bed.id && !isActiveInWeek(p, currentWeek) && isFutureRelativeToWeek(p, currentWeek)) : [];

    const segmentIsFreeNow = (idx: number) =>
      !activePlantings.some(p => {
        const s = p.start_segment ?? 0;
        const e = s + (p.segments_used ?? 1) - 1;
        return idx >= s && idx <= e;
      });

    return (
      <div className="p-2.5 border rounded-xl bg-card shadow-sm hover:shadow-md transition">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <h5 className="font-semibold text-sm">{bed.name}</h5>
            {pendingsById.size > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">⚠️ pending</span>
            )}
          </div>
          {bed.is_greenhouse && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-600 text-white">Kas</span>}
        </div>

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
                    const hasPending = pendingsById.has(p.id);
                    const isConflict = conflicts.some(c => c.plantingId === p.id);
                    const isFocus = focusId === p.id && flashStamp;
                    return (
                      <div
                        key={`${p.id}-${i}`}
                        className={[
                          "text-white text-[11px] rounded px-2 py-1 flex items-center justify-between gap-2 cursor-pointer",
                          isConflict ? 'ring-2 ring-red-400' : '',
                          isFocus ? 'ring-2 ring-amber-400 animate-pulse' : '',
                        ].join(' ')}
                        style={{ background: isHex ? (p.color ?? "#22c55e") : undefined }}
                        onClick={() => seed && onClickPlanting(p, seed, p.start_segment ?? i)}
                        title={hasPending ? "Herberekening beschikbaar" : undefined}
                      >
                        <span className="truncate">
                          {seed?.name ?? "Onbekend"}
                          {isConflict && " ⚠️"}
                          {hasPending && " • ⟳"}
                        </span>
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

  /* ====== MAP subview ====== */
  function PlannerMap({
    beds, seedsById, plantings, currentWeek, showGhosts, conflicts, pendingsById, focusId, flashStamp,
  }: {
    beds: GardenBed[]; seedsById: Record<string, Seed>; plantings: Planting[]; currentWeek: Date;
    showGhosts: boolean; conflicts: Array<{plantingId: string; conflictsWith: string[]}>; pendingsById: Set<string>;
    focusId: string | null; flashStamp: number | null;
  }) {
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const CANVAS_W = 2400, CANVAS_H = 1400;
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

    const _isActiveInWeek = (p: Planting) => isActiveInWeek(p, currentWeek);
    const _isFuture = (p: Planting) => isFutureRelativeToWeek(p, currentWeek);

    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Plattegrond</h3>
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-1 border rounded-md px-2 py-1 bg-secondary hover:bg-secondary/80" onClick={() => setZoomClamped(zoom - 0.1)} title="Uitzoomen">-</button>
            <input type="range" min={minZoom} max={maxZoom} step={0.05} value={zoom} onChange={(e) => setZoomClamped(parseFloat(e.target.value))} className="w-40" />
            <button className="inline-flex items-center gap-1 border rounded-md px-2 py-1 bg-secondary hover:bg-secondary/80" onClick={() => setZoomClamped(zoom + 0.1)} title="Inzoomen">+</button>
            <button className="inline-flex items-center gap-1 border rounded-md px-2 py-1" onClick={() => setZoomClamped(1)} title="100%">100%</button>
            <button className="inline-flex items-center gap-1 border rounded-md px-2 py-1" onClick={fitToViewport} title="Passend maken">Fit</button>
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
                const w = Math.max(60, Math.round(bed.length_cm || 200));
                const h = Math.max(36, Math.round(bed.width_cm  || 100));
                const x = bed.location_x ?? 20;
                const y = bed.location_y ?? 20;

                const HEADER_H = 28;
                const innerW   = w;
                const innerH   = Math.max(1, h - HEADER_H);

                const segCount = Math.max(1, bed.segments);
                const vertical = innerW >= innerH;
                const segW = vertical ? innerW / segCount : innerW;
                const segH = vertical ? innerH : innerH / segCount;

                const active = plantings.filter(p => p.garden_bed_id === bed.id && _isActiveInWeek(p));
                const future = showGhosts ? plantings.filter(p => p.garden_bed_id === bed.id && !_isActiveInWeek(p) && _isFuture(p)) : [];

                const segmentFreeNow = (rs: number, len: number) => {
                  const re = rs + len - 1;
                  return !active.some(p => {
                    const ps = p.start_segment ?? 0, pe = ps + (p.segments_used ?? 1) - 1;
                    return rs <= pe && ps <= re;
                  });
                };

                return (
                  <div
                    key={bed.id}
                    className={`absolute rounded-lg shadow-sm border select-none ${bed.is_greenhouse ? "border-green-600/60 bg-green-50" : "bg-white"}`}
                    style={{ left: x, top: y, width: w, height: h }}
                  >
                    <div className="flex items-center justify-between px-2 py-1 border-b bg-muted/50 rounded-t-lg" style={{ height: HEADER_H }}>
                      <span className="text-xs font-medium truncate">{bed.name}</span>
                      {bed.is_greenhouse && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-600 text-white">Kas</span>}
                    </div>

                    <div className="relative w-full" style={{ height: innerH }}>
                      <div
                        className="absolute inset-0 grid"
                        style={{
                          gridTemplateColumns: vertical ? `repeat(${segCount}, 1fr)` : '1fr',
                          gridTemplateRows:    vertical ? '1fr' : `repeat(${segCount}, 1fr)`,
                        }}
                      >
                        {Array.from({ length: segCount }, (_, i) => (
                          <div key={i} className="relative">
                            <MapDroppableSegment bed={bed} segmentIndex={i} />
                            <div className="absolute inset-0 pointer-events-none border border-dashed border-black/10" />
                          </div>
                        ))}
                      </div>

                      <div className="absolute inset-0">
                        {active.map((p) => {
                          const seed = seedsById[p.seed_id];
                          const start = p.start_segment ?? 0;
                          const used = Math.max(1, p.segments_used ?? 1);
                          const isHex = p.color?.startsWith("#") || p.color?.startsWith("rgb");
                          const inset = 1;

                          const style = vertical
                            ? { top: inset, height: Math.max(1, innerH - inset * 2), left: inset + start * segW, width: Math.max(1, used * segW - inset * 2) }
                            : { left: inset, width: Math.max(1, innerW - inset * 2), top: inset + start * segH, height: Math.max(1, used * segH - inset * 2) };

                          const hasPending = pendingRecalcs.some(x => x.planting.id === p.id);
                          const isFocus = focusId === p.id && flashStamp;

                          return (
                            <div
                              key={p.id}
                              className={`absolute rounded text-white text-[10px] px-1 flex items-center ${conflictsExisting.some(c => c.plantingId === p.id) ? 'ring-2 ring-red-500 ring-offset-1' : ''} ${isFocus ? 'ring-2 ring-amber-400 animate-pulse' : ''}`}
                              style={{
                                ...style,
                                backgroundColor: isHex ? (p.color ?? "#22c55e") : undefined,
                                outline: conflictsExisting.some(c => c.plantingId === p.id) ? "2px solid rgba(239, 68, 68, 0.8)" : "1px solid rgba(0,0,0,.06)",
                              }}
                              title={`${seed?.name ?? "Onbekend"}${conflictsExisting.some(c => c.plantingId === p.id) ? " ⚠️ CONFLICT" : ""}`}
                            >
                              {!isHex && <div className={`${p.color ?? "bg-primary"} absolute inset-0 rounded -z-10`} />}
                              <span className="truncate">{seed?.name ?? "—"}</span>
                              {conflictsExisting.some(c => c.plantingId === p.id) && <span className="ml-1">⚠️</span>}
                              {hasPending && <span className="ml-1">⟳</span>}
                            </div>
                          );
                        })}
                      </div>

                      {future.length > 0 && (
                        <div className="absolute inset-0 pointer-events-none">
                          {future.map((p) => {
                            const seed = seedsById[p.seed_id];
                            if (!seed) return null;
                            const start = p.start_segment ?? 0;
                            const used = Math.max(1, p.segments_used ?? 1);
                            if (!segmentFreeNow(start, used)) return null;

                            const inset = 1;
                            const style = vertical
                              ? { top: inset, height: Math.max(1, innerH - inset * 2), left: inset + start * segW, width: Math.max(1, used * segW - inset * 2) }
                              : { left: inset, width: Math.max(1, innerW - inset * 2), top: inset + start * segH, height: Math.max(1, used * segH - inset * 2) };

                            const isHex = p.color?.startsWith("#") || p.color?.startsWith("rgb");
                            const bg = isHex ? (p.color ?? "rgba(34,197,94,.35)") : "rgba(34,197,94,.35)";

                            return (
                              <div
                                key={`ghost-${p.id}`}
                                className="absolute rounded text-white text-[10px] px-1 flex items-center"
                                style={{ ...style, backgroundColor: bg, opacity: 0.35, border: "1px dashed rgba(0,0,0,.45)" }}
                                title={seed.name}
                              >
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

  /* ====== Conflicts tab ====== */
  function ConflictsTab() {
    if (conflictsGroups.length === 0 && pendingRecalcs.length === 0) {
      return <p className="text-sm text-muted-foreground">Geen herberekeningen of conflicten. 🎉</p>;
    }
    if (conflictsGroups.length === 0) {
      return (
        <section className="border rounded-lg p-3 bg-amber-50/40 border-amber-200">
          <div className="font-semibold mb-2 text-amber-900">Te verwerken herberekeningen</div>
          <p className="text-sm text-muted-foreground">Er zijn herberekeningen zonder conflicts. Klik “Pas voorgestelde planning toe” in de kaartjes hieronder.</p>
          {pendingRecalcs.map(pr => (
            <div key={pr.planting.id} className="mt-2 border rounded-md bg-white p-3">
              <div className="text-sm font-medium">
                {seedsById[pr.planting.seed_id]?.name ?? "Onbekend"} • {beds.find(b=>b.id===pr.planting.garden_bed_id)?.name ?? "—"}
              </div>
              <div className="text-xs text-muted-foreground">
                Plant: {fmtDMY(pr.planting.planned_date)} → <span className="font-medium text-amber-900">{fmtDMY(pr.proposed.planned_date)}</span> •
                Oogst: {fmtDMY(pr.planting.planned_harvest_start)}–{fmtDMY(pr.planting.planned_harvest_end)} → <span className="font-medium text-amber-900">{fmtDMY(pr.proposed.planned_harvest_start)}–{fmtDMY(pr.proposed.planned_harvest_end)}</span>
              </div>
              <div className="mt-2">
                <button className="px-2.5 py-1 rounded-md bg-amber-600 text-white text-sm" onClick={()=>applyProposed(pr)}>Pas voorgestelde planning toe</button>
              </div>
            </div>
          ))}
        </section>
      );
    }

    return (
      <div className="space-y-3">
        {conflictsGroups.map((pr) => {
          const src = pr.planting;
          const srcSeed = seedsById[src.seed_id];
          const bed = beds.find(b => b.id === src.garden_bed_id)!;

          // impacted “latere” gewassen (prioriteit aan items die ná de bron starten)
          const impacted = pr.conflicts
            .map(id => plantings.find(p => p.id === id)!)
            .filter(Boolean)
            .sort((a,b) => (a.planned_date ?? "").localeCompare(b.planned_date ?? ""));

          const later = impacted.filter(x => (x.planned_date ?? "") >= (pr.proposed.planned_date ?? ""));
          const earlierButOverlapping = impacted.filter(x => !later.includes(x)); // zeldzaam

          return (
            <section key={src.id} className="border rounded-lg overflow-hidden">
              {/* bron header */}
              <div className="px-3 py-2 bg-red-50 border-b border-red-200">
                <div className="text-sm">
                  <span className="font-semibold">{srcSeed?.name ?? "Onbekend"}</span> • {bed?.name ?? "—"} • <span className="text-red-700">vergrendeld (actual datum)</span>
                </div>
                <div className="text-xs text-red-800">
                  Voorstel: {fmtDMY(pr.proposed.planned_date)} → {fmtDMY(pr.proposed.planned_harvest_end)} — botst met {impacted.length} gewas{impacted.length>1?"sen":""}.
                </div>
              </div>

              {/* impacted lijst */}
              <div className="p-3 space-y-3 bg-card">
                {later.map(t => {
                  const s = seedsById[t.seed_id];
                  const b = beds.find(x => x.id === t.garden_bed_id);
                  return (
                    <div key={t.id} className="border rounded-md bg-white p-3">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{s?.name ?? "Onbekend"} <span className="text-muted-foreground">• {b?.name ?? "—"}</span></div>
                          <div className="text-xs text-muted-foreground">
                            Gepland: {fmtDMY(t.planned_date)} → {fmtDMY(t.planned_harvest_end)} • Segmenten {((t.start_segment ?? 0)+1)}–{((t.start_segment ?? 0)+(t.segments_used ?? 1))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button className="px-2 py-1 text-xs rounded bg-primary text-primary-foreground"
                                  onClick={()=>shiftTargetForward(pr, t.id)}>Schuif naar vrije week</button>
                          <button className="px-2 py-1 text-xs rounded border"
                                  onClick={()=>tryTargetOtherSegments(pr, t.id)}>Zoek andere segmenten</button>
                          <div className="relative">
                            <select
                              className="px-2 py-1 text-xs border rounded"
                              onChange={e => { if (e.target.value) moveTargetToBed(pr, t.id, e.target.value); }}
                              defaultValue=""
                              title="Verplaats naar andere bak"
                            >
                              <option value="" disabled>Verplaats naar…</option>
                              {beds
                                .filter(x => x.id !== t.garden_bed_id && (!!x.is_greenhouse === !!b?.is_greenhouse))
                                .map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {earlierButOverlapping.length > 0 && (
                  <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                    Opmerking: {earlierButOverlapping.length} gewas{earlierButOverlapping.length>1?"sen":""} begint eerder dan de bron; hiervoor werkt “Schuif naar vrije week” mogelijk minder goed. Probeer <strong>Andere segmenten</strong> of verplaats naar een andere bak.
                  </div>
                )}

                {/* Stap 2: pas de bron toe zodra alles vrij is */}
                <div className="pt-2 border-t">
                  {(() => {
                    // Herbereken op basis van actuele state of er nog overlap is
                    const stillConflicting = (() => {
                      const start = new Date(pr.proposed.planned_date);
                      const end   = new Date(pr.proposed.planned_harvest_end ?? pr.proposed.planned_date);
                      const segStart = src.start_segment ?? 0;
                      const segUsed  = src.segments_used ?? 1;
                      return plantings.some(q => {
                        if (q.id === src.id || q.garden_bed_id !== src.garden_bed_id) return false;
                        const bStart = new Date(q.planned_date ?? "");
                        const bEnd   = new Date(q.planned_harvest_end ?? "");
                        if ([bStart,bEnd].some(d=>isNaN(d.getTime()))) return false;
                        const timeOverlap = (start <= bEnd) && (bStart <= end);
                        if (!timeOverlap) return false;
                        const qs = q.start_segment ?? 0, qe = qs + (q.segments_used ?? 1) - 1;
                        return (segStart <= qe) && (qs <= (segStart + segUsed - 1));
                      });
                    })();

                    return stillConflicting ? (
                      <div className="text-sm text-red-700">Los eerst alle conflicten hierboven op.</div>
                    ) : (
                      <button className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm"
                              onClick={() => applyProposed(pr)}>
                        Pas voorgestelde planning toe
                      </button>
                    );
                  })()}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  /* ====== render ====== */

  // pending set per bed
  const pendingIds = new Set(pendingRecalcs.map(x => x.planting.id));

  return (
    <div className="space-y-6">
      {HeaderBar}

      <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {view === "conflicts" ? (
          <ConflictsTab />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            {/* Sidebar */}
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

                    {/* maandfilters */}
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
                            conflicts={conflictsExisting.map(c=>({plantingId: c.plantingId, conflictsWith: c.withIds}))}
                            pendingsById={new Set(pendingRecalcs.filter(x=>x.planting.garden_bed_id===bed.id).map(x=>x.planting.id))}
                            focusId={focusId}
                            flashStamp={flashStamp}
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
                            conflicts={conflictsExisting.map(c=>({plantingId: c.plantingId, conflictsWith: c.withIds}))}
                            pendingsById={new Set(pendingRecalcs.filter(x=>x.planting.garden_bed_id===bed.id).map(x=>x.planting.id))}
                            focusId={focusId}
                            flashStamp={flashStamp}
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
                  conflicts={conflictsExisting.map(c=>({plantingId: c.plantingId, conflictsWith: c.withIds}))}
                  pendingsById={pendingIds}
                  focusId={focusId}
                  flashStamp={flashStamp}
                />
              )}
            </div>
          </div>
        )}

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

      {/* Popup: create/edit planting */}
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

      {/* Modal: eenvoudige Conflictoplosser (fallback) */}
      {resolver && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={()=>setResolver(null)}>
          <div className="bg-card w-full max-w-lg rounded-lg shadow-lg p-5 space-y-4" onClick={(e)=>e.stopPropagation()}>
            <h4 className="text-lg font-semibold">Conflictoplossing</h4>
            <p className="text-sm">
              <span className="font-medium">{seedsById[resolver.planting.seed_id]?.name ?? "—"}</span> •
              {" "}huidig: {fmtDMY(resolver.planting.planned_date)}→{fmtDMY(resolver.planting.planned_harvest_end)} •
              {" "}voorgesteld: <span className="font-medium">{fmtDMY(resolver.proposed.planned_date)}→{fmtDMY(resolver.proposed.planned_harvest_end)}</span>
            </p>
            <div className="space-y-3">
              <div className="border rounded p-3">
                <div className="font-medium mb-1">Tip</div>
                <p className="text-sm text-muted-foreground mb-2">Gebruik het tabblad <strong>Conflicten</strong> om het gewas dat <em>erna</em> komt te verschuiven of segmenten te wisselen. Deze mini-resolver is alleen nog voor noodgevallen.</p>
              </div>
            </div>
            <div className="flex justify-end">
              <button className="px-3 py-1.5 rounded-md border" onClick={()=>setResolver(null)}>Sluiten</button>
            </div>
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
function MonthChips({ selected, onToggle }: { selected: number[]; onToggle: (m: number) => void; }) {
  return (
    <div className="flex flex-wrap gap-1">
      {["J","F","M","A","M","J","J","A","S","O","N","D"].map((lbl, i) => {
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

function ColorField({ label, value, onChange, helperText }: { label: string; value: string; onChange: (v: string) => void; helperText?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input value={value} onChange={(e)=>onChange(e.target.value)} className="border rounded-md px-2 py-1 w-full" placeholder="#22c55e"/>
        <span className="inline-block w-6 h-6 rounded border" style={{ background: value }} />
      </div>
      {helperText && <p className="text-xs text-muted-foreground mt-1">{helperText}</p>}
    </div>
  );
}

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
