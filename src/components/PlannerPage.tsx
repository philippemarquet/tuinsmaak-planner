// src/components/PlannerPage.tsx — met nieuwe CapacityTimelineView (maand-overzicht + drag op dagniveau)
// Houdt bestaande tabs (Lijst, Plattegrond, Oogstagenda, Conflicten) intact.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Garden, GardenBed, Planting, Seed, CropType, UUID, Task } from "../lib/types";
import { GardenPlotCanvas } from "./GardenPlotCanvas";
import { createPlanting, updatePlanting, deletePlanting } from "../lib/api/plantings";
import { updateBed } from "../lib/api/beds";
import { listPlotObjects, type PlotObject as APIPlotObject } from "../lib/api/plotObjects";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { supabase } from "../lib/supabaseClient";
import { buildConflictsMap, countUniqueConflicts } from "../lib/conflicts";
import { ConflictWarning } from "./ConflictWarning";
import { useConflictFlags } from "../hooks/useConflictFlags";
import { SeedModal } from "./SeedModal";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
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
import {
  Edit3,
  Trash2,
  ChevronDown,
  Info,
  AlertTriangle,
  X,
  CalendarIcon,
  Search,
  Leaf,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";

// Nieuwe compacte timeline
import CapacityTimelineView from "./CapacityTimelineView";
// Oogstagenda als losse component (bestaand)
import HarvestAgendaView from "./HarvestAgendaView";
// Sidebar (bestaand)
import { SeedsSidebar } from "./SeedsSidebar";

/* =========================================
   Icon helpers + overlay
========================================= */
const ICON_BUCKET = "crop-icons";
const iconUrlCache = new Map<string, string>();

function getPublicIconUrl(iconKey?: string | null): string | null {
  if (!iconKey) return null;
  const cached = iconUrlCache.get(iconKey);
  if (cached) return cached;
  const { data } = supabase.storage.from(ICON_BUCKET).getPublicUrl(iconKey);
  const url = data?.publicUrl ?? null;
  if (url) iconUrlCache.set(iconKey, url);
  return url;
}

function getEffectiveIconUrl(seed: Seed | undefined, cropTypesById: Map<string, CropType>): string | null {
  if (!seed) return null;
  const own = getPublicIconUrl((seed as any).icon_key);
  if (own) return own;
  const ct = seed.crop_type_id ? cropTypesById.get(seed.crop_type_id) : undefined;
  return getPublicIconUrl((ct as any)?.icon_key);
}

/* ===== helpers ===== */
// Format Date to YYYY-MM-DD in local time (avoids timezone shift)
const toISO = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addWeeks = (d: Date, w: number) => addDays(d, w * 7);
// Parse YYYY-MM-DD string to local Date
const parseISO = (x?: string | null) => {
  if (!x) return null; const [y,m,da] = x.split('-').map(Number); return new Date(y, m-1, da);
};
const fmtDMY = (iso?: string | null) => (!iso ? "—" : new Date(iso).toLocaleDateString("nl-NL"));
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const weekOf = (d: Date) => {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil((((dt as any) - (yearStart as any)) / 86400000 + 1) / 7);
};

function planFromGroundDate(seed: Seed, method: "direct" | "presow", groundISO: string) {
  const ground = new Date(groundISO);
  const growW = seed.grow_duration_weeks ?? 0;
  const harvestW = seed.harvest_duration_weeks ?? 0;
  const hsISO = toISO(addWeeks(ground, growW));
  const heDate = addDays(addWeeks(new Date(hsISO), harvestW), -1);
  const heISO = toISO(heDate);
  const presow = method === "presow" && seed.presow_duration_weeks ? toISO(addWeeks(ground, -(seed.presow_duration_weeks ?? 0))) : null;
  return { planned_date: groundISO, planned_presow_date: presow, planned_harvest_start: hsISO, planned_harvest_end: heISO };
}

/* overlap helpers — bed bezetting = ground→harvest_end */
function intervalOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart <= bEnd && bStart <= aEnd;
}
function segmentsOverlap(aStartSeg: number, aUsed: number, bStartSeg: number, bUsed: number) {
  const aEnd = aStartSeg + aUsed - 1, bEnd = bStartSeg + bUsed - 1;
  return aStartSeg <= bEnd && bStartSeg <= aEnd;
}
function wouldOverlapWith(
  plantings: Planting[],
  bedId: string,
  startSeg: number,
  segUsed: number,
  start: Date,
  end: Date,
  ignoreId?: string,
  extras?: Array<{ bed_id: string; startSeg: number; segUsed: number; start: Date; end: Date }>
) {
  for (const p of plantings) {
    if (p.garden_bed_id !== bedId) continue;
    if (ignoreId && p.id === ignoreId) continue;
    const s = parseISO(p.planned_date);
    const e = parseISO(p.planned_harvest_end);
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
function findAllStartSegments(
  plantings: Planting[],
  bed: GardenBed,
  segUsed: number,
  start: Date,
  end: Date,
  ignoreId?: string
) {
  const maxStart = Math.max(0, (bed.segments ?? 1) - Math.max(1, segUsed));
  const out: number[] = [];
  for (let seg = 0; seg <= maxStart; seg++) {
    if (!wouldOverlapWith(plantings, bed.id, seg, Math.max(1, segUsed), start, end, ignoreId)) out.push(seg);
  }
  return out;
}

/* ===== tiny UI bits ===== */
function Chip({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "warn" | "danger" }) {
  const map = {
    muted: "bg-muted text-foreground/80",
    warn: "bg-amber-100 text-amber-900",
    danger: "bg-red-100 text-red-800",
  } as const;
  return <span className={`inline-flex items-center rounded px-1 py-0.5 text-[9px] ${map[tone]}`}>{children}</span>;
}

function DraggableSeed({ seed, isDragging = false, onInfoClick }: { seed: Seed; isDragging?: boolean; onInfoClick?: () => void }) {
  // DnD bron wordt in SeedsSidebar geregeld; hier alleen overlay visuals
  const color = seed.default_color?.startsWith("#") ? seed.default_color : "#22c55e";
  return (
    <div className={`px-3 py-2 rounded-lg border-2 border-primary bg-card text-sm flex items-center gap-3 pointer-events-none shadow-xl ${isDragging ? "opacity-60" : ""}`}>
      <div className="w-4 h-4 rounded-full shadow-inner ring-2 ring-white" style={{ background: color }} />
      <span className="font-medium truncate max-w-[180px]">{seed.name}</span>
    </div>
  );
}

function DroppableSegment({ id, occupied, children }: { id: string; occupied: boolean; children: React.ReactNode }) {
  // List view droppable cell
  // Implementatie zit in je bestaande DroppableSegment component elders; deze is hier ter referentie indien nodig.
  return (
    <div className={`relative border border-dashed rounded min-h-[18px] flex items-center justify-center transition-all duration-150 ${occupied ? "border-emerald-300/50 bg-emerald-50/20" : "border-muted-foreground/15 bg-muted/10 hover:border-muted-foreground/25"}`}>
      {children}
    </div>
  );
}

function MapDroppable({ id }: { id: string }) {
  return <div className="w-full h-full" />;
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
  const [q, setQ] = useState(localStorage.getItem("plannerQ") ?? "");
  const [inStockOnly, setInStockOnly] = useState(() => {
    const migrated = localStorage.getItem("plannerInStockV2");
    if (!migrated) {
      localStorage.setItem("plannerInStockV2", "1");
      localStorage.setItem("plannerInStock", "1");
      return true;
    }
    return localStorage.getItem("plannerInStock") === "1";
  });
  const [inPlanner, setInPlanner] = useState<InPlanner>((localStorage.getItem("plannerInPlanner") as InPlanner) ?? "all");
  const [greenhouseOnly, setGreenhouseOnly] = useState(localStorage.getItem("plannerGHOnly") === "1");
  const [selectedMonths, setSelectedMonths] = useState<number[]>(() => {
    const saved = localStorage.getItem("plannerMonths");
    return saved ? JSON.parse(saved) : [];
  });
  const [cropTypeFilters, setCropTypeFilters] = useState<string[]>(() => {
    const saved = localStorage.getItem("plannerCropTypes");
    return saved ? JSON.parse(saved) : [];
  });
  const [seedDetailsModal, setSeedDetailsModal] = useState<Seed | null>(null);

  const [currentWeek, setCurrentWeek] = useState<Date>(() => {
    const saved = localStorage.getItem("plannerWeekISO");
    if (saved) return new Date(saved);
    const n = new Date();
    const d = new Date(n);
    d.setDate(n.getDate() - ((n.getDay() || 7) - 1));
    return d; // maandag
  });

  // toast
  const [toast, setToast] = useState<{ msg: string, tone: "info" | "ok" | "err" } | null>(null);
  const notify = (msg: string, tone: "info" | "ok" | "err" = "info") => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 2500);
  };

  // popups
  const [popup, setPopup] = useState<
    | null
    | { mode: "create"; seed: Seed; bed: GardenBed; segmentIndex: number; defaultDateISO?: string; defaultSegment?: number }
    | { mode: "edit"; planting: Planting; seed: Seed; bed: GardenBed; segmentIndex: number }
  >(null);

  // drag
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const activeSeed = useMemo(
    () => (activeDragId?.startsWith("seed-") ? seeds.find((s) => s.id === activeDragId.replace("seed-", "")) ?? null : null),
    [activeDragId, seeds]
  );

  // Sync met centrale data
  useEffect(() => {
    setBeds(initialBeds);
    setSeeds(initialSeeds);
    setPlantings(initialPlantings);
    setCropTypes(initialCropTypes);
  }, [initialBeds, initialSeeds, initialPlantings, initialCropTypes]);

  // Plot objects for map view (read-only, so just load once)
  const [plotObjects, setPlotObjects] = useState<APIPlotObject[]>([]);
  useEffect(() => {
    if (view === "map" && garden?.id) {
      listPlotObjects(garden.id)
        .then(setPlotObjects)
        .catch((e) => console.error("Failed to load plot objects:", e));
    }
  }, [view, garden?.id]);

  const reload = async () => { await onDataChange(); };
  useEffect(() => {
    const ch = supabase
      .channel("rt-plantings")
      .on("postgres_changes", { event: "*", schema: "public", table: "plantings", filter: `garden_id=eq.${garden.id}` }, () =>
        reload().catch(() => {})
      )
      .subscribe();
    return () => {
      try { supabase.removeChannel(ch); } catch {}
    };
  }, [garden.id]);

  useEffect(() => { localStorage.setItem("plannerView", view); localStorage.removeItem("plannerOpenTab"); }, [view]);
  useEffect(() => { localStorage.setItem("plannerQ", q); }, [q]);
  useEffect(() => { localStorage.setItem("plannerInStock", inStockOnly ? "1" : "0"); }, [inStockOnly]);
  useEffect(() => { localStorage.setItem("plannerInPlanner", inPlanner); }, [inPlanner]);
  useEffect(() => { localStorage.setItem("plannerGHOnly", greenhouseOnly ? "1" : "0"); }, [greenhouseOnly]);
  useEffect(() => { localStorage.setItem("plannerWeekISO", toISO(currentWeek)); }, [currentWeek]);
  useEffect(() => { localStorage.setItem("plannerMonths", JSON.stringify(selectedMonths)); }, [selectedMonths]);
  useEffect(() => { localStorage.setItem("plannerCropTypes", JSON.stringify(cropTypeFilters)); }, [cropTypeFilters]);

  // Focus vanuit dashboard
  const [focusId, setFocusId] = useState<string | null>(localStorage.getItem("plannerConflictFocusId"));
  useEffect(() => {
    if (localStorage.getItem("plannerNeedsAttention") === "1") {
      setView("conflicts");
    }
    localStorage.removeItem("plannerNeedsAttention");
  }, []);

  const seedsById = useMemo(() => Object.fromEntries(seeds.map((s) => [s.id, s])), [seeds]);
  const cropTypesById = useMemo(() => new Map<string, CropType>(cropTypes.map((c) => [c.id, c])), [cropTypes]);
  const outdoorBeds = useMemo(() => beds.filter((b) => !b.is_greenhouse).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)), [beds]);
  const greenhouseBeds = useMemo(() => beds.filter((b) => b.is_greenhouse).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)), [beds]);

  /* ===== plantings overlay for map view (filtered by selected week) ===== */
  const plantingsForMap = useMemo(() => {
    const weekStart = new Date(currentWeek);
    const weekEnd = addDays(weekStart, 6);

    const nextTaskByPlanting = new Map<string, Task>();
    for (const task of tasks) {
      if ((task as any).status !== "pending") continue;
      const existing = nextTaskByPlanting.get((task as any).planting_id);
      if (!existing || new Date((task as any).due_date) < new Date((existing as any).due_date)) {
        nextTaskByPlanting.set((task as any).planting_id, task);
      }
    }

    return (plantings || [])
      .filter((p) => {
        const start = parseISO(p.planned_date);
        const end = parseISO(p.planned_harvest_end);
        if (!start || !end) return false;
        return start <= weekEnd && end >= weekStart;
      })
      .map((p) => {
        const seed = seedsById[p.seed_id ?? ""];
        const iconUrl = getEffectiveIconUrl(seed, cropTypesById);
        const nextTask = nextTaskByPlanting.get(p.id);
        return {
          id: p.id,
          bedId: p.garden_bed_id ?? "",
          startSegment: p.start_segment ?? 0,
          segmentsUsed: p.segments_used ?? 1,
          color: p.color?.startsWith("#") ? p.color : seed?.default_color?.startsWith("#") ? seed.default_color : "#22c55e",
          iconUrl,
          label: seed?.name,
          cropType: seed?.crop_type_id ? cropTypesById.get(seed.crop_type_id)?.name : undefined,
          nextActionType: (nextTask as any)?.type,
          nextActionDate: (nextTask as any)?.due_date,
        };
      });
  }, [plantings, seedsById, cropTypesById, currentWeek, tasks]);

  /* ===== conflicts ===== */
  const conflictsMap = useMemo(() => buildConflictsMap(plantings || [], seeds || []), [plantings, seeds]);
  const conflictCount = useMemo(() => countUniqueConflicts(conflictsMap), [conflictsMap]);
  const { hasConflicts } = useConflictFlags(conflictCount);

  const bedHasConflict = (bedId: UUID) => (plantings || []).some((p) => p.garden_bed_id === bedId && (conflictsMap.get(p.id)?.length ?? 0) > 0);

  /* ===== current week helpers ===== */
  const isActiveInWeek = (p: Planting, week: Date) => {
    const s = parseISO(p.planned_date);
    const e = parseISO(p.planned_harvest_end);
    if (!s || !e) return false;
    const mon = new Date(week);
    const sun = addDays(mon, 6);
    return s <= sun && e >= mon;
  };

  /* ===== filters for seeds sidebar (met maand + categorie) ===== */
  const seedHasPlanned = (seedId: string) => plantings.some((p) => p.seed_id === seedId && p.planned_date);

  const filteredSeeds = useMemo(() => {
    let arr = seeds.slice();
    if (q.trim()) { const t = q.trim().toLowerCase(); arr = arr.filter((s) => s.name.toLowerCase().includes(t)); }
    if (inStockOnly) arr = arr.filter((s: any) => (s as any).in_stock !== false);
    if (greenhouseOnly) arr = arr.filter((s) => !!s.greenhouse_compatible);
    if (inPlanner !== "all") { arr = arr.filter((s) => (inPlanner === "planned" ? seedHasPlanned(s.id) : !seedHasPlanned(s.id))); }
    if (cropTypeFilters.length > 0) {
      arr = arr.filter((s) => {
        if (cropTypeFilters.includes("__none__") && !s.crop_type_id) return true;
        return cropTypeFilters.includes(s.crop_type_id ?? "");
      });
    }
    if (selectedMonths.length > 0) {
      arr = arr.filter((s: any) => {
        const directPlantMonths: number[] = (s as any).direct_plant_months ?? (s as any).direct_sow_months ?? [];
        const greenhouseMonths: number[] = (s as any).greenhouse_months ?? [];
        const hasDirectPlantMatch = Array.isArray(directPlantMonths) && directPlantMonths.some((m) => selectedMonths.includes(m));
        const hasGreenhouseMatch = Array.isArray(greenhouseMonths) && greenhouseMonths.some((m) => selectedMonths.includes(m));
        return hasDirectPlantMatch || hasGreenhouseMatch;
      });
    }
    return arr;
  }, [seeds, q, inStockOnly, inPlanner, greenhouseOnly, plantings, selectedMonths, cropTypeFilters]);

  /* ===== UI: header & tabs ===== */
  const gotoPrevWeek = () => setCurrentWeek(addDays(currentWeek, -7));
  const gotoNextWeek = () => setCurrentWeek(addDays(currentWeek, 7));
  const gotoToday = () => {
    const n = new Date();
    const d = new Date(n);
    d.setDate(n.getDate() - ((n.getDay() || 7) - 1));
    setCurrentWeek(d);
  };

  /* ===== DND ===== */
  function handleDragStart(e: any) { setActiveDragId(String(e.active?.id ?? "")); }
  function handleDragEnd(ev: any) {
    const over = ev.over;
    const active = String(ev.active?.id ?? "");
    setActiveDragId(null);
    if (!over) return;

    const id = String(over.id);
    // Ondersteunt zowel oude list targets: "bed__{bedId}__segment__{i}" als nieuwe timeline targets:
    // "timeline__{bedId}__segment__{i|auto}__date__YYYY-MM-DD"
    const parts = id.split("__");
    const prefix = parts[0];
    const bedId = parts[1];
    const segToken = parts[3];
    const hasDate = parts[4] === "date";
    const dropDateISO = hasDate ? parts[5] : null;

    const bed = beds.find((b) => b.id === bedId);
    if (!prefix || !bed) return;

    // Seed → open popup met juiste datum/segment
    if (active.startsWith("seed-")) {
      const seedId = active.replace("seed-", "");
      const seed = seeds.find((s) => s.id === seedId);
      if (!seed) return;

      let segIndex: number;
      if (segToken === "auto") {
        const plantDate = dropDateISO ? new Date(dropDateISO) : new Date();
        const hs = addWeeks(plantDate, seed.grow_duration_weeks ?? 0);
        const he = addDays(addWeeks(hs, seed.harvest_duration_weeks ?? 0), -1);
        const options = findAllStartSegments(plantings, bed, 1, plantDate, he);
        segIndex = options.length ? options[0] : 0;
      } else {
        segIndex = parseInt(segToken, 10) || 0;
      }

      setPopup({ mode: "create", seed, bed, segmentIndex: segIndex, defaultDateISO: dropDateISO ?? undefined, defaultSegment: segIndex });
      return;
    }

    // Bestaande planting → snelle verplaatsing
    if (active.startsWith("planting-")) {
      const plantingId = active.replace("planting-", "");
      const p = plantings.find((x) => x.id === plantingId);
      if (!p) return;

      const seed = seedsById[p.seed_id];
      if (!seed) return;

      const newDateISO = dropDateISO ?? p.planned_date ?? toISO(new Date());
      const plantDate = parseISO(newDateISO) ?? new Date();
      const segUsed = Math.max(1, p.segments_used ?? 1);

      let targetSeg: number;
      if (segToken === "auto") {
        const hs = addWeeks(plantDate, seed.grow_duration_weeks ?? 0);
        const he = addDays(addWeeks(hs, seed.harvest_duration_weeks ?? 0), -1);
        const options = findAllStartSegments(plantings, bed, segUsed, plantDate, he, p.id);
        targetSeg = options.length ? options[0] : (p.start_segment ?? 0);
      } else {
        targetSeg = parseInt(segToken, 10) || (p.start_segment ?? 0);
      }

      const hs = addWeeks(plantDate, seed.grow_duration_weeks ?? 0);
      const he = addDays(addWeeks(hs, seed.harvest_duration_weeks ?? 0), -1);
      if (wouldOverlapWith(plantings, bed.id, targetSeg, segUsed, plantDate, he, p.id)) {
        notify("Kan niet verplaatsen: botsing in tijd/segment.", "err");
        return;
      }

      updatePlanting(p.id, {
        garden_bed_id: bed.id,
        planned_date: toISO(plantDate),
        planned_harvest_start: toISO(hs),
        planned_harvest_end: toISO(he),
        start_segment: targetSeg,
      } as any)
        .then(() => reload())
        .then(() => notify("Planting verplaatst.", "ok"))
        .catch(() => notify("Kon planting niet verplaatsen.", "err"));
    }
  }

  async function handleConfirmPlanting(opts: {
    mode: "create" | "edit";
    target: { seed: Seed; bed: GardenBed; segmentIndex: number; planting?: Planting };
    startSegment: number;
    segmentsUsed: number;
    method: "direct" | "presow";
    dateISO: string;
    color: string;
    bedIdOverride?: string;
  }) {
    const { mode, target, startSegment, segmentsUsed, method, dateISO, color, bedIdOverride } = opts;
    const { seed, bed, planting } = target;
    const bedToUse = bedIdOverride ? (beds.find((b) => b.id === bedIdOverride) ?? bed) : bed;

    if (!seed.grow_duration_weeks || !seed.harvest_duration_weeks) { notify("Vul groei-/oogstduur bij het zaad.", "err"); return; }
    if (method === "presow" && !seed.presow_duration_weeks) { notify("Voorzaaien vereist voorzaai-weken bij het zaad.", "err"); return; }

    const plantDate = parseISO(dateISO) ?? new Date();
    const hs = addWeeks(plantDate, seed.grow_duration_weeks!);
    const he = addDays(addWeeks(hs, seed.harvest_duration_weeks!), -1);
    const segUsed = Math.max(1, segmentsUsed);

    if (wouldOverlapWith(plantings, bedToUse.id, startSegment, segUsed, plantDate, he, planting?.id)) {
      notify("Deze planning botst in tijd/segment.", "err"); return;
    }

    if (mode === "create") {
      await createPlanting({
        seed_id: seed.id,
        garden_bed_id: bedToUse.id,
        garden_id: bedToUse.garden_id,
        planned_date: toISO(plantDate),
        planned_harvest_start: toISO(hs),
        planned_harvest_end: toISO(he),
        planned_presow_date: method === "presow" && seed.presow_duration_weeks ? toISO(addWeeks(plantDate, -(seed.presow_duration_weeks ?? 0))) : null,
        method,
        segments_used: segUsed,
        start_segment: startSegment,
        color: color || seed.default_color || "#22c55e",
        status: "planned",
      } as any);
      await reload(); setPopup(null); notify("Planting toegevoegd.", "ok");
    } else {
      await updatePlanting(planting!.id, {
        garden_bed_id: bedToUse.id,
        planned_date: toISO(plantDate),
        planned_harvest_start: toISO(hs),
        planned_harvest_end: toISO(he),
        planned_presow_date: method === "presow" && seed.presow_duration_weeks ? toISO(addWeeks(plantDate, -(seed.presow_duration_weeks ?? 0))) : null,
        method,
        segments_used: segUsed,
        start_segment: startSegment,
        color: color || planting?.color || seed.default_color || "#22c55e",
      } as any);
      await reload(); setPopup(null); notify("Planting bijgewerkt.", "ok");
    }
  }

  /* ===== LIST view (ongewijzigd) — compacte bak/segment weergave ===== */
  const listViewContent = (
    <div className="p-4 pb-8">
      <div className="space-y-6">
        {(["Buiten", outdoorBeds] as const).map(([label, bedList]) =>
          bedList.length > 0 && (
            <section key={label} className="space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{label}</h4>
              <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
                {bedList.map((bed) => {
                  const activePlantings = plantings.filter((p) => p.garden_bed_id === bed.id && isActiveInWeek(p, currentWeek));
                  const segs = Array.from({ length: bed.segments }, (_, i) => i);

                  return (
                    <div key={bed.id} className="p-2 border rounded-lg bg-card shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <h5 className="font-medium text-xs">{bed.name}</h5>
                          {bedHasConflict(bed.id) && <Chip tone="danger">⚠️</Chip>}
                        </div>
                        {bed.is_greenhouse && <Chip>Kas</Chip>}
                      </div>

                      <div className="grid gap-0.5" style={{ gridTemplateRows: `repeat(${bed.segments}, minmax(20px, auto))` }}>
                        {segs.map((i) => {
                          const here = activePlantings.filter((p) => {
                            const s = p.start_segment ?? 0, u = p.segments_used ?? 1; return i >= s && i < s + u;
                          });

                          return (
                            <div key={i} className="relative border border-dashed rounded min-h-[18px] flex items-center justify-center">
                              <div className="flex flex-col gap-0.5 w-full px-0.5">
                                {here.map((p) => {
                                  const seed = seedsById[p.seed_id];
                                  const color = p.color?.startsWith("#") ? p.color : "#22c55e";
                                  const hasConflict = (conflictsMap.get(p.id)?.length ?? 0) > 0;
                                  const iconUrl = getEffectiveIconUrl(seed, cropTypesById);
                                  const textColor = getContrastTextColor(color);

                                  return (
                                    <div key={`${p.id}-${i}`} className="relative rounded px-1.5 py-0.5 text-[10px] flex items-center justify-between overflow-hidden" style={{ background: color, color: textColor }} title={`${seed?.name ?? "—"} • ${fmtDMY(p.planned_date)} → ${fmtDMY(p.planned_harvest_end)}`}>
                                      <div className="relative z-20 flex items-center gap-1 min-w-0">
                                        <span className="truncate">{seed?.name ?? "—"}</span>
                                        {hasConflict && (
                                          <button className="text-[9px] underline decoration-white/70 underline-offset-1 opacity-90" onClick={(e) => { e.stopPropagation(); setView("conflicts"); localStorage.setItem("plannerOpenTab", "conflicts"); }} title="Bekijk in Conflicten">⚠️</button>
                                        )}
                                      </div>
                                      <div className="absolute top-0.5 right-0.5 flex items-center gap-0.5 ml-0.5 z-20">
                                        <button className="p-0.5 hover:bg-white/20 rounded" title="Bewerken" onClick={() => setPopup({ mode: "edit", planting: p, seed: seed!, bed, segmentIndex: p.start_segment ?? 0 })}>
                                          <Edit3 className="w-2.5 h-2.5" />
                                        </button>
                                        <button className="p-0.5 hover:bg-white/20 rounded" title="Verwijderen" onClick={() => { if (confirm("Verwijderen?")) deletePlanting(p.id).then(reload); }}>
                                          <Trash2 className="w-2.5 h-2.5" />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {bedHasConflict(bed.id) && (
                        <div className="mt-1.5 text-[10px] text-red-700">
                          ⚠️ Conflicten — <button className="underline" onClick={() => { setView("conflicts"); localStorage.setItem("plannerOpenTab", "conflicts"); }}>Bekijk</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )
        )}
      </div>
    </div>
  );

  /* ===== MAP view — identiek aan eerdere Planner (samengevat) ===== */
  function PlannerMap() {
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const CANVAS_W = 3000; const CANVAS_H = 1200;

    const [zoom, setZoom] = useState(() => {
      const saved = localStorage.getItem("plannerMapZoomV2");
      return saved ? parseFloat(saved) : 0.8;
    });
    const minZoom = 0.15; const maxZoom = 2;
    const clampZoom = (z: number) => Math.max(minZoom, Math.min(maxZoom, z));
    const handleManualZoom = (z: number) => { const v = clampZoom(z); setZoom(v); localStorage.setItem("plannerMapZoomV2", v.toString()); };
    const fit = () => {
      const vp = viewportRef.current; if (!vp) return;
      const vw = vp.clientWidth - 24; const vh = vp.clientHeight - 24;
      const zx = vw / CANVAS_W; const zy = vh / CANVAS_H; handleManualZoom(Math.min(zx, zy));
    };
    useEffect(() => { if (!localStorage.getItem("plannerMapZoomV2")) { const t = setTimeout(fit, 50); return () => clearTimeout(t); } }, []);

    const ZoomControls = () => (
      <div className="flex items-center gap-2">
        <button className="inline-flex items-center justify-center w-8 h-8 rounded-md border bg-white hover:bg-muted" onClick={() => handleManualZoom(zoom * 1.1)} title="Zoom in">
          <ZoomIn className="w-4 h-4" />
        </button>
        <button className="inline-flex items-center justify-center w-8 h-8 rounded-md border bg-white hover:bg-muted" onClick={() => handleManualZoom(zoom / 1.1)} title="Zoom uit">
          <ZoomOut className="w-4 h-4" />
        </button>
        <button className="inline-flex items-center justify-center w-8 h-8 rounded-md border bg-white hover:bg-muted" onClick={() => handleManualZoom(1)} title="100%">
          100%
        </button>
        <button className="inline-flex items-center justify-center w-8 h-8 rounded-md border bg-white hover:bg-muted" onClick={fit} title="Passend">
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    );

    const WOOD_BORDER = 8;

    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Plattegrond</h3>
          <ZoomControls />
        </div>

        <div ref={viewportRef} className="relative w-full h-[70vh] rounded-xl border-2 border-amber-800/30 overflow-auto shadow-xl" style={{ background: "linear-gradient(135deg, #2d5016 0%, #3a6b1e 25%, #2d5016 50%, #3a6b1e 75%, #2d5016 100%)" }}>
          <div className="relative" style={{ width: CANVAS_W * zoom, height: CANVAS_H * zoom }}>
            <div className="absolute left-0 top-0" style={{ width: CANVAS_W, height: CANVAS_H, transform: `scale(${zoom})`, transformOrigin: "0 0", borderRadius: 12 }}>
              {beds.map((bed) => {
                const w = Math.max(60, Math.round(bed.length_cm || 200));
                const h = Math.max(36, Math.round(bed.width_cm || 100));
                const x = bed.location_x ?? 20; const y = bed.location_y ?? 20;
                const innerW = Math.max(1, w - WOOD_BORDER * 2); const innerH = Math.max(1, h - WOOD_BORDER * 2);
                const segCount = Math.max(1, bed.segments); const vertical = innerW >= innerH;
                const active = plantings.filter((p) => p.garden_bed_id === bed.id && isActiveInWeek(p, currentWeek));
                return (
                  <div key={bed.id} className="absolute select-none" style={{ left: x, top: y, width: w, height: h }}>
                    <div className="absolute inset-0 rounded-lg" style={{ padding: WOOD_BORDER }}>
                      <div className="relative w-full h-full rounded-md overflow-hidden" style={{ background: `linear-gradient(180deg, #5c4033 0%, #3e2723 100%)` }}>
                        {/* DnD droppables per segment */}
                        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: vertical ? `repeat(${segCount}, 1fr)` : "1fr", gridTemplateRows: vertical ? "1fr" : `repeat(${segCount}, 1fr)` }}>
                          {Array.from({ length: segCount }, (_, i) => (
                            <div key={i} className="relative">
                              <MapDroppable id={`bed__${bed.id}__segment__${i}`} />
                            </div>
                          ))}
                        </div>

                        {/* Actieve blokken (indicatief) */}
                        <div className="absolute inset-0">
                          {active.map((p) => {
                            const seed = seedsById[p.seed_id];
                            const start = p.start_segment ?? 0;
                            const used = Math.max(1, p.segments_used ?? 1);
                            const inset = 2;
                            const segW = vertical ? (innerW / segCount) : innerW;
                            const segH = vertical ? innerH : (innerH / segCount);
                            const rect = vertical
                              ? { top: inset, height: Math.max(1, innerH - inset * 2), left: inset + start * segW, width: Math.max(1, used * segW - inset * 2) }
                              : { left: inset, width: Math.max(1, innerW - inset * 2), top: inset + start * segH, height: Math.max(1, used * segH - inset * 2) };
                            const color = p.color?.startsWith("#") ? p.color : "#22c55e";
                            const textColor = getContrastTextColor(color);
                            return (
                              <div key={p.id} className="absolute rounded text-[10px] px-1 flex items-center overflow-hidden" style={{ ...rect, backgroundColor: color, color: textColor }} title={`${seed?.name ?? "—"} • ${fmtDMY(p.planned_date)} → ${fmtDMY(p.planned_harvest_end)}`}>
                                <div className="relative z-20 truncate"><span className="truncate">{seed?.name ?? "—"}</span></div>
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

  /* ===== CONFLICTS view ===== */
  const conflictsView = (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Ga door met je bestaande Conflicten-weergave. Deze Planner toont geen details in list/map, alleen hier.</p>
    </div>
  );

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col overflow-hidden -mx-6 -mb-6">
      {/* Header */}
      <header className="flex-shrink-0 bg-background border-b z-30 px-6">
        <div className="py-3 flex items-center justify-between">
          <h2 className="text-2xl font-bold flex items-center gap-3">
            Planner
            {hasConflicts && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
                ⚠️ {conflictCount} conflict{conflictCount !== 1 ? "en" : ""}
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center p-0.5 bg-muted/40 rounded-lg">
              <button className="px-3 py-2 text-sm font-medium rounded-md hover:bg-background transition-colors" onClick={() => setCurrentWeek(addDays(currentWeek, -7))}>←</button>
              <span className="px-4 py-2 font-semibold text-sm min-w-[160px] text-center">
                WK {weekOf(currentWeek)}{" "}
                <span className="text-muted-foreground font-normal">
                  ({format(currentWeek, "d MMM", { locale: nl })} - {format(addDays(currentWeek, 6), "d MMM", { locale: nl })})
                </span>
              </span>
              <button className="px-3 py-2 text-sm font-medium rounded-md hover:bg-background transition-colors" onClick={() => setCurrentWeek(addDays(currentWeek, 7))}>→</button>
            </div>
            <button className="px-3 py-2 text-sm font-medium rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-all" onClick={gotoToday}>Vandaag</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="pb-3 flex items-center gap-2">
          {([
            { key: "list", label: "Lijstweergave" },
            { key: "map", label: "Plattegrond" },
            { key: "timeline", label: "Timeline" },
            { key: "harvest", label: "Oogstagenda" },
            { key: "conflicts", label: "Conflicten" },
          ] as const).map(({ key, label }) => {
            const active = view === key;
            const danger = key === "conflicts" && conflictCount > 0;
            return (
              <button key={key} onClick={() => setView(key as any)} className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${active ? (danger ? "bg-red-600 text-white shadow-sm" : "bg-primary text-primary-foreground shadow-sm") : danger ? "bg-red-50 text-red-700 hover:bg-red-100" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                {label}
                {key === "conflicts" && conflictCount > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-white/20">{conflictCount}</span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* Conflict Warning */}
      {hasConflicts && (
        <div className="px-6 py-2 flex-shrink-0">
          <ConflictWarning conflictCount={conflictCount} />
        </div>
      )}

      <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 min-h-0">
          {(view === "list" || view === "map" || view === "timeline") && (
            <SeedsSidebar 
              seeds={seeds}
              cropTypes={cropTypes}
              plantings={plantings}
              activeDragId={activeDragId}
              onSeedInfoClick={(seed) => setSeedDetailsModal(seed)}
            />
          )}

          <div className="flex-1 overflow-auto">
            {view === "list" && listViewContent}

            {view === "map" && (
              <div className="p-6 h-full flex flex-col gap-4">
                <div className="flex items-center justify-between bg-card rounded-lg border px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">Plantingen voor:</span>
                    <span className="font-medium">Week {weekOf(currentWeek)} • {format(currentWeek, "d MMM", { locale: nl })} - {format(addDays(currentWeek, 6), "d MMM yyyy", { locale: nl })}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{plantingsForMap.length} planting{plantingsForMap.length !== 1 ? "en" : ""}</span>
                </div>
                <div className="flex-1 min-h-0 relative">
                  <GardenPlotCanvas
                    beds={beds}
                    readOnly={true}
                    plantings={plantingsForMap}
                    plotObjects={[]}
                    onBedMove={async (id, x, y) => {
                      try {
                        await updateBed(id, { location_x: Math.round(x), location_y: Math.round(y) });
                        await reload();
                      } catch (e: any) {
                        console.error("Kon positie niet opslaan:", e);
                      }
                    }}
                    renderBedOverlay={(bed) => {
                      const segCount = bed.segments || 1;
                      const vertical = bed.width_cm > bed.length_cm;
                      return (
                        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: vertical ? `repeat(${segCount}, 1fr)` : "1fr", gridTemplateRows: vertical ? "1fr" : `repeat(${segCount}, 1fr)` }}>
                          {Array.from({ length: segCount }, (_, i) => (
                            <div key={i} className="relative">
                              <MapDroppable id={`bed__${bed.id}__segment__${i}`} />
                            </div>
                          ))}
                        </div>
                      );
                    }}
                  />
                </div>
              </div>
            )}

            {view === "timeline" && (
              <div className="p-6">
                <CapacityTimelineView
                  beds={beds}
                  plantings={plantings}
                  seeds={seeds}
                  onEdit={(p, bed) => setPopup({ mode: "edit", planting: p, seed: seedsById[p.seed_id]!, bed, segmentIndex: p.start_segment ?? 0 })}
                />
              </div>
            )}

            {view === "harvest" && (
              <div className="p-6">
                <HarvestAgendaView
                  beds={beds}
                  seeds={seeds}
                  plantings={plantings}
                  cropTypes={cropTypes}
                  greenhouseOnly={greenhouseOnly}
                  cropTypeFilters={cropTypeFilters}
                />
              </div>
            )}

            {view === "conflicts" && <div className="p-6">{conflictsView}</div>}
          </div>
        </div>

        <DragOverlay dropAnimation={{ duration: 200, easing: "ease-out" }}>
          {activeSeed ? <DraggableSeed seed={activeSeed} isDragging /> : null}
        </DragOverlay>
      </DndContext>

      {/* Planting popup */}
      {popup && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setPopup(null)}>
          <div className="bg-card/95 backdrop-blur-md rounded-2xl shadow-2xl w-full max-w-lg border border-border/50 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/30 bg-gradient-to-r from-primary/5 to-transparent">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full ring-2 ring-white shadow-md" style={{ background: popup.mode === "create" ? (popup.seed.default_color?.startsWith('#') ? popup.seed.default_color : '#22c55e') : (popup.planting.color?.startsWith('#') ? popup.planting.color : '#22c55e') }} />
                <div>
                  <h3 className="text-lg font-semibold">{popup.mode === "create" ? "Nieuwe planting" : "Planting bewerken"}</h3>
                  <p className="text-xs text-muted-foreground">{popup.mode === "create" ? popup.seed.name : popup.seed.name}</p>
                </div>
              </div>
              <button onClick={() => setPopup(null)} className="p-2 rounded-full hover:bg-muted/50 transition-colors">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            <div className="p-5">
              <PlantingForm
                mode={popup.mode}
                seed={popup.mode === "create" ? popup.seed : popup.seed}
                bed={popup.mode === "create" ? popup.bed : popup.bed}
                beds={beds}
                defaultSegment={popup.mode === "create" ? (popup.defaultSegment ?? popup.segmentIndex) : (popup.segmentIndex)}
                defaultDateISO={popup.mode === "edit" ? (popup.planting.planned_date ?? toISO(addDays(currentWeek, 4))) : (popup.defaultDateISO ?? toISO(addDays(currentWeek, 4)))}
                existing={popup.mode === "edit" ? popup.planting : undefined}
                allPlantings={plantings}
                onCancel={() => setPopup(null)}
                onConfirm={(startSegment, segmentsUsed, method, date, color, bedId) =>
                  handleConfirmPlanting({
                    mode: popup.mode,
                    target: popup.mode === "create"
                      ? { seed: popup.seed, bed: popup.bed, segmentIndex: popup.segmentIndex }
                      : { seed: popup.seed, bed: popup.bed, segmentIndex: popup.segmentIndex, planting: popup.planting },
                    startSegment,
                    segmentsUsed,
                    method,
                    dateISO: date,
                    color,
                    bedIdOverride: bedId,
                  })
                }
              />
            </div>
          </div>
        </div>
      )}

      {/* toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 px-4 py-2 rounded shadow text-sm ${toast.tone === "ok" ? "bg-green-600 text-white" : toast.tone === "err" ? "bg-red-600 text-white" : "bg-gray-800 text-white"}`}>
          {toast.msg}
        </div>
      )}

      {/* Seed Details Modal */}
      {seedDetailsModal && (
        <SeedModal
          gardenId={garden.id}
          seed={seedDetailsModal}
          onClose={() => setSeedDetailsModal(null)}
          onSaved={async () => { await onDataChange(); setSeedDetailsModal(null); }}
        />
      )}
    </div>
  );
}

/* ===== PlantingForm ===== */
function PlantingForm({
  mode,
  seed,
  bed,
  defaultSegment,
  defaultDateISO,
  existing,
  beds,
  allPlantings,
  onCancel,
  onConfirm,
}: {
  mode: "create" | "edit";
  seed: Seed;
  bed: GardenBed;
  defaultSegment: number;
  defaultDateISO: string | undefined;
  existing?: Planting;
  beds: GardenBed[];
  allPlantings: Planting[];
  onCancel: () => void;
  onConfirm: (
    startSegment: number,
    segmentsUsed: number,
    method: "direct" | "presow",
    dateISO: string,
    color: string,
    bedId: string
  ) => void;
}) {
  const [segmentsUsed, setSegmentsUsed] = useState<number>(existing?.segments_used ?? 1);
  const [method, setMethod] = useState<"direct" | "presow">(
    existing?.method ?? (seed.sowing_type === "both" ? "direct" : (seed.sowing_type as "direct" | "presow") ?? "direct")
  );
  const [date, setDate] = useState<string>(existing?.planned_date ?? (defaultDateISO ?? toISO(new Date())));
  const [color, setColor] = useState<string>(() => existing?.color?.startsWith("#") ? (existing.color as string) : seed.default_color?.startsWith("#") ? seed.default_color! : "#22c55e");
  const [bedId, setBedId] = useState<string>(existing?.garden_bed_id ?? bed.id);
  const [startSegment, setStartSegment] = useState<number>(existing?.start_segment ?? defaultSegment);
  const [monthDialogOpen, setMonthDialogOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const selectedBed = useMemo(() => beds.find((x) => x.id === bedId) ?? bed, [beds, bedId, bed]);
  const plantDate = useMemo(() => parseISO(date) ?? new Date(), [date]);
  const hs = useMemo(() => addWeeks(plantDate, seed.grow_duration_weeks ?? 0), [plantDate, seed.grow_duration_weeks]);
  const he = useMemo(() => addDays(addWeeks(hs, seed.harvest_duration_weeks ?? 0), -1), [hs, seed.harvest_duration_weeks]);

  const startSegmentOptions = useMemo(() => {
    return findAllStartSegments(allPlantings, selectedBed, segmentsUsed, plantDate, he, existing?.id);
  }, [allPlantings, selectedBed, segmentsUsed, plantDate, he, existing?.id]);

  useEffect(() => {
    if (!startSegmentOptions.includes(startSegment)) {
      setStartSegment(startSegmentOptions.length > 0 ? startSegmentOptions[0] : 0);
    }
  }, [startSegmentOptions]);

  const maxSegSpinner = Math.max(1, selectedBed.segments);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm(startSegment, segmentsUsed, method, date, color, bedId);
      }}
      className="space-y-5"
    >
      {/* Bak */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Bak</label>
        <Select value={bedId} onValueChange={setBedId}>
          <SelectTrigger className="w-full bg-muted/30 border-0 rounded-lg h-10 focus:ring-2 focus:ring-primary/20">
            <SelectValue placeholder="Selecteer bak" />
          </SelectTrigger>
          <SelectContent className="bg-popover/95 backdrop-blur-md border-border/50">
            {beds.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                <span className="flex items-center gap-2">
                  {b.name}
                  {b.is_greenhouse && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-600">kas</span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Grid: Segment + Aantal */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Startsegment</label>
          <Select value={String(startSegment)} onValueChange={(v) => setStartSegment(parseInt(v, 10))}>
            <SelectTrigger className="w-full bg-muted/30 border-0 rounded-lg h-10 focus:ring-2 focus:ring-primary/20">
              <SelectValue placeholder="Segment" />
            </SelectTrigger>
            <SelectContent className="bg-popover/95 backdrop-blur-md border-border/50">
              {startSegmentOptions.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  Segment {s + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Segmenten</label>
          <div className="relative">
            <input type="number" min={1} max={maxSegSpinner} value={segmentsUsed} onChange={(e) => setSegmentsUsed(clamp(parseInt(e.target.value || "1", 10), 1, maxSegSpinner))} className="w-full bg-muted/30 border-0 rounded-lg h-10 px-3 pr-12 text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">stuks</span>
          </div>
        </div>
      </div>

      {/* Datum + Kleur */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Zaai/Plantdatum</label>
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <button type="button" className={cn("w-full bg-muted/30 border-0 rounded-lg h-10 px-3 text-left text-sm flex items-center gap-2 focus:ring-2 focus:ring-primary/20 transition-all hover:bg-muted/50", !date && "text-muted-foreground")}> 
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                {date ? format(parseISO(date) ?? new Date(), "d MMM yyyy", { locale: nl }) : "Kies datum"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-popover/95 backdrop-blur-md border-border/50" align="start">
              <Calendar mode="single" selected={parseISO(date) ?? undefined} onSelect={(d) => { if (d) { setDate(toISO(d)); setDatePickerOpen(false); } }} initialFocus className="pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <p className="text-[10px] text-muted-foreground">Bezet t/m {format(addDays(addWeeks(parseISO(date) ?? new Date(), seed.grow_duration_weeks ?? 0), (seed.harvest_duration_weeks ?? 0) * 7 - 1), "d MMM yyyy", { locale: nl })}</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Kleur</label>
          <div className="flex items-center gap-3">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-10 h-10 rounded-full cursor-pointer border-2 border-white shadow-md overflow-hidden [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-full appearance-none bg-transparent" />
            <input value={color} onChange={(e) => setColor(e.target.value)} className="flex-1 bg-muted/30 border-0 rounded-lg h-10 px-3 text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none font-mono" placeholder="#22c55e" />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-border/30">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium rounded-lg bg-muted/50 hover:bg-muted transition-colors">Annuleren</button>
        <button type="submit" className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">{mode === "create" ? "Planting toevoegen" : "Wijzigingen opslaan"}</button>
      </div>
    </form>
  );
}

export default PlannerPage;
