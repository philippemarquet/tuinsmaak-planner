// src/components/PlannerPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { Garden, GardenBed, Planting, Seed } from "../lib/types";
import { listBeds } from "../lib/api/beds";
import { listSeeds } from "../lib/api/seeds";
import { listCropTypes } from "../lib/api/cropTypes";
import { createPlanting, listPlantings, deletePlanting, updatePlanting } from "../lib/api/plantings";
import { DndContext, useDraggable, useDroppable, DragOverlay } from "@dnd-kit/core";
import { supabase } from "../lib/supabaseClient";
import { TimelineView } from "./TimelineView";
import { buildConflictsMap, countUniqueConflicts } from "../lib/conflicts";
import { ConflictWarning } from "./ConflictWarning";
import { Edit3, Trash2 } from "lucide-react";
import { useConflictFlags } from "../hooks/useConflictFlags";

/* ===== helpers ===== */
const toISO = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addWeeks = (d: Date, w: number) => addDays(d, w * 7);
const parseISO = (x?: string | null) => x ? new Date(x) : null;
const fmtDMY = (iso?: string | null) => !iso ? "—" : new Date(iso).toLocaleDateString();
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const weekOf = (d: Date) => {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = dt.getUTCDay() || 7; dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(),0,1));
  return Math.ceil((((dt as any)-(yearStart as any))/86400000+1)/7);
};

function planFromGroundDate(seed: Seed, method: "direct"|"presow", groundISO: string) {
  const ground = new Date(groundISO);
  const growW = seed.grow_duration_weeks ?? 0;
  const harvestW = seed.harvest_duration_weeks ?? 0;

  const hsISO = toISO(addWeeks(ground, growW));
  const heDate = addDays(addWeeks(new Date(hsISO), harvestW), -1);
  const heISO = toISO(heDate);

  const presow = method === "presow" && seed.presow_duration_weeks
    ? toISO(addWeeks(ground, -(seed.presow_duration_weeks ?? 0)))
    : null;
  
  return {
    planned_date: groundISO,
    planned_presow_date: presow,
    planned_harvest_start: hsISO,
    planned_harvest_end: heISO,
  };
}

/* occupancy helpers — bed bezetting = ground→harvest_end (voorzaaien telt niet) */
function intervalOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart <= bEnd && bStart <= aEnd;
}
function segmentsOverlap(aStartSeg: number, aUsed: number, bStartSeg: number, bUsed: number) {
  const aEnd = aStartSeg + aUsed - 1, bEnd = bStartSeg + bUsed - 1;
  return aStartSeg <= bEnd && bStartSeg <= aEnd;
}
function wouldOverlapWith(
  plantings: Planting[], bedId: string, startSeg: number, segUsed: number, start: Date, end: Date,
  ignoreId?: string, extras?: Array<{ bed_id: string; startSeg: number; segUsed: number; start: Date; end: Date }>
) {
  for (const p of plantings) {
    if (p.garden_bed_id !== bedId) continue;
    if (ignoreId && p.id === ignoreId) continue;
    const s = parseISO(p.planned_date); const e = parseISO(p.planned_harvest_end);
    if (!s || !e) continue;
    if (!intervalOverlap(start, end, s, e)) continue;
    const ps = p.start_segment ?? 0, pu = p.segments_used ?? 1;
    if (segmentsOverlap(startSeg, segUsed, ps, pu)) return true;
  }
  if (extras) {
    for (const ex of extras) {
      if (ex.bed_id !== bedId) continue;
      if (!intervalOverlap(start, end, ex.start, ex.end)) continue;
      if (segmentsOverlap(startSeg, segUsed, ex.startSeg, ex.segUsed)) return true;
    }
  }
  return false;
}
function findAlternateSegment(
  plantings: Planting[], bed: GardenBed, segUsed: number, start: Date, end: Date, ignoreId?: string, extras?: Array<{ bed_id: string; startSeg: number; segUsed: number; start: Date; end: Date }>
) {
  const maxStart = Math.max(0, (bed.segments ?? 1) - segUsed);
  for (let seg = 0; seg <= maxStart; seg++) {
    if (!wouldOverlapWith(plantings, bed.id, seg, segUsed, start, end, ignoreId, extras)) return seg;
  }
  return null;
}
function* weekShiftGenerator(start: Date, end: Date, maxWeeks = 52) {
  let s = new Date(start), e = new Date(end);
  for (let k = 0; k <= maxWeeks; k++) {
    yield { k, start: new Date(s), end: new Date(e) };
    s = addWeeks(s, 1); e = addWeeks(e, 1);
  }
}

/* ===== tiny UI bits ===== */
function Chip({ children, tone="muted"}:{children:React.ReactNode; tone?: "muted"|"warn"|"danger"}) {
  const map = { muted:"bg-muted text-foreground/80", warn:"bg-amber-100 text-amber-900", danger:"bg-red-100 text-red-800" };
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] ${map[tone]}`}>{children}</span>;
}
function DraggableSeed({ seed, isDragging=false }: { seed: Seed; isDragging?: boolean }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: `seed-${seed.id}` });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const color = seed.default_color?.startsWith("#") ? seed.default_color : "#22c55e";
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}
      className={`px-2 py-1 border rounded-md bg-secondary cursor-move text-sm flex items-center gap-2 ${isDragging ? "opacity-50" : ""}`}>
      <span className="inline-block w-3 h-3 rounded" style={{ background: color }} />
      <span className="truncate">{seed.name}</span>
    </div>
  );
}
function DroppableSegment({ id, occupied, children }:{id:string; occupied:boolean; children:React.ReactNode}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef} className={`border border-dashed rounded-sm min-h-[28px] flex items-center justify-center transition ${isOver?"bg-green-200":occupied?"bg-emerald-50":"bg-muted"}`}>{children}</div>;
}
function MapDroppable({ id }:{id:string}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef} className={`w-full h-full ${isOver?"bg-green-200/40":"bg-transparent"}`} />;
}

/* ===== main ===== */
type InPlanner = 'all'|'planned'|'unplanned';
type CropType = { id: string; name: string };

const MONTHS = [
  { v: "all", label: "Alle maanden" } as const,
  { v: 1, label: "Jan" }, { v: 2, label: "Feb" }, { v: 3, label: "Mrt" }, { v: 4, label: "Apr" },
  { v: 5, label: "Mei" }, { v: 6, label: "Jun" }, { v: 7, label: "Jul" }, { v: 8, label: "Aug" },
  { v: 9, label: "Sep" }, { v:10, label: "Okt" }, { v:11, label: "Nov" }, { v:12, label: "Dec" },
];

export function PlannerPage({ garden }: { garden: Garden }) {
  const [beds, setBeds] = useState<GardenBed[]>([]);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [cropTypes, setCropTypes] = useState<CropType[]>([]);
  const [plantings, setPlantings] = useState<Planting[]>([]);
  const [view, setView] = useState<"list"|"map"|"conflicts"|"timeline">(() => (localStorage.getItem("plannerOpenTab") as any) || (localStorage.getItem("plannerView") as any) || "list");
  const [q, setQ] = useState(localStorage.getItem("plannerQ") ?? "");
  const [inStockOnly, setInStockOnly] = useState(localStorage.getItem("plannerInStock")==="1");
  const [inPlanner, setInPlanner] = useState<InPlanner>((localStorage.getItem("plannerInPlanner") as InPlanner) ?? "all");
  const [greenhouseOnly, setGreenhouseOnly] = useState(localStorage.getItem("plannerGHOnly")==="1");
  const [showGhosts, setShowGhosts] = useState(localStorage.getItem("plannerShowGhosts")==="0" ? false : true);
  const [monthFilter, setMonthFilter] = useState<string|number>(() => localStorage.getItem("plannerMonthFilter") ?? "all");
  const [cropTypeFilter, setCropTypeFilter] = useState<string>(() => localStorage.getItem("plannerCropTypeFilter") ?? "all");
  const [currentWeek, setCurrentWeek] = useState<Date>(() => {
    const saved = localStorage.getItem("plannerWeekISO"); return saved ? new Date(saved) : (() => { const n = new Date(); const d = new Date(n); d.setDate(n.getDate()-((n.getDay()||7)-1)); return d; })();
  });

  // toast
  const [toast, setToast] = useState<{msg:string; tone:"info"|"ok"|"err"}|null>(null);
  const notify = (msg:string, tone:"info"|"ok"|"err"="info") => { setToast({msg, tone}); setTimeout(()=>setToast(null), 2500); };

  // popups
  const [popup, setPopup] = useState<null | { mode:"create"; seed:Seed; bed:GardenBed; segmentIndex:number } | { mode:"edit"; planting:Planting; seed:Seed; bed:GardenBed; segmentIndex:number }>(null);

  // drag
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const activeSeed = useMemo(() => activeDragId?.startsWith("seed-") ? seeds.find(s=>s.id===activeDragId.replace("seed-","")) ?? null : null, [activeDragId, seeds]);

  // effects
  const reload = async () => {
    const [b,s,p,cts] = await Promise.all([listBeds(garden.id), listSeeds(garden.id), listPlantings(garden.id), listCropTypes()]);
    setBeds(b); setSeeds(s); setPlantings(p); setCropTypes(cts);
  };
  useEffect(()=>{ reload().catch(console.error); }, [garden.id]);
  useEffect(()=>{
    const ch = supabase.channel('rt-plantings')
      .on('postgres_changes', { event:'*', schema:'public', table:'plantings', filter:`garden_id=eq.${garden.id}` }, () => reload().catch(()=>{}))
      .subscribe();
    return ()=>{ try { supabase.removeChannel(ch); } catch {} };
  }, [garden.id]);

  useEffect(()=>{ localStorage.setItem("plannerView", view); localStorage.removeItem("plannerOpenTab"); }, [view]);
  useEffect(()=>{ localStorage.setItem("plannerQ", q); }, [q]);
  useEffect(()=>{ localStorage.setItem("plannerInStock", inStockOnly?"1":"0"); }, [inStockOnly]);
  useEffect(()=>{ localStorage.setItem("plannerInPlanner", inPlanner); }, [inPlanner]);
  useEffect(()=>{ localStorage.setItem("plannerGHOnly", greenhouseOnly?"1":"0"); }, [greenhouseOnly]);
  useEffect(()=>{ localStorage.setItem("plannerShowGhosts", showGhosts?"1":"0"); }, [showGhosts]);
  useEffect(()=>{ localStorage.setItem("plannerWeekISO", toISO(currentWeek)); }, [currentWeek]);
  useEffect(()=>{ localStorage.setItem("plannerMonthFilter", String(monthFilter)); }, [monthFilter]);
  useEffect(()=>{ localStorage.setItem("plannerCropTypeFilter", cropTypeFilter); }, [cropTypeFilter]);

  // focus from dashboard
  const [focusId, setFocusId] = useState<string | null>(localStorage.getItem("plannerConflictFocusId"));
  useEffect(()=>{ if (localStorage.getItem("plannerNeedsAttention")==="1") { setView("conflicts"); } localStorage.removeItem("plannerNeedsAttention"); }, []);

  const seedsById = useMemo(()=>Object.fromEntries(seeds.map(s=>[s.id, s])),[seeds]);
  const outdoorBeds = useMemo(()=>beds.filter(b=>!b.is_greenhouse).sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)),[beds]);
  const greenhouseBeds = useMemo(()=>beds.filter(b=>b.is_greenhouse).sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)),[beds]);

  /* ===== conflicts ===== */
  const conflictsMap = useMemo(() => buildConflictsMap(plantings || [], seeds || []), [plantings, seeds]);
  const conflictCount = useMemo(() => countUniqueConflicts(conflictsMap), [conflictsMap]);
  const { hasConflicts } = useConflictFlags(conflictCount);

  /* ===== current week logic + ghosts ===== */
  const isActiveInWeek = (p:Planting, week:Date) => {
    const s = parseISO(p.planned_date); const e = parseISO(p.planned_harvest_end);
    if (!s || !e) return false;
    const mon = new Date(week); const sun = addDays(mon, 6);
    return s <= sun && e >= mon;
  };
  const isFutureRelativeToWeek = (p:Planting, week:Date) => {
    const s = parseISO(p.planned_date); if (!s) return false;
    const mon = new Date(week); const sun = addDays(mon, 6);
    return s > sun;
  };

  /* ===== filters for seeds sidebar ===== */
  const seedHasPlanned = (seedId: string) => plantings.some(p => p.seed_id === seedId && p.planned_date);

  const filteredSeeds = useMemo(() => {
    let arr = seeds.slice();
    if (q.trim()) { const t = q.trim().toLowerCase(); arr = arr.filter(s=>s.name.toLowerCase().includes(t)); }
    if (inStockOnly) arr = arr.filter(s => (s as any).in_stock ?? true);
    if (greenhouseOnly) arr = arr.filter(s => !!s.greenhouse_compatible);
    if (inPlanner!=="all") arr = arr.filter(s => (inPlanner==="planned") ? seedHasPlanned(s.id) : !seedHasPlanned(s.id));
    // categorie
    if (cropTypeFilter !== "all") {
      arr = arr.filter(s => (s.crop_type_id || "") === cropTypeFilter);
    }
    // maandfilter (direct/plant maanden)
    if (monthFilter !== "all") {
      const m = Number(monthFilter);
      arr = arr.filter(s => {
        const months: number[] = (s as any).direct_plant_months ?? (s as any).direct_sow_months ?? [];
        return Array.isArray(months) && months.includes(m);
      });
    }
    return arr;
  }, [seeds, q, inStockOnly, inPlanner, greenhouseOnly, plantings, cropTypeFilter, monthFilter]);

  /* ===== UI: header & tabs ===== */
  const pendingBadge = hasConflicts ? (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-red-100 text-red-800 border border-red-200">
        ⚠️ {conflictCount} conflict{conflictCount !== 1 ? 'en' : ''}
      </span>
    </div>
  ) : null;

  const gotoPrevWeek = () => setCurrentWeek(addDays(currentWeek, -7));
  const gotoNextWeek = () => setCurrentWeek(addDays(currentWeek, 7));
  const gotoToday = () => {
    const n=new Date(); const d=new Date(n); d.setDate(n.getDate()-((n.getDay()||7)-1)); setCurrentWeek(d);
  };

  /* ===== DND ===== */
  function handleDragStart(ev:any){ setActiveDragId(String(ev.active?.id ?? "")); }
  function handleDragEnd(ev:any){
    const over = ev.over; const active = String(ev.active?.id ?? "");
    setActiveDragId(null);
    if (!over || !active.startsWith("seed-")) return;
    const seedId = active.replace("seed-","");
    const seed = seeds.find(s=>s.id===seedId); if (!seed) return;
    const [prefix, bedId, , segStr] = String(over.id).split("__");
    if (!prefix.startsWith("bed")) return;
    const bed = beds.find(b=>b.id===bedId); if (!bed) return;
    setPopup({ mode:"create", seed, bed, segmentIndex: parseInt(segStr, 10) });
  }

  async function handleConfirmPlanting(opts:{
    mode:"create"|"edit";
    target:{ seed:Seed; bed:GardenBed; segmentIndex:number; planting?:Planting };
    segmentsUsed:number; method:"direct"|"presow"; dateISO:string; color:string; bedId?: string; startSeg?: number;
  }) {
    const { mode, target, segmentsUsed, method, dateISO, color, bedId, startSeg } = opts;
    const { seed, bed, planting } = target;
    const bedToUse = bedId ? (beds.find(b=>b.id===bedId) ?? bed) : bed;
    if (!seed.grow_duration_weeks || !seed.harvest_duration_weeks) { notify("Vul groei-/oogstduur bij het zaad.", "err"); return; }
    if (method==="presow" && !seed.presow_duration_weeks) { notify("Voorzaaien vereist voorzaai-weken bij het zaad.", "err"); return; }

    const plantDate = new Date(dateISO);
    const hs = addWeeks(plantDate, seed.grow_duration_weeks!);
    const he = addDays(addWeeks(hs, seed.harvest_duration_weeks!), -1);
    const segUsed = clamp(segmentsUsed, 1, Math.max(1, (bedToUse.segments ?? 1) - (startSeg ?? 0)));

    const startSegmentFinal = Math.max(0, Math.min((startSeg ?? (planting?.start_segment ?? target.segmentIndex)), (bedToUse.segments ?? 1) - segUsed));

    if (wouldOverlapWith(plantings, bedToUse.id, startSegmentFinal, segUsed, plantDate, he, planting?.id)) {
      notify("Deze planning botst in tijd/segment.", "err"); return;
    }

    if (mode==="create") {
      await createPlanting({
        seed_id: seed.id, garden_bed_id: bedToUse.id, garden_id: bedToUse.garden_id,
        planned_date: toISO(plantDate), planned_harvest_start: toISO(hs), planned_harvest_end: toISO(he),
        planned_presow_date: method==="presow" && seed.presow_duration_weeks ? toISO(addWeeks(plantDate, -(seed.presow_duration_weeks??0))) : null,
        method, segments_used: segUsed, start_segment: startSegmentFinal, color: color || seed.default_color || "#22c55e", status: "planned",
      } as any);
      await reload(); setPopup(null); notify("Planting toegevoegd.", "ok");
    } else {
      await updatePlanting(planting!.id, {
        garden_bed_id: bedToUse.id,
        planned_date: toISO(plantDate), planned_harvest_start: toISO(hs), planned_harvest_end: toISO(he),
        planned_presow_date: method==="presow" && seed.presow_duration_weeks ? toISO(addWeeks(plantDate, -(seed.presow_duration_weeks??0))) : null,
        method, segments_used: segUsed, start_segment: startSegmentFinal, color: color || planting?.color || seed.default_color || "#22c55e",
      } as any);
      await reload(); setPopup(null); notify("Planting bijgewerkt.", "ok");
    }
  }

  /* ===== LIST view ===== */
  const seedsList = (
    <div className="sticky top-24">
      <div className="space-y-3 max-h?[calc(100vh-7rem)] overflow-auto pr-1 pb-3">
        <h3 className="text-base font-semibold">Zoek/filters</h3>

        <input className="w-full border rounded px-2 py-1" value={q} onChange={e=>setQ(e.target.value)} placeholder="Zoek op naam…" />

        <div className="text-sm space-y-1">
          <label className="flex items-center gap-2"><input type="checkbox" checked={inStockOnly} onChange={e=>setInStockOnly(e.target.checked)} />In voorraad</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={greenhouseOnly} onChange={e=>setGreenhouseOnly(e.target.checked)} />Alleen kas-geschikt</label>
          <div className="flex gap-2">
            {(["all","planned","unplanned"] as InPlanner[]).map(k=>(
              <button key={k} className={`px-2 py-0.5 rounded border text-xs ${inPlanner===k?"bg-primary text-primary-foreground":"bg-muted text-muted-foreground"}`} onClick={()=>setInPlanner(k)}>{k==="all"?"Alle":k==="planned"?"Gepland":"Niet gepland"}</button>
            ))}
          </div>
        </div>

        {/* Nieuwe filters: maand + categorie */}
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground">Direct/Plant maand</label>
          <select
            className="w-full border rounded px-2 py-1 text-sm"
            value={String(monthFilter)}
            onChange={e=>setMonthFilter(/^\d+$/.test(e.target.value) ? Number(e.target.value) : "all")}
          >
            {MONTHS.map(m => <option key={String(m.v)} value={String(m.v)}>{m.label}</option>)}
          </select>

          <label className="block text-xs text-muted-foreground mt-2">Categorie</label>
          <select
            className="w-full border rounded px-2 py-1 text-sm"
            value={cropTypeFilter}
            onChange={e=>setCropTypeFilter(e.target.value)}
          >
            <option value="all">Alle categorieën</option>
            {cropTypes.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
          </select>
        </div>

        <h3 className="text-base font-semibold mt-2">Zaden</h3>
        <div className="space-y-1.5">
          {filteredSeeds.map(seed => <DraggableSeed key={seed.id} seed={seed} isDragging={activeDragId===`seed-${seed.id}`} />)}
          {filteredSeeds.length===0 && <p className="text-xs text-muted-foreground">Geen zaden gevonden.</p>}
        </div>
      </div>
    </div>
  );

  const BedCard = ({ bed }:{ bed: GardenBed }) => {
    const activePlantings = plantings.filter(p => p.garden_bed_id===bed.id && isActiveInWeek(p, currentWeek));
    const futurePlantings = showGhosts ? plantings.filter(p => p.garden_bed_id===bed.id && !isActiveInWeek(p, currentWeek) && isFutureRelativeToWeek(p, currentWeek)) : [];
    const segs = Array.from({length: bed.segments}, (_,i)=>i);

    // Toon alleen een ⚠️ op de titel als *enig* conflict in deze bak
    const bedHasConflict = activePlantings.some(p => (conflictsMap.get(p.id)?.length ?? 0) > 0);

    return (
      <div className="p-2.5 border rounded-xl bg-card shadow-sm">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <h5 className="font-semibold text-sm">{bed.name}</h5>
            {bedHasConflict && <Chip tone="danger">⚠️</Chip>}
          </div>
          {bed.is_greenhouse && <Chip>Kas</Chip>}
        </div>

        {/* Altijd exact zoveel rijen als segmenten */}
        <div className="grid gap-1" style={{ gridTemplateRows: `repeat(${bed.segments}, minmax(26px, auto))` }}>
          {segs.map(i=>{
            const here = activePlantings.filter(p => {
              const s=p.start_segment??0, u=p.segments_used??1;
              return i>=s && i<s+u;
            });
            const ghosts = futurePlantings.filter(p => {
              const s=p.start_segment??0, u=p.segments_used??1;
              return i>=s && i<s+u;
            });

            return (
              <DroppableSegment key={i} id={`bed__${bed.id}__segment__${i}`} occupied={here.length>0}>
                <div className="flex flex-col gap-0.5 w-full px-1">
                  {here.map(p=>{
                    const seed = seedsById[p.seed_id]; const color = p.color?.startsWith("#")?p.color:"#22c55e";
                    const hasConflict = (conflictsMap.get(p.id)?.length ?? 0) > 0;
                    return (
                      <div key={`${p.id}-${i}`} className="rounded px-2 py-1 text-white text-[11px] flex items-center justify-between
