// src/components/PlannerPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { Garden, GardenBed, Planting, Seed, CropType, UUID, Task } from "../lib/types";
import { GardenPlotCanvas } from "./GardenPlotCanvas";
import { createPlanting, updatePlanting, deletePlanting } from "../lib/api/plantings";
import { updateBed } from "../lib/api/beds";
import { listPlotObjects, type PlotObject as APIPlotObject } from "../lib/api/plotObjects";
import { DndContext, useDraggable, useDroppable, DragOverlay } from "@dnd-kit/core";
import { supabase } from "../lib/supabaseClient";
import CapacityTimelineView from "./CapacityTimelineView";
import { buildConflictsMap, countUniqueConflicts } from "../lib/conflicts";
import { ConflictWarning } from "./ConflictWarning";
import { useConflictFlags } from "../hooks/useConflictFlags";
import { SeedModal } from "./SeedModal";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { cn, getContrastTextColor } from "../lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Edit3, Trash2, Info, AlertTriangle, X, Calendar as CalendarIcon } from "lucide-react";
import HarvestAgendaView from "./HarvestAgendaView";
import { SeedsSidebar } from "./SeedsSidebar";

/* ===== helpers ===== */
const toISO = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addWeeks = (d: Date, w: number) => addDays(d, w * 7);
const parseISO = (x?: string | null) => { if (!x) return null; const [y,m,dd]=x.split("-").map(Number); return new Date(y,m-1,dd); };
const fmtDMY = (iso?: string | null) => (!iso ? "—" : new Date(iso).toLocaleDateString("nl-NL"));
const clamp = (n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const weekOf = (d: Date) => {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yStart = new Date(Date.UTC(dt.getUTCFullYear(),0,1));
  return Math.ceil((((dt as any) - (yStart as any))/86400000+1)/7);
};

function intervalOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date){ return aStart<=bEnd && bStart<=aEnd; }
function segmentsOverlap(aStartSeg:number,aUsed:number,bStartSeg:number,bUsed:number){
  const aEnd=aStartSeg+aUsed-1, bEnd=bStartSeg+bUsed-1; return aStartSeg<=bEnd && bStartSeg<=aEnd;
}
function wouldOverlapWith(plantings: Planting[], bedId: string, startSeg: number, segUsed: number, start: Date, end: Date, ignoreId?: string){
  for(const p of plantings){
    if(p.garden_bed_id!==bedId) continue;
    if(ignoreId && p.id===ignoreId) continue;
    const s=parseISO(p.planned_date), e=parseISO(p.planned_harvest_end);
    if(!s||!e) continue;
    if(!intervalOverlap(start,end,s,e)) continue;
    const ps=p.start_segment??0, pu=p.segments_used??1;
    if(segmentsOverlap(startSeg,segUsed,ps,pu)) return true;
  }
  return false;
}
function findAllStartSegments(plantings: Planting[], bed: GardenBed, segUsed: number, start: Date, end: Date, ignoreId?: string){
  const maxStart=Math.max(0,(bed.segments??1)-Math.max(1,segUsed));
  const out:number[]=[];
  for(let seg=0; seg<=maxStart; seg++){
    if(!wouldOverlapWith(plantings, bed.id, seg, Math.max(1,segUsed), start, end, ignoreId)) out.push(seg);
  }
  return out;
}
function listOverlaps(
  plantings: Planting[],
  seedsById: Record<string, Seed|undefined>,
  bedId: string,
  startSeg: number,
  segUsed: number,
  start: Date,
  end: Date,
  ignoreId?: string
){
  const out: Array<{with:Planting; seedName:string; fromISO:string; toISO:string; segFrom:number; segTo:number}> = [];
  for(const p of plantings){
    if(p.garden_bed_id!==bedId) continue;
    if(ignoreId && p.id===ignoreId) continue;
    const s=parseISO(p.planned_date), e=parseISO(p.planned_harvest_end);
    if(!s||!e) continue;
    if(!intervalOverlap(start,end,s,e)) continue;
    const ps=p.start_segment??0, pu=p.segments_used??1;
    if(segmentsOverlap(startSeg,segUsed,ps,pu)){
      out.push({
        with:p,
        seedName: seedsById[p.seed_id]?.name ?? "—",
        fromISO: toISO(s>start?s:start),
        toISO: toISO(e<end?e:end),
        segFrom: Math.max(ps,startSeg)+1,
        segTo: Math.min(ps+pu-1,startSeg+segUsed-1)+1,
      });
    }
  }
  return out;
}

/* ===== tiny UI bits ===== */
function Chip({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "warn" | "danger" }) {
  const map = { muted:"bg-muted text-foreground/80", warn:"bg-amber-100 text-amber-900", danger:"bg-red-100 text-red-800" };
  return <span className={`inline-flex items-center rounded px-1 py-0.5 text-[9px] ${map[tone]}`}>{children}</span>;
}
function DraggableSeed({ seed, isDragging=false, onInfoClick }: { seed: Seed; isDragging?: boolean; onInfoClick?: ()=>void }){
  const { attributes, listeners, setNodeRef } = useDraggable({ id:`seed-${seed.id}` });
  const color = seed.default_color?.startsWith("#") ? seed.default_color : "#22c55e";
  return (
    <div ref={setNodeRef} className={`group relative px-2 py-1 rounded border bg-card hover:shadow-sm transition-all duration-150 ${isDragging?"opacity-40 scale-95":"hover:border-primary/30"}`}>
      <div {...listeners} {...attributes} className="flex items-center gap-1.5 cursor-grab active:cursor-grabbing">
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background:color}}/>
        <span className="text-[11px] font-medium truncate flex-1">{seed.name}</span>
      </div>
      {onInfoClick && (
        <button onClick={(e)=>{e.stopPropagation(); onInfoClick();}} className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity" title="Bekijk zaadgegevens">
          <Info className="h-3 w-3 text-muted-foreground"/>
        </button>
      )}
    </div>
  );
}
function DroppableSegment({ id, occupied, children }: { id:string; occupied:boolean; children:React.ReactNode }){
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`relative border border-dashed rounded min-h-[18px] flex items-center justify-center transition-all duration-150 ${
      isOver ? "border-primary bg-primary/10 scale-[1.01]" : occupied ? "border-emerald-300/50 bg-emerald-50/20" : "border-muted-foreground/15 bg-muted/10 hover:border-muted-foreground/25"
    }`}>
      {children}
    </div>
  );
}
function MapDroppable({ id }: { id:string }){
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef} className={`w-full h-full transition-colors duration-150 ${isOver?"bg-primary/20":"bg-transparent"}`}/>;
}

/* ===== main ===== */
type InPlanner = "all" | "planned" | "unplanned";

export function PlannerPage({
  garden,
  beds: initialBeds,
  seeds: initialSeeds,
  plantings: initialPlantings,
  tasks: initialTasks,
  cropTypes: initialCropTypes,
  onDataChange
}: {
  garden: Garden;
  beds: GardenBed[];
  seeds: Seed[];
  plantings: Planting[];
  tasks: Task[];
  cropTypes: CropType[];
  onDataChange: () => Promise<void>;
}) {
  const [beds, setBeds] = useState<GardenBed[]>(initialBeds);
  const [seeds, setSeeds] = useState<Seed[]>(initialSeeds);
  const [plantings, setPlantings] = useState<Planting[]>(initialPlantings);
  const [tasks] = useState<Task[]>(initialTasks);
  const [cropTypes, setCropTypes] = useState<CropType[]>(initialCropTypes);

  const [view, setView] = useState<"list" | "map" | "timeline" | "harvest" | "conflicts">(
    () => (localStorage.getItem("plannerOpenTab") as any) || (localStorage.getItem("plannerView") as any) || "list"
  );

  const [seedDetailsModal, setSeedDetailsModal] = useState<Seed | null>(null);

  const [currentWeek, setCurrentWeek] = useState<Date>(() => {
    const saved = localStorage.getItem("plannerWeekISO");
    if (saved) return new Date(saved);
    const n = new Date();
    const d = new Date(n);
    d.setDate(n.getDate() - ((n.getDay() || 7) - 1));
    return d; // maandag
  });

  const [toast, setToast] = useState<{ msg: string, tone: "info" | "ok" | "err" } | null>(null);
  const notify = (msg: string, tone: "info" | "ok" | "err" = "info") => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 3600);
  };

  const [popup, setPopup] = useState<
    | null
    | { mode: "create"; seed: Seed; bed: GardenBed; segmentIndex: number; defaultDateISO?: string }
    | { mode: "edit"; planting: Planting; seed: Seed; bed: GardenBed; segmentIndex: number }
  >(null);

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const activeSeed = useMemo(
    () => (activeDragId?.startsWith("seed-") ? seeds.find((s) => s.id === activeDragId.replace("seed-", "")) ?? null : null),
    [activeDragId, seeds]
  );

  /* sync data */
  useEffect(() => {
    setBeds(initialBeds);
    setSeeds(initialSeeds);
    setPlantings(initialPlantings);
    setCropTypes(initialCropTypes);
  }, [initialBeds, initialSeeds, initialPlantings, initialCropTypes]);

  const [plotObjects, setPlotObjects] = useState<APIPlotObject[]>([]);
  useEffect(() => {
    if (view === "map" && garden?.id) {
      listPlotObjects(garden.id).then(setPlotObjects).catch((e)=>console.error("Failed to load plot objects:", e));
    }
  }, [view, garden?.id]);

  const reload = async () => { await onDataChange(); };
  useEffect(() => {
    const ch = supabase
      .channel("rt-plantings")
      .on("postgres_changes", { event: "*", schema: "public", table: "plantings", filter: `garden_id=eq.${garden.id}` }, () => reload().catch(()=>{}))
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch {} };
  }, [garden.id]);

  useEffect(() => { localStorage.setItem("plannerView", view); localStorage.removeItem("plannerOpenTab"); }, [view]);
  useEffect(() => { localStorage.setItem("plannerWeekISO", toISO(currentWeek)); }, [currentWeek]);

  const seedsById = useMemo(() => Object.fromEntries(seeds.map((s)=>[s.id,s])), [seeds]);
  const cropTypesById = useMemo(()=> new Map<string, CropType>(cropTypes.map((c)=>[c.id,c])), [cropTypes]);

  const outdoorBeds = useMemo(()=> (Array.isArray(beds)?beds.filter(b=>!b.is_greenhouse).sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)):[]), [beds]);
  const greenhouseBeds = useMemo(()=> (Array.isArray(beds)?beds.filter(b=> b.is_greenhouse).sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)):[]), [beds]);

  const isActiveInWeek = (p:Planting, week:Date)=>{
    const s=parseISO(p.planned_date), e=parseISO(p.planned_harvest_end); if(!s||!e) return false;
    const mon=new Date(week), sun=addDays(mon,6); return s<=sun && e>=mon;
  };

  const plantingsForMap = useMemo(()=>{
    const weekStart=new Date(currentWeek), weekEnd=addDays(weekStart,6);
    const nextTaskByPlanting=new Map<string,Task>();
    for(const t of tasks){
      if(t.status!=="pending") continue;
      const ex=nextTaskByPlanting.get(t.planting_id);
      if(!ex || new Date(t.due_date)<new Date(ex.due_date)) nextTaskByPlanting.set(t.planting_id,t);
    }
    return (plantings||[])
      .filter(p=>{
        const s=parseISO(p.planned_date), e=parseISO(p.planned_harvest_end); if(!s||!e) return false;
        return s<=weekEnd && e>=weekStart;
      })
      .map(p=>{
        const seed=seedsById[p.seed_id??""];
        const ICON_BUCKET="crop-icons"; const iconUrlCache=new Map<string,string>();
        const getPublicIconUrl=(key?:string|null)=>{ if(!key) return null; const c=iconUrlCache.get(key); if(c) return c; const {data}=supabase.storage.from(ICON_BUCKET).getPublicUrl(key); const url=data?.publicUrl??null; if(url) iconUrlCache.set(key,url); return url;};
        const own=getPublicIconUrl((seed as any)?.icon_key);
        const ct=seed?.crop_type_id?cropTypesById.get(seed.crop_type_id):undefined;
        const iconUrl=own??getPublicIconUrl((ct as any)?.icon_key);
        const nextTask=nextTaskByPlanting.get(p.id);
        return {
          id:p.id,
          bedId:p.garden_bed_id??"",
          startSegment:p.start_segment??0,
          segmentsUsed:p.segments_used??1,
          color: p.color?.startsWith("#") ? p.color : seed?.default_color?.startsWith("#") ? seed.default_color! : "#22c55e",
          iconUrl,
          label: seed?.name,
          cropType: seed?.crop_type_id ? cropTypesById.get(seed.crop_type_id)?.name : undefined,
          nextActionType: nextTask?.type,
          nextActionDate: nextTask?.due_date,
        };
      });
  },[plantings,seedsById,cropTypesById,currentWeek,tasks]);

  /* conflicts */
  const conflictsMap = useMemo(()=>buildConflictsMap(plantings||[], seeds||[]), [plantings, seeds]);
  const conflictCount = useMemo(()=>countUniqueConflicts(conflictsMap), [conflictsMap]);
  const { hasConflicts } = useConflictFlags(conflictCount);
  const bedHasConflict = (bedId:UUID)=> (plantings||[]).some(p=>p.garden_bed_id===bedId && (conflictsMap.get(p.id)?.length??0)>0);

  const gotoPrevWeek = ()=> setCurrentWeek(addDays(currentWeek,-7));
  const gotoNextWeek = ()=> setCurrentWeek(addDays(currentWeek,7));
  const gotoToday = ()=>{
    const n=new Date(); const d=new Date(n); d.setDate(n.getDate()-((n.getDay()||7)-1)); setCurrentWeek(d);
  };

  async function handleConfirmPlanting(opts:{
    mode:"create"|"edit";
    target:{ seed:Seed; bed:GardenBed; segmentIndex:number; planting?:Planting };
    startSegment:number;
    segmentsUsed:number;
    method:"direct"|"presow";
    dateISO:string;
    color:string;
    bedIdOverride?:string;
  }){
    const { mode, target, startSegment, segmentsUsed, method, dateISO, color, bedIdOverride } = opts;
    const { seed, bed, planting } = target;
    const bedToUse = bedIdOverride ? (beds.find(b=>b.id===bedIdOverride) ?? bed) : bed;

    if(!seed.grow_duration_weeks || !seed.harvest_duration_weeks){ notify("Vul groei-/oogstduur bij het zaad.", "err"); return; }
    if(method==="presow" && !seed.presow_duration_weeks){ notify("Voorzaaien vereist voorzaai-weken bij het zaad.", "err"); return; }

    const plantDate = parseISO(dateISO)!;
    const hs = addWeeks(plantDate, seed.grow_duration_weeks ?? 0);
    const he = addDays(addWeeks(hs, seed.harvest_duration_weeks ?? 0), -1);
    const segUsed = Math.max(1, segmentsUsed);

    const overlaps = listOverlaps(plantings, seedsById, bedToUse.id, startSegment, segUsed, plantDate, he, planting?.id);
    if(overlaps.length>0){
      const o=overlaps[0];
      notify(`Botsing met "${o.seedName}" (${fmtDMY(o.fromISO)} – ${fmtDMY(o.toISO)}), segmenten ${o.segFrom}–${o.segTo}. Corrigeer eerst die overlap.`,"err");
      return;
    }

    if(mode==="create"){
      await createPlanting({
        seed_id: seed.id,
        garden_bed_id: bedToUse.id,
        garden_id: bedToUse.garden_id,
        planned_date: toISO(plantDate),
        planned_harvest_start: toISO(hs),
        planned_harvest_end: toISO(he),
        planned_presow_date: method==="presow" && seed.presow_duration_weeks ? toISO(addWeeks(plantDate, -(seed.presow_duration_weeks??0))) : null,
        method,
        segments_used: segUsed,
        start_segment: startSegment,
        color: color || seed.default_color || "#22c55e",
        status: "planned",
      } as any);
      await reload(); setPopup(null); notify("Planting toegevoegd.","ok");
    }else{
      await updatePlanting(planting!.id, {
        garden_bed_id: bedToUse.id,
        planned_date: toISO(plantDate),
        planned_harvest_start: toISO(hs),
        planned_harvest_end: toISO(he),
        planned_presow_date: method==="presow" && seed.presow_duration_weeks ? toISO(addWeeks(plantDate, -(seed.presow_duration_weeks??0))) : null,
        method,
        segments_used: segUsed,
        start_segment: startSegment,
        color: color || planting?.color || seed.default_color || "#22c55e",
      } as any);
      await reload(); setPopup(null); notify("Planting bijgewerkt.","ok");
    }
  }

  async function tryMovePlantingByDrop(plantingId:string, bedId:string, targetSeg:number, dateISO:string){
    const p=plantings.find(x=>x.id===plantingId); if(!p) return;
    const seed=seedsById[p.seed_id]; const bed=beds.find(b=>b.id===bedId);
    if(!seed||!bed) return;

    const segUsed=Math.max(1,p.segments_used??1);
    const newStartSeg=clamp(targetSeg,0,Math.max(0,(bed.segments??1)-segUsed));
    const plantDate=parseISO(dateISO)!;
    const hs=addWeeks(plantDate, seed.grow_duration_weeks??0);
    const he=addDays(addWeeks(hs, seed.harvest_duration_weeks??0), -1);

    const overlaps=listOverlaps(plantings, seedsById, bedId, newStartSeg, segUsed, plantDate, he, p.id);
    if(overlaps.length>0){
      const o=overlaps[0];
      notify(`Botsing met "${o.seedName}" (${fmtDMY(o.fromISO)} – ${fmtDMY(o.toISO)}), segmenten ${o.segFrom}–${o.segTo}. Corrigeer eerst die overlap.`,"err");
      return;
    }

    await updatePlanting(p.id, {
      garden_bed_id: bedId,
      planned_date: toISO(plantDate),
      planned_harvest_start: toISO(hs),
      planned_harvest_end: toISO(he),
      start_segment: newStartSeg,
    } as any);
    await reload();
    notify("Planning verschoven.","ok");
  }

  function handleDragEnd(ev:any){
    const over=ev.over; const activeId=String(ev?.active?.id??""); setActiveDragId(null);
    if(!over) return;
    const overId=String(over.id??""); const parts=overId.split("__");

    // Seed → lijst of timeline
    if(activeId.startsWith("seed-")){
      const seedId=activeId.replace("seed-",""); const seed=seeds.find(s=>s.id===seedId); if(!seed) return;

      if(parts[0]==="bed"){ // lijst
        const bedId=parts[1], segStr=parts[3]; const bed=beds.find(b=>b.id===bedId); if(!bed) return;
        setPopup({ mode:"create", seed, bed, segmentIndex: parseInt(segStr,10) });
        return;
      }
      if(parts[0]==="timeline"){ // timeline
        const bedId=parts[1], segStr=parts[3], dateISO=parts[5]; const bed=beds.find(b=>b.id===bedId); if(!bed) return;
        setPopup({ mode:"create", seed, bed, segmentIndex: parseInt(segStr,10), defaultDateISO: dateISO });
        return;
      }
      return;
    }

    // Planting → timeline verplaatsen
    if(activeId.startsWith("planting-") && parts[0]==="timeline"){
      const plantingId=activeId.replace("planting-",""); const bedId=parts[1]; const segStr=parts[3]; const dateISO=parts[5];
      tryMovePlantingByDrop(plantingId, bedId, parseInt(segStr,10), dateISO);
      return;
    }
  }

  /* ===== LIST view (zonder icons; alleen kleur + titel) ===== */
  const groups = useMemo(()=>[
    { label: "Buiten", items: Array.isArray(outdoorBeds)?outdoorBeds:[] },
    { label: "Kas", items: Array.isArray(greenhouseBeds)?greenhouseBeds:[] },
  ],[outdoorBeds, greenhouseBeds]);

  const listViewContent = (
    <div className="p-4 pb-8">
      <div className="space-y-6">
        {groups.map(({label, items})=> items.length>0 ? (
          <section key={label} className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{label}</h4>
            <div className="grid gap-2" style={{ gridTemplateColumns:"repeat(auto-fill, minmax(180px, 1fr))" }}>
              {items.map((bed)=>{
                const activePlantings=plantings.filter(p=>p.garden_bed_id===bed.id && isActiveInWeek(p,currentWeek));
                const segCount=Math.max(1, Number(bed.segments??1));
                const segs=Array.from({length:segCount},(_,i)=>i);

                return (
                  <div key={bed.id} className="p-2 border rounded-lg bg-card shadow-sm">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <h5 className="font-medium text-xs">{bed.name}</h5>
                        {bedHasConflict(bed.id) && <Chip tone="danger">⚠️</Chip>}
                      </div>
                      {bed.is_greenhouse && <Chip>Kas</Chip>}
                    </div>

                    <div className="grid gap-0.5" style={{ gridTemplateRows: `repeat(${segCount}, minmax(20px, auto))` }}>
                      {segs.map((i)=>{
                        const here=activePlantings.filter(p=>{
                          const s=p.start_segment??0, u=p.segments_used??1;
                          return i>=s && i<s+u;
                        });
                        return (
                          <DroppableSegment key={i} id={`bed__${bed.id}__segment__${i}`} occupied={here.length>0}>
                            <div className="flex flex-col gap-0.5 w-full px-0.5">
                              {here.map((p)=>{
                                const seed=seedsById[p.seed_id];
                                const color = p.color?.startsWith("#") ? p.color : "#22c55e";
                                const hasConflict=(conflictsMap.get(p.id)?.length??0)>0;
                                const textColor=getContrastTextColor(color);
                                return (
                                  <div key={`${p.id}-${i}`} className="relative rounded px-1.5 py-0.5 text-[10px] flex items-center justify-between overflow-hidden"
                                       style={{ background: color, color: textColor }}
                                       title={`${seed?.name ?? "—"} • ${fmtDMY(p.planned_date)} → ${fmtDMY(p.planned_harvest_end)}`}>
                                    <div className="relative z-20 flex items-center gap-0.5 min-w-0">
                                      <span className="truncate">{seed?.name ?? "—"}</span>
                                      {hasConflict && (
                                        <button className="text-[9px] underline decoration-white/70 underline-offset-1 opacity-90"
                                                onClick={(e)=>{e.stopPropagation(); setView("conflicts"); localStorage.setItem("plannerOpenTab","conflicts");}}
                                                title="Bekijk in Conflicten">⚠️</button>
                                      )}
                                    </div>
                                    <div className="absolute top-0.5 right-0.5 flex items-center gap-0.5 ml-0.5 z-20">
                                      <button className="p-0.5 hover:bg-white/20 rounded" title="Bewerken"
                                              onClick={()=> setPopup({ mode:"edit", planting:p, seed:seed!, bed, segmentIndex:p.start_segment??0 })}>
                                        <Edit3 className="w-2.5 h-2.5"/>
                                      </button>
                                      <button className="p-0.5 hover:bg-white/20 rounded" title="Verwijderen"
                                              onClick={()=>{ if(confirm("Verwijderen?")) deletePlanting(p.id).then(reload); }}>
                                        <Trash2 className="w-2.5 h-2.5"/>
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </DroppableSegment>
                        );
                      })}
                    </div>

                    {bedHasConflict(bed.id) && (
                      <div className="mt-1.5 text-[10px] text-red-700">
                        ⚠️ Conflicten — <button className="underline" onClick={()=>{ setView("conflicts"); localStorage.setItem("plannerOpenTab","conflicts");}}>Bekijk</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null)}
      </div>
    </div>
  );

  /* ===== MAP view ===== */
  function PlannerMap(){
    const viewportRef=useRef<HTMLDivElement|null>(null);
    const CANVAS_W=3000, CANVAS_H=1200;
    const [zoom,setZoom]=useState(()=>{ const s=localStorage.getItem("plannerMapZoomV2"); return s?parseFloat(s):0.8; });
    const minZoom=0.15, maxZoom=2;
    const clampZoom=(z:number)=>Math.max(minZoom,Math.min(maxZoom,z));
    const handleManualZoom=(z:number)=>{ const v=clampZoom(z); setZoom(v); localStorage.setItem("plannerMapZoomV2",v.toString()); };
    const fit=()=>{ const vp=viewportRef.current; if(!vp) return; const vw=vp.clientWidth-24, vh=vp.clientHeight-24; const zx=vw/CANVAS_W, zy=vh/CANVAS_H; handleManualZoom(Math.min(zx,zy)); };
    useEffect(()=>{ if(!localStorage.getItem("plannerMapZoomV2")){ const t=setTimeout(fit,50); return ()=>clearTimeout(t); }},[]);
    const WOOD_BORDER=8;
    const isActive=(p:Planting)=>{ const s=parseISO(p.planned_date), e=parseISO(p.planned_harvest_end); if(!s||!e) return false; const mon=new Date(currentWeek), sun=addDays(mon,6); return s<=sun && e>=mon; };

    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Plattegrond</h3>
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-1 border rounded-md px-2 py-1 bg-secondary hover:bg-secondary/80" onClick={()=>handleManualZoom(zoom-0.1)} title="Uitzoomen">-</button>
            <input type="range" min={minZoom} max={maxZoom} step={0.05} value={zoom} onChange={(e)=>handleManualZoom(parseFloat(e.target.value))} className="w-32"/>
            <button className="inline-flex items-center gap-1 border rounded-md px-2 py-1 bg-secondary hover:bg-secondary/80" onClick={()=>handleManualZoom(zoom+0.1)} title="Inzoomen">+</button>
            <button className="inline-flex items-center gap-1 border rounded-md px-2 py-1 bg-secondary hover:bg-secondary/80" onClick={()=>handleManualZoom(1)} title="100%">100%</button>
            <button className="inline-flex items-center gap-1 border rounded-md px-2 py-1" onClick={fit} title="Passend maken">Fit</button>
            <span className="text-xs text-muted-foreground ml-1">{Math.round(zoom*100)}%</span>
          </div>
        </div>

        <div ref={viewportRef} className="relative w-full h-[70vh] rounded-xl border-2 border-amber-800/30 overflow-auto shadow-xl"
             style={{ background:"linear-gradient(135deg, #2d5016 0%, #3a6b1e 25%, #2d5016 50%, #3a6b1e 75%, #2d5016 100%)" }}>
          <div className="relative" style={{ width: CANVAS_W*zoom, height: CANVAS_H*zoom }}>
            <div className="absolute left-0 top-0" style={{
              width: CANVAS_W, height: CANVAS_H, transform:`scale(${zoom})`, transformOrigin:"0 0", borderRadius:12,
              backgroundImage: `
                radial-gradient(ellipse 3px 5px at 20% 30%, rgba(255,255,255,0.03) 0%, transparent 100%),
                radial-gradient(ellipse 2px 4px at 60% 70%, rgba(255,255,255,0.02) 0%, transparent 100%),
                radial-gradient(ellipse 4px 6px at 80% 20%, rgba(255,255,255,0.03) 0%, transparent 100%),
                radial-gradient(ellipse 3px 5px at 40% 80%, rgba(255,255,255,0.02) 0%, transparent 100%),
                repeating-linear-gradient(90deg, transparent 0px, transparent 8px, rgba(0,0,0,0.02) 8px, rgba(0,0,0,0.02) 9px),
                repeating-linear-gradient(0deg, transparent 0px, transparent 12px, rgba(0,0,0,0.015) 12px, rgba(0,0,0,0.015) 13px)
              `
            }}>
              <div className="absolute inset-0 pointer-events-none"
                   style={{ background:"radial-gradient(ellipse 80% 60% at 30% 20%, rgba(255,255,200,0.08) 0%, transparent 60%)" }}/>
              {beds.map((bed)=>{
                const w=Math.max(60, Math.round(bed.length_cm||200));
                const h=Math.max(36, Math.round(bed.width_cm||100));
                const x=bed.location_x??20, y=bed.location_y??20;
                const innerW=Math.max(1, w-WOOD_BORDER*2), innerH=Math.max(1, h-WOOD_BORDER*2);
                const segCount=Math.max(1, bed.segments);
                const vertical=innerW>=innerH;
                const active=plantings.filter(p=>p.garden_bed_id===bed.id && isActive(p));
                return (
                  <div key={bed.id} className="absolute select-none" style={{ left:x, top:y, width:w, height:h }}>
                    <div className="absolute -bottom-4 left-1 right-1 h-5 rounded-full"
                         style={{ background:"radial-gradient(ellipse at center, rgba(0,0,0,0.3) 0%, transparent 70%)" }}/>
                    <div className="absolute inset-0 rounded-lg" style={{
                      background: bed.is_greenhouse
                        ? "linear-gradient(135deg, #e8e8e8 0%, #c0c0c0 50%, #e8e8e8 100%)"
                        : `linear-gradient(180deg,#8B6914 0%,#7a5a12 15%,#6d4f0f 30%,#5c4210 50%,#6d4f0f 70%,#7a5a12 85%,#8B6914 100%)`,
                      boxShadow: bed.is_greenhouse
                        ? "0 4px 8px rgba(0,0,0,0.25), inset 1px 1px 0 rgba(255,255,255,0.4)"
                        : "inset 2px 2px 4px rgba(255,255,255,0.15), inset -2px -2px 4px rgba(0,0,0,0.2), 0 4px 8px rgba(0,0,0,0.3)",
                      padding: WOOD_BORDER
                    }}>
                      {!bed.is_greenhouse && (
                        <div className="absolute inset-0 rounded-lg pointer-events-none opacity-30"
                             style={{ backgroundImage: `
                               repeating-linear-gradient(90deg, transparent 0px, transparent 20px, rgba(0,0,0,0.1) 20px, rgba(0,0,0,0.1) 21px),
                               repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(255,255,255,0.05) 3px, rgba(255,255,255,0.05) 4px)
                             `}}
                        />
                      )}
                      <div className="relative w-full h-full rounded-md overflow-hidden" style={{
                        background: `
                          radial-gradient(ellipse at 30% 40%, rgba(101,67,33,1) 0%, transparent 50%),
                          radial-gradient(ellipse at 70% 60%, rgba(89,60,31,1) 0%, transparent 50%),
                          radial-gradient(ellipse at 50% 30%, rgba(110,75,38,1) 0%, transparent 40%),
                          linear-gradient(180deg, #5c4033 0%, #4a3328 50%, #3e2723 100%)
                        `,
                        boxShadow: "inset 0 2px 8px rgba(0,0,0,0.4)"
                      }}>
                        {bed.is_greenhouse && (
                          <div className="absolute inset-0 pointer-events-none"
                               style={{ background:"linear-gradient(135deg, rgba(255,255,255,0.35) 0%, transparent 30%, transparent 70%, rgba(255,255,255,0.15) 100%)" }}/>
                        )}
                        {segCount>1 && (
                          <div className="absolute inset-0 pointer-events-none" style={{
                            backgroundImage: (innerW>=innerH)
                              ? `repeating-linear-gradient(90deg, transparent 0px, transparent calc(${100/segCount}% - 1px), rgba(255,255,255,0.08) calc(${100/segCount}% - 1px), rgba(255,255,255,0.08) calc(${100/segCount}%))`
                              : `repeating-linear-gradient(0deg, transparent 0px, transparent calc(${100/segCount}% - 1px), rgba(255,255,255,0.08) calc(${100/segCount}% - 1px), rgba(255,255,255,0.08) calc(${100/segCount}%))`
                          }}/>
                        )}
                        <div className="absolute inset-0 flex items-start justify-between p-1">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
                                style={{ background:"rgba(255,255,255,0.85)", color: bed.is_greenhouse?"#2d5016":"#3e2723", boxShadow:"0 1px 2px rgba(0,0,0,0.15)", maxWidth:"70%", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}
                                title={bed.name}>{bed.name}</span>
                          <div className="flex items-center gap-1">
                            {plantings.some(p=>p.garden_bed_id===bed.id && (conflictsMap.get(p.id)?.length??0)>0) && (
                              <button className="text-[11px] px-1.5 py-0.5 rounded bg-red-600/90 text-white"
                                      onClick={(e)=>{ e.stopPropagation(); setView("conflicts"); localStorage.setItem("plannerOpenTab","conflicts");}}
                                      title="Conflicten bekijken">⚠️</button>
                            )}
                            {bed.is_greenhouse && (<span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-700">Kas</span>)}
                          </div>
                        </div>
                        <div className="absolute inset-0 grid"
                             style={{ gridTemplateColumns: (innerW>=innerH)?`repeat(${segCount}, 1fr)`:"1fr", gridTemplateRows: (innerW>=innerH)?"1fr":`repeat(${segCount}, 1fr)` }}>
                          {Array.from({length:segCount},(_,i)=>(<div key={i} className="relative"><MapDroppable id={`bed__${bed.id}__segment__${i}`}/></div>))}
                        </div>
                        <div className="absolute inset-0">
                          {active.map(p=>{
                            const seed=seedsById[p.seed_id];
                            const start=p.start_segment??0; const used=Math.max(1,p.segments_used??1);
                            const inset=2;
                            const segW=(innerW>=innerH)?(innerW/segCount):innerW;
                            const segH=(innerW>=innerH)?innerH:(innerH/segCount);
                            const rect=(innerW>=innerH)
                              ? { top: inset, height: Math.max(1, innerH-inset*2), left: inset + start*segW, width: Math.max(1, used*segW-inset*2) }
                              : { left: inset, width: Math.max(1, innerW-inset*2), top: inset + start*segH, height: Math.max(1, used*segH-inset*2) };
                            const color = p.color?.startsWith("#") ? p.color : "#22c55e";
                            const textColor=getContrastTextColor(color);
                            return (
                              <div key={p.id} className="absolute rounded text-[10px] px-1 flex items-center overflow-hidden"
                                   style={{ ...rect, backgroundColor: color, color: textColor }}
                                   title={`${seed?.name ?? "—"} • ${fmtDMY(p.planned_date)} → ${fmtDMY(p.planned_harvest_end)}`}>
                                <div className="relative z-20 truncate"><span className="truncate">{seed?.name ?? "—"}</span></div>
                                <div className="absolute top-0.5 right-0.5 flex gap-0.5 z-20">
                                  <button className="p-0.5 rounded hover:bg-white/20" title="Bewerken"
                                          onClick={(e)=>{e.stopPropagation(); setPopup({mode:"edit", planting:p, seed:seed!, bed, segmentIndex:p.start_segment??0});}}>
                                    <Edit3 className="w-3 h-3"/>
                                  </button>
                                  <button className="p-0.5 rounded hover:bg-white/20" title="Verwijderen"
                                          onClick={(e)=>{e.stopPropagation(); if(confirm("Verwijderen?")) deletePlanting(p.id).then(reload);}}>
                                    <Trash2 className="w-3 h-3"/>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
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

  /* ===== conflicts view ===== */
  const conflictsView = useMemo(() => {
    if (conflictCount === 0) {
      return <div className="p-6 text-center text-muted-foreground">Geen conflicten gevonden. 🎉</div>;
    }
    // Build unique conflict pairs with details
    const seen = new Set<string>();
    const pairs: Array<{ a: Planting; b: Planting; aSeed: Seed | undefined; bSeed: Seed | undefined; aBed: GardenBed | undefined; bBed: GardenBed | undefined }> = [];
    const bedsById = Object.fromEntries(beds.map(b => [b.id, b]));
    for (const [id, arr] of conflictsMap) {
      for (const other of arr) {
        const key = id < other.id ? `${id}::${other.id}` : `${other.id}::${id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const a = plantings.find(p => p.id === id)!;
        const b = other;
        pairs.push({ a, b, aSeed: seedsById[a.seed_id], bSeed: seedsById[b.seed_id], aBed: bedsById[a.garden_bed_id], bBed: bedsById[b.garden_bed_id] });
      }
    }
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">{conflictCount} conflict{conflictCount !== 1 ? "en" : ""}</h3>
        {pairs.map(({ a, b, aSeed, bSeed, aBed }, idx) => {
          const aStart = parseISO(a.planned_date);
          const aEnd = parseISO(a.planned_harvest_end);
          const bStart = parseISO(b.planned_date);
          const bEnd = parseISO(b.planned_harvest_end);
          // Calculate overlap
          let overlapDays = 0;
          if (aStart && aEnd && bStart && bEnd) {
            const oStart = aStart > bStart ? aStart : bStart;
            const oEnd = aEnd < bEnd ? aEnd : bEnd;
            overlapDays = Math.max(0, Math.round((oEnd.getTime() - oStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);
          }
          const overlapWeeks = Math.ceil(overlapDays / 7);
          const aSegStart = (a.start_segment ?? 0) + 1;
          const aSegEnd = aSegStart + (a.segments_used ?? 1) - 1;
          const bSegStart = (b.start_segment ?? 0) + 1;
          const bSegEnd = bSegStart + (b.segments_used ?? 1) - 1;
          const overlapSegStart = Math.max(aSegStart, bSegStart);
          const overlapSegEnd = Math.min(aSegEnd, bSegEnd);

          return (
            <div key={idx} className="p-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-red-800 dark:text-red-300">
                <AlertTriangle className="w-4 h-4" />
                Conflict in {aBed?.name ?? "onbekende bak"}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2 rounded-md bg-card border border-border space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: a.color ?? aSeed?.default_color ?? "#22c55e" }} />
                    <span className="text-sm font-medium">{aSeed?.name ?? "—"}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{fmtDMY(a.planned_date)} → {fmtDMY(a.planned_harvest_end)}</p>
                  <p className="text-[11px] text-muted-foreground">Segment {aSegStart}{aSegEnd !== aSegStart ? `–${aSegEnd}` : ""}</p>
                </div>
                <div className="p-2 rounded-md bg-card border border-border space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: b.color ?? bSeed?.default_color ?? "#22c55e" }} />
                    <span className="text-sm font-medium">{bSeed?.name ?? "—"}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{fmtDMY(b.planned_date)} → {fmtDMY(b.planned_harvest_end)}</p>
                  <p className="text-[11px] text-muted-foreground">Segment {bSegStart}{bSegEnd !== bSegStart ? `–${bSegEnd}` : ""}</p>
                </div>
              </div>
              <div className="text-xs text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30 rounded-md p-2 space-y-0.5">
                <p className="font-medium">Overlap: {overlapDays} dagen ({overlapWeeks} {overlapWeeks === 1 ? "week" : "weken"})</p>
                <p>Overlappende segmenten: {overlapSegStart}{overlapSegEnd !== overlapSegStart ? `–${overlapSegEnd}` : ""}</p>
              </div>
            </div>
          );
        })}
      </div>
    );
  }, [conflictCount, conflictsMap, plantings, seedsById, beds]);

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col overflow-hidden -mx-6 -mb-6">
      <header className="flex-shrink-0 bg-background border-b z-30 px-6">
        <div className="py-3 flex items-center justify-between">
          <h2 className="text-2xl font-bold flex items-center gap-3">
            Planner
            {hasConflicts && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
                ⚠️ {conflictCount} conflict{conflictCount!==1?"en":""}
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center p-0.5 bg-muted/40 rounded-lg">
              <button className="px-3 py-2 text-sm font-medium rounded-md hover:bg-background transition-colors" onClick={()=>setCurrentWeek(addDays(currentWeek,-7))}>←</button>
              <span className="px-4 py-2 font-semibold text-sm min-w-[160px] text-center">
                WK {weekOf(currentWeek)}{" "}
                <span className="text-muted-foreground font-normal">
                  ({format(currentWeek,"d MMM",{locale:nl})} - {format(addDays(currentWeek,6),"d MMM",{locale:nl})})
                </span>
              </span>
              <button className="px-3 py-2 text-sm font-medium rounded-md hover:bg-background transition-colors" onClick={()=>setCurrentWeek(addDays(currentWeek,7))}>→</button>
            </div>
            <button className="px-3 py-2 text-sm font-medium rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-all" onClick={gotoToday}>
              Vandaag
            </button>
          </div>
        </div>

        <div className="pb-3 flex items-center gap-2">
          {([
            { key:"list", label:"Lijstweergave" },
            { key:"map", label:"Plattegrond" },
            { key:"timeline", label:"Timeline" },
            { key:"harvest", label:"Oogstagenda" },
            { key:"conflicts", label:"Conflicten" },
          ] as const).map(({key,label})=>{
            const active=view===key; const danger=key==="conflicts" && conflictCount>0;
            return (
              <button key={key} onClick={()=>setView(key as any)}
                      className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                        active ? (danger?"bg-red-600 text-white shadow-sm":"bg-primary text-primary-foreground shadow-sm")
                               : (danger?"bg-red-50 text-red-700 hover:bg-red-100":"text-muted-foreground hover:text-foreground hover:bg-muted")
                      }`}>
                {label}
                {key==="conflicts" && conflictCount>0 && <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-white/20">{conflictCount}</span>}
              </button>
            );
          })}
        </div>
      </header>

      {hasConflicts && (<div className="px-6 py-2 flex-shrink-0"><ConflictWarning conflictCount={conflictCount}/></div>)}

      <DndContext onDragStart={(e)=>setActiveDragId(String(e.active?.id??""))} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 min-h-0">
          {(view==="list" || view==="map" || view==="timeline") && (
            <SeedsSidebar seeds={seeds} cropTypes={cropTypes} plantings={plantings} activeDragId={activeDragId}
                          onSeedInfoClick={(seed)=>setSeedDetailsModal(seed)}/>
          )}

          <div className="flex-1 overflow-auto">
            {view==="list" && listViewContent}

            {view==="map" && (
              <div className="p-6 h-full flex flex-col gap-4">
                <div className="flex items-center justify-between bg-card rounded-lg border px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">Plantingen voor:</span>
                    <span className="font-medium">
                      Week {weekOf(currentWeek)} • {format(currentWeek,"d MMM",{locale:nl})} - {format(addDays(currentWeek,6),"d MMM yyyy",{locale:nl})}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">{plantingsForMap.length} planting{plantingsForMap.length!==1?"en":""}</span>
                </div>
                <div className="flex-1 min-h-0 relative">
                  <GardenPlotCanvas
                    beds={beds}
                    readOnly={true}
                    plantings={plantingsForMap}
                    plotObjects={plotObjects.map(o=>({ id:o.id, type:o.type as any, x:o.x, y:o.y, w:o.w, h:o.h, label:o.label??undefined, zIndex:o.z_index }))}
                    onBedMove={async(id,x,y)=>{ try{ await updateBed(id,{location_x:Math.round(x), location_y:Math.round(y)}); await reload(); }catch(e:any){ console.error("Kon positie niet opslaan:", e);} }}
                    renderBedOverlay={(bed)=>{
                      const segCount=Math.max(1,bed.segments||1);
                      const vertical=bed.width_cm>bed.length_cm;
                      return (
                        <div className="absolute inset-0 grid"
                             style={{ gridTemplateColumns: vertical?`repeat(${segCount},1fr)`:"1fr", gridTemplateRows: vertical?"1fr":`repeat(${segCount},1fr)`}}>
                          {Array.from({length:segCount},(_,i)=>(<div key={i} className="relative"><MapDroppable id={`bed__${bed.id}__segment__${i}`}/></div>))}
                        </div>
                      );
                    }}
                  />
                </div>
              </div>
            )}

            {view==="timeline" && (
              <div className="p-6">
                <CapacityTimelineView
                  beds={beds||[]}
                  plantings={plantings||[]}
                  seeds={seeds||[]}
                  currentWeek={currentWeek}
                  onReload={reload}
                  onPlantClick={(p)=>{
                    const bed=beds.find(b=>b.id===p.garden_bed_id)!;
                    const seed=seedsById[p.seed_id]!;
                    setPopup({ mode:"edit", planting:p, seed, bed, segmentIndex:p.start_segment??0 });
                  }}
                  onPlantDelete={async(p)=>{
                    if(confirm("Verwijderen?")) { await deletePlanting(p.id); reload(); }
                  }}
                />
              </div>
            )}

            {view==="harvest" && (
              <div className="p-6">
                <HarvestAgendaView beds={beds||[]} seeds={seeds||[]} plantings={plantings||[]} cropTypes={cropTypes||[]} greenhouseOnly={false} cropTypeFilters={[]}/>
              </div>
            )}

            {view==="conflicts" && <div className="p-6">{conflictsView}</div>}
          </div>
        </div>

        <DragOverlay dropAnimation={{ duration:200, easing:"ease-out" }}>
          {activeSeed ? (
            <div 
              className="w-7 h-7 rounded-md border-2 border-white/80 shadow-lg pointer-events-none"
              style={{ 
                background: activeSeed.default_color?.startsWith("#") ? activeSeed.default_color : "#22c55e",
                transform: "translate(-4px, -4px) rotate(-8deg)"
              }}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Planting popup */}
      {popup && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={()=>setPopup(null)}>
          <div className="bg-card/95 backdrop-blur-md rounded-2xl shadow-2xl w-full max-w-lg border border-border/50 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200" onClick={(e)=>e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/30 bg-gradient-to-r from-primary/5 to-transparent">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full ring-2 ring-white shadow-md"
                     style={{ background: popup.mode==="create" ? (popup.seed.default_color?.startsWith("#") ? popup.seed.default_color : "#22c55e") : (popup.planting.color ?? "#22c55e") }}/>
                <div>
                  <h3 className="text-lg font-semibold">{popup.mode==="create"?"Nieuwe planting":"Planting bewerken"}</h3>
                  <p className="text-xs text-muted-foreground">{popup.seed.name}</p>
                </div>
              </div>
              <button onClick={()=>setPopup(null)} className="p-2 rounded-full hover:bg-muted/50 transition-colors">
                <X className="h-4 w-4 text-muted-foreground"/>
              </button>
            </div>

            <div className="p-5">
              <PlantingForm
                seedsById={seedsById}
                mode={popup.mode}
                seed={popup.seed}
                bed={popup.bed}
                beds={beds}
                defaultSegment={popup.segmentIndex}
                defaultDateISO={popup.mode==="edit" ? (popup.planting.planned_date ?? toISO(addDays(currentWeek,4))) : (popup.defaultDateISO ?? toISO(addDays(currentWeek,4)))}
                existing={popup.mode==="edit" ? popup.planting : undefined}
                allPlantings={plantings}
                onCancel={()=>setPopup(null)}
                onConfirm={async (startSegment,segmentsUsed,method,date,color,bedId)=>{
                  const target = popup.mode==="create"
                    ? { seed: popup.seed, bed: beds.find(b=>b.id===bedId)!, segmentIndex:startSegment }
                    : { seed: popup.seed, bed: beds.find(b=>b.id===bedId)!, segmentIndex:startSegment, planting: popup.planting };
                  await handleConfirmPlanting({ mode: popup.mode, target: target as any, startSegment, segmentsUsed, method, dateISO:date, color, bedIdOverride:bedId });
                }}
              />
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 px-4 py-2 rounded shadow text-sm ${toast.tone==="ok"?"bg-green-600 text-white":toast.tone==="err"?"bg-red-600 text-white":"bg-gray-800 text-white"}`}>
          {toast.msg}
        </div>
      )}

      {seedDetailsModal && (
        <SeedModal gardenId={garden.id} seed={seedDetailsModal}
                   onClose={()=>setSeedDetailsModal(null)}
                   onSaved={async()=>{ await onDataChange(); setSeedDetailsModal(null); }}/>
      )}
    </div>
  );
}

/* ===== PlantingForm ===== */
function PlantingForm({
  mode, seed, bed, defaultSegment, defaultDateISO, existing, beds, allPlantings, seedsById: seedsByIdProp, onCancel, onConfirm,
}:{
  mode:"create"|"edit"; seed:Seed; bed:GardenBed; defaultSegment:number; defaultDateISO:string; existing?:Planting;
  beds:GardenBed[]; allPlantings:Planting[]; seedsById:Record<string,Seed|undefined>; onCancel:()=>void;
  onConfirm:(startSegment:number,segmentsUsed:number,method:"direct"|"presow",dateISO:string,color:string,bedId:string)=>void;
}){
  const [segmentsUsedStr,setSegmentsUsedStr]=useState<string>(String(existing?.segments_used ?? 1));
  const segmentsUsed=Math.max(1,parseInt(segmentsUsedStr,10)||1);
  const [method,setMethod]=useState<"direct"|"presow">(existing?.method ?? (seed.sowing_type==="both"?"direct":(seed.sowing_type as any) ?? "direct"));
  const [date,setDate]=useState<string>(existing?.planned_date ?? defaultDateISO);
  const [color,setColor]=useState<string>(()=> existing?.color?.startsWith("#") ? existing.color as string : seed.default_color?.startsWith("#") ? seed.default_color! : "#22c55e");
  const [bedId,setBedId]=useState<string>(existing?.garden_bed_id ?? bed.id);
  const [startSegment,setStartSegment]=useState<number>(existing?.start_segment ?? defaultSegment);
  const [monthDialogOpen,setMonthDialogOpen]=useState(false);
  const [datePickerOpen,setDatePickerOpen]=useState(false);

  const selectedBed=useMemo(()=> beds.find(x=>x.id===bedId) ?? bed,[beds,bedId,bed]);
  const plantDate=useMemo(()=> parseISO(date) ?? new Date(),[date]);
  const addWeeks=(d:Date,w:number)=>{ const x=new Date(d); x.setDate(x.getDate()+w*7); return x; };
  const addDays=(d:Date,n:number)=>{ const x=new Date(d); x.setDate(x.getDate()+n); return x; };
  const hs=useMemo(()=> addWeeks(plantDate, seed.grow_duration_weeks ?? 0),[plantDate, seed.grow_duration_weeks]);
  const he=useMemo(()=> addDays(addWeeks(hs, seed.harvest_duration_weeks ?? 0), -1),[hs, seed.harvest_duration_weeks]);

  const findAllStartSegments = (plantings: Planting[], bed: GardenBed, segUsed: number, start: Date, end: Date, ignoreId?: string) => {
    const intervalOverlap=(aS:Date,aE:Date,bS:Date,bE:Date)=> aS<=bE && bS<=aE;
    const segmentsOverlap=(aS:number,aU:number,bS:number,bU:number)=> (aS<=bS+bU-1) && (bS<=aS+aU-1);
    const maxStart=Math.max(0,(bed.segments??1)-Math.max(1,segUsed));
    const out:number[]=[];
    for(let seg=0; seg<=maxStart; seg++){
      let ok=true;
      for(const p of plantings){
        if(p.garden_bed_id!==bed.id) continue;
        if(ignoreId && p.id===ignoreId) continue;
        const s=parseISO(p.planned_date), e=parseISO(p.planned_harvest_end); if(!s||!e) continue;
        if(!intervalOverlap(start,end,s,e)) continue;
        const ps=p.start_segment??0, pu=p.segments_used??1;
        if(segmentsOverlap(seg,Math.max(1,segUsed),ps,pu)){ ok=false; break; }
      }
      if(ok) out.push(seg);
    }
    return out;
  };

  const validBeds=useMemo(()=> (beds||[]).filter(b=>{
    if(b.is_greenhouse && !seed.greenhouse_compatible) return false;
    const canSomewhere=findAllStartSegments(allPlantings,b,segmentsUsed,plantDate,he,existing?.id).length>0;
    return canSomewhere;
  }),[beds,seed.greenhouse_compatible,allPlantings,segmentsUsed,plantDate,he,existing?.id]);

  const startSegmentOptions=useMemo(()=> findAllStartSegments(allPlantings,selectedBed,segmentsUsed,plantDate,he,existing?.id),
                                    [allPlantings,selectedBed,segmentsUsed,plantDate,he,existing?.id]);

  useEffect(()=>{ if(!startSegmentOptions.includes(startSegment)){ setStartSegment(startSegmentOptions.length>0?startSegmentOptions[0]:0); }},[startSegmentOptions]); // eslint-disable-line

  const monthWarning=useMemo(()=>{
    if(!date) return null;
    const dt=parseISO(date); if(!dt||Number.isNaN(dt.getTime())) return null;
    const month=dt.getMonth()+1;
    const names=["","januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
    const isGH=!!selectedBed.is_greenhouse;
    const allowed=isGH ? (seed.greenhouse_months ?? []) : (seed.direct_plant_months ?? []);
    if(allowed.length===0) return null;
    if(allowed.includes(month)) return null;
    const list=allowed.map(m=>names[m]).join(", ");
    return { title:"Maand niet geschikt", description:`"${seed.name}" mag niet in ${names[month]} in ${isGH?"de kas":"de volle grond"} (${selectedBed.name}) worden geplant. Toegestane maanden: ${list}.` };
  },[date,seed,selectedBed]);

  const maxSegSpinner=Math.max(1,selectedBed.segments);

  return (
    <form onSubmit={(e)=>{e.preventDefault(); if(monthWarning){ setMonthDialogOpen(true); return;} onConfirm(startSegment,segmentsUsed,method, date, color, bedId);}} className="space-y-5">
      <AlertDialog open={monthDialogOpen} onOpenChange={setMonthDialogOpen}>
        <AlertDialogContent className="bg-card/95 backdrop-blur-md border-border/50">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600"><AlertTriangle className="h-5 w-5"/>{monthWarning?.title ?? "Maand niet geschikt"}</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">{monthWarning?.description ?? "Deze maand lijkt niet te kloppen voor dit gewas."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Terug</AlertDialogCancel>
            <AlertDialogAction className="bg-amber-600 hover:bg-amber-700 rounded-lg" onClick={()=>{ setMonthDialogOpen(false); onConfirm(startSegment,segmentsUsed,method, date, color, bedId); }}>
              Toch opslaan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bak */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Bak</label>
        <Select value={bedId} onValueChange={setBedId}>
          <SelectTrigger className="w-full bg-muted/30 border-0 rounded-lg h-10 focus:ring-2 focus:ring-primary/20">
            <SelectValue placeholder="Selecteer bak"/>
          </SelectTrigger>
          <SelectContent className="bg-popover/95 backdrop-blur-md border-border/50">
            {validBeds.length===0 && <SelectItem value={bed.id}>{bed.name}</SelectItem>}
            {validBeds.map(b=>(
              <SelectItem key={b.id} value={b.id}>
                <span className="flex items-center gap-2">
                  {b.name}
                  {b.is_greenhouse && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-600">kas</span>}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {validBeds.length===0 && (
          <div className="text-[11px] text-red-600 space-y-1 mt-1">
            <p className="font-medium">Geen bakken beschikbaar op deze datum.</p>
            {(() => {
              const overlaps = listOverlaps(allPlantings, seedsByIdProp, selectedBed.id, startSegment, segmentsUsed, plantDate, he, existing?.id);
              if (overlaps.length === 0) return null;
              return (
                <div className="p-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                  <p className="font-medium mb-1">Blokkerende teelten:</p>
                  {overlaps.map((o, idx) => {
                    const overlapStart = parseISO(o.fromISO)!;
                    const overlapEnd = parseISO(o.toISO)!;
                    const overlapDays = Math.round((overlapEnd.getTime() - overlapStart.getTime()) / (1000*60*60*24)) + 1;
                    return (
                      <div key={idx} className="flex items-center gap-1 text-[10px] text-red-700 dark:text-red-400">
                        <span>• "{o.seedName}"</span>
                        <span className="text-muted-foreground">{fmtDMY(o.fromISO)} – {fmtDMY(o.toISO)}</span>
                        <span className="font-medium">({overlapDays} dgn overlap, seg {o.segFrom}–{o.segTo})</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Segment + Aantal */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Startsegment</label>
          <Select value={String(startSegment)} onValueChange={(v)=>setStartSegment(parseInt(v,10))}>
            <SelectTrigger className="w-full bg-muted/30 border-0 rounded-lg h-10 focus:ring-2 focus:ring-primary/20">
              <SelectValue placeholder="Segment"/>
            </SelectTrigger>
            <SelectContent className="bg-popover/95 backdrop-blur-md border-border/50">
              {startSegmentOptions.map(s=> (<SelectItem key={s} value={String(s)}>Segment {s+1}</SelectItem>))}
            </SelectContent>
          </Select>
          {startSegmentOptions.length===0 && (
            <div className="text-[11px] text-red-600 space-y-0.5">
              <p className="font-medium">Geen vrij segment.</p>
              {(() => {
                const overlaps = listOverlaps(allPlantings, seedsByIdProp, selectedBed.id, startSegment, segmentsUsed, plantDate, he, existing?.id);
                if (overlaps.length === 0) return null;
                return overlaps.map((o, idx) => {
                  const overlapStart = parseISO(o.fromISO)!;
                  const overlapEnd = parseISO(o.toISO)!;
                  const overlapDays = Math.round((overlapEnd.getTime() - overlapStart.getTime()) / (1000*60*60*24)) + 1;
                  const overlapWeeks = Math.ceil(overlapDays / 7);
                  return (
                    <p key={idx} className="text-[10px] text-red-700 dark:text-red-400">
                      • "{o.seedName}" blokkeert seg {o.segFrom}–{o.segTo} ({overlapDays} dgn / {overlapWeeks} wk overlap)
                    </p>
                  );
                });
              })()}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Segmenten</label>
          <div className="relative">
            <input type="number" min={1} max={maxSegSpinner} value={segmentsUsedStr}
                   onChange={(e)=>setSegmentsUsedStr(e.target.value)}
                   onBlur={()=>{ if(!segmentsUsedStr.trim() || parseInt(segmentsUsedStr,10)<1) setSegmentsUsedStr("1"); else if(parseInt(segmentsUsedStr,10)>maxSegSpinner) setSegmentsUsedStr(String(maxSegSpinner)); }}
                   className="w-full bg-muted/30 border-0 rounded-lg h-10 px-3 pr-12 text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"/>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">stuks</span>
          </div>
        </div>
      </div>

      {/* Zaaimethode */}
      {seed.sowing_type==="both" ? (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Zaaimethode</label>
          <div className="flex p-1 bg-muted/30 rounded-lg">
            <button type="button" onClick={()=>setMethod("direct")}
                    className={cn("flex-1 px-3 py-2 text-xs font-medium rounded-md transition-all", method==="direct"?"bg-background text-foreground shadow-sm":"text-muted-foreground hover:text-foreground")}>
              Direct zaaien
            </button>
            <button type="button" onClick={()=>setMethod("presow")}
                    className={cn("flex-1 px-3 py-2 text-xs font-medium rounded-md transition-all", method==="presow"?"bg-background text-foreground shadow-sm":"text-muted-foreground hover:text-foreground")}>
              Voorzaaien
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Zaaimethode</label>
          <p className="text-sm px-3 py-2 bg-muted/20 rounded-lg">{seed.sowing_type==="presow"?"Voorzaaien":"Direct zaaien"}</p>
        </div>
      )}

      {/* Datum + Kleur */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Zaai/Plantdatum</label>
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <button type="button" className={cn("w-full bg-muted/30 border-0 rounded-lg h-10 px-3 text-left text-sm flex items-center gap-2 focus:ring-2 focus:ring-primary/20 transition-all hover:bg-muted/50", !date && "text-muted-foreground")}>
                <CalendarIcon className="h-4 w-4 text-muted-foreground"/>
                {date ? format(parseISO(date) ?? new Date(),"d MMM yyyy",{locale:nl}) : "Kies datum"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-popover/95 backdrop-blur-md border-border/50" align="start">
              <Calendar mode="single" selected={parseISO(date) ?? undefined}
                        onSelect={(d)=>{ if(d){ setDate(toISO(d)); setDatePickerOpen(false);} }} initialFocus className="pointer-events-auto"/>
            </PopoverContent>
          </Popover>
          <p className="text-[10px] text-muted-foreground">Bezet t/m {fmtDMY(toISO(he))}</p>
          {/* Voorzaai informatie */}
          {method === "presow" && seed.presow_duration_weeks && seed.presow_duration_weeks > 0 && date && (() => {
            const presowDate = addWeeks(plantDate, -(seed.presow_duration_weeks!));
            const presowMonth = presowDate.getMonth() + 1;
            const presowMonths = seed.presow_months ?? [];
            const monthNames = ["","jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
            const monthOk = presowMonths.length === 0 || presowMonths.includes(presowMonth);
            return (
              <div className={`mt-1 p-2 rounded-md text-[11px] space-y-0.5 ${monthOk ? "bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800" : "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800"}`}>
                <div className="flex items-center gap-1.5">
                  <span className="font-medium">{monthOk ? "🌱" : "⚠️"} Voorzaaien:</span>
                  <span className="font-semibold">{format(presowDate, "d MMM yyyy", { locale: nl })}</span>
                  <span className="text-muted-foreground">({seed.presow_duration_weeks} wk voor plantdatum)</span>
                </div>
                {monthOk ? (
                  <p className="text-muted-foreground">
                    ✓ {monthNames[presowMonth]} valt binnen voorzaaimaanden
                    {presowMonths.length > 0 && <span> ({presowMonths.map(m => monthNames[m]).join(", ")})</span>}
                  </p>
                ) : (
                  <p className="text-red-700 dark:text-red-400 font-medium">
                    ✗ {monthNames[presowMonth]} valt NIET in voorzaaimaanden ({presowMonths.map(m => monthNames[m]).join(", ")})
                  </p>
                )}
              </div>
            );
          })()}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Kleur</label>
          <div className="flex items-center gap-3">
            <input type="color" value={color} onChange={(e)=>setColor(e.target.value)}
                   className="w-10 h-10 rounded-full cursor-pointer border-2 border-white shadow-md overflow-hidden [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-full appearance-none bg-transparent"/>
            <input value={color} onChange={(e)=>setColor(e.target.value)}
                   className="flex-1 bg-muted/30 border-0 rounded-lg h-10 px-3 text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none font-mono" placeholder="#22c55e"/>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-border/30">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium rounded-lg bg-muted/50 hover:bg-muted transition-colors">Annuleren</button>
        <button type="submit" disabled={startSegmentOptions.length===0} className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          {mode==="create"?"Planting toevoegen":"Wijzigingen opslaan"}
        </button>
      </div>
    </form>
  );
}

export default PlannerPage;
