// src/components/PlannerPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { Garden, GardenBed, Planting, Seed, CropType, UUID, Task } from "../lib/types";
import { GardenPlotCanvas } from "./GardenPlotCanvas";
import { createPlanting, updatePlanting, deletePlanting } from "../lib/api/plantings";
import { updateBed } from "../lib/api/beds";
import { DndContext, useDraggable, useDroppable, DragOverlay } from "@dnd-kit/core";
import { supabase } from "../lib/supabaseClient";
import { TimelineView } from "./TimelineView";
import { buildConflictsMap, countUniqueConflicts } from "../lib/conflicts";
import { ConflictWarning } from "./ConflictWarning";
import { useConflictFlags } from "../hooks/useConflictFlags";
import { SeedModal } from "./SeedModal";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Checkbox } from "./ui/checkbox";
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
import { Edit3, Trash2, ChevronDown, Info, AlertTriangle, X, CalendarIcon, Search, Leaf, ChevronLeft, ChevronRight } from "lucide-react";

// ★ Nieuw: de oogstagenda als aparte component
import HarvestAgendaView from "./HarvestAgendaView";

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

/** Seed icoon: eerst seed.icon_key, dan categorie.icon_key */
function getEffectiveIconUrl(seed: Seed | undefined, cropTypesById: Map<string, CropType>): string | null {
  if (!seed) return null;
  const own = getPublicIconUrl((seed as any).icon_key);
  if (own) return own;
  const ct = seed.crop_type_id ? cropTypesById.get(seed.crop_type_id) : undefined;
  return getPublicIconUrl((ct as any)?.icon_key);
}

/** Diamant-tiling overlay met <img> iconen */
function IconTilingOverlay({
  iconUrl,
  segmentsUsed = 1,
  densityPerSegment = 10,
  maxIcons = 100,
  minIcons = 6,
  opacity = 0.9,
}: {
  iconUrl: string;
  segmentsUsed?: number;
  densityPerSegment?: number;
  maxIcons?: number;
  minIcons?: number;
  opacity?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const items = useMemo(() => {
    const { w, h } = size;
    if (!w || !h) return [];

    const target = Math.min(
      maxIcons,
      Math.max(minIcons, Math.round((segmentsUsed || 1) * densityPerSegment))
    );

    const aspect = w / h;
    let cols = Math.max(2, Math.round(Math.sqrt(target) * Math.sqrt(aspect)));
    let rows = Math.max(2, Math.ceil(target / cols));

    const total = rows * cols;
    const scale = Math.sqrt(target / total);

    const xStep = w / cols;
    const yStep = h / rows;
    const base = Math.min(xStep, yStep);
    const iconSize = Math.max(12, Math.min(48, base * 0.7 * scale));

    const out: Array<{ x: number; y: number; size: number }> = [];
    for (let r = 0; r < rows; r++) {
      const xOffset = (r % 2 === 0 ? 0.5 : 0) * xStep; // diamant-verschuiving
      for (let c = 0; c < cols; c++) {
        const x = c * xStep + xStep / 2 + xOffset;
        const y = r * yStep + yStep / 2;
        if (x < iconSize / 2 || x > w - iconSize / 2) continue;
        out.push({ x, y, size: iconSize });
      }
    }
    if (out.length > maxIcons) {
      const stride = Math.ceil(out.length / maxIcons);
      return out.filter((_, i) => i % stride === 0);
    }
    return out;
  }, [size, segmentsUsed, densityPerSegment, maxIcons, minIcons]);

  return (
    <div ref={ref} className="absolute inset-0 pointer-events-none select-none overflow-hidden z-10">
      {items.map((pt, idx) => (
        <img
          key={idx}
          src={iconUrl}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            left: pt.x - pt.size / 2,
            top: pt.y - pt.size / 2,
            width: pt.size,
            height: pt.size,
            opacity,
            objectFit: "contain",
            filter: "drop-shadow(0 0 0.5px rgba(0,0,0,0.15))",
          }}
        />
      ))}
    </div>
  );
}

/* ===== helpers ===== */
const toISO = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addWeeks = (d: Date, w: number) => addDays(d, w * 7);
const parseISO = (x?: string | null) => (x ? new Date(x) : null);
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

  const presow =
    method === "presow" && seed.presow_duration_weeks
      ? toISO(addWeeks(ground, -(seed.presow_duration_weeks ?? 0)))
      : null;

  return {
    planned_date: groundISO,
    planned_presow_date: presow,
    planned_harvest_start: hsISO,
    planned_harvest_end: heISO,
  };
}

/* overlap helpers — bed bezetting = ground→harvest_end */
function intervalOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart <= bEnd && bStart <= aEnd;
}
function segmentsOverlap(aStartSeg: number, aUsed: number, bStartSeg: number, bUsed: number) {
  const aEnd = aStartSeg + aUsed - 1,
    bEnd = bStartSeg + bUsed - 1;
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
    const ps = p.start_segment ?? 0,
      pu = p.segments_used ?? 1;
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
  };
  return <span className={`inline-flex items-center rounded px-1 py-0.5 text-[9px] ${map[tone]}`}>{children}</span>;
}
function DraggableSeed({ seed, isDragging = false, onInfoClick }: { seed: Seed; isDragging?: boolean; onInfoClick?: () => void }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: `seed-${seed.id}` });
  const color = seed.default_color?.startsWith("#") ? seed.default_color : "#22c55e";
  
  return (
    <div
      ref={setNodeRef}
      className={`group relative px-2 py-1 rounded border bg-card hover:shadow-sm transition-all duration-150 ${
        isDragging ? "opacity-40 scale-95" : "hover:border-primary/30"
      }`}
    >
      <div 
        {...listeners} 
        {...attributes} 
        className="flex items-center gap-1.5 cursor-grab active:cursor-grabbing"
      >
        <div 
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ background: color }}
        />
        <span className="text-[11px] font-medium truncate flex-1">{seed.name}</span>
      </div>
      {onInfoClick && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onInfoClick();
          }}
          className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity"
          title="Bekijk zaadgegevens"
        >
          <Info className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}

function DroppableSegment({ id, occupied, children }: { id: string; occupied: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`relative border border-dashed rounded min-h-[18px] flex items-center justify-center transition-all duration-150 ${
        isOver 
          ? "border-primary bg-primary/10 scale-[1.01]" 
          : occupied 
            ? "border-emerald-300/50 bg-emerald-50/20" 
            : "border-muted-foreground/15 bg-muted/10 hover:border-muted-foreground/25"
      }`}
    >
      {children}
    </div>
  );
}

function MapDroppable({ id }: { id: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div 
      ref={setNodeRef} 
      className={`w-full h-full transition-colors duration-150 ${isOver ? "bg-primary/20" : "bg-transparent"}`} 
    />
  );
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

  // ★ Uitgebreid met "harvest" voor Oogstagenda
  const [view, setView] = useState<"list" | "map" | "timeline" | "harvest" | "conflicts">(
    () => (localStorage.getItem("plannerOpenTab") as any) || (localStorage.getItem("plannerView") as any) || "list"
  );
  const [q, setQ] = useState(localStorage.getItem("plannerQ") ?? "");
  const [inStockOnly, setInStockOnly] = useState(() => {
    // One-time migration: default to true
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

  const [showGhosts, setShowGhosts] = useState(localStorage.getItem("plannerShowGhosts") === "1");
  const [currentWeek, setCurrentWeek] = useState<Date>(() => {
    const saved = localStorage.getItem("plannerWeekISO");
    if (saved) return new Date(saved);
    const n = new Date();
    const d = new Date(n);
    d.setDate(n.getDate() - ((n.getDay() || 7) - 1));
    return d; // maandag
  });

  // Map view uses the same currentWeek as the timeline

  // toast
  const [toast, setToast] = useState<{ msg: string, tone: "info" | "ok" | "err" } | null>(null);
  const notify = (msg: string, tone: "info" | "ok" | "err" = "info") => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 2500);
  };

  // popups
  const [popup, setPopup] = useState<
    | null
    | { mode: "create"; seed: Seed; bed: GardenBed; segmentIndex: number }
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

  const reload = async () => {
    await onDataChange();
  };
  useEffect(() => {
    const ch = supabase
      .channel("rt-plantings")
      .on("postgres_changes", { event: "*", schema: "public", table: "plantings", filter: `garden_id=eq.${garden.id}` }, () =>
        reload().catch(() => {})
      )
      .subscribe();
    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {}
    };
  }, [garden.id]);

  useEffect(() => {
    localStorage.setItem("plannerView", view);
    localStorage.removeItem("plannerOpenTab");
  }, [view]);
  useEffect(() => {
    localStorage.setItem("plannerQ", q);
  }, [q]);
  useEffect(() => {
    localStorage.setItem("plannerInStock", inStockOnly ? "1" : "0");
  }, [inStockOnly]);
  useEffect(() => {
    localStorage.setItem("plannerInPlanner", inPlanner);
  }, [inPlanner]);
  useEffect(() => {
    localStorage.setItem("plannerGHOnly", greenhouseOnly ? "1" : "0");
  }, [greenhouseOnly]);
  useEffect(() => {
    localStorage.setItem("plannerShowGhosts", showGhosts ? "1" : "0");
  }, [showGhosts]);
  useEffect(() => {
    localStorage.setItem("plannerWeekISO", toISO(currentWeek));
  }, [currentWeek]);
  useEffect(() => {
    localStorage.setItem("plannerMonths", JSON.stringify(selectedMonths));
  }, [selectedMonths]);
  useEffect(() => {
    localStorage.setItem("plannerCropTypes", JSON.stringify(cropTypeFilters));
  }, [cropTypeFilters]);

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
  /* ===== plantings overlay for map view (uses currentWeek from timeline) ===== */
  const plantingsForMap = useMemo(() => {
    const weekStart = new Date(currentWeek);
    const weekEnd = addDays(weekStart, 6);
    
    // Build a map of planting_id -> next pending task
    const nextTaskByPlanting = new Map<string, Task>();
    for (const task of tasks) {
      if (task.status !== "pending") continue;
      const existing = nextTaskByPlanting.get(task.planting_id);
      if (!existing || new Date(task.due_date) < new Date(existing.due_date)) {
        nextTaskByPlanting.set(task.planting_id, task);
      }
    }
    
    return (plantings || [])
      .filter((p) => {
        // Show plantings active during selected week (ground date to harvest end)
        const start = parseISO(p.planned_date);
        const end = parseISO(p.planned_harvest_end);
        if (!start || !end) return false;
        // Overlap check: planting is active if start <= weekEnd && end >= weekStart
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
          nextActionType: nextTask?.type,
          nextActionDate: nextTask?.due_date,
        };
      });
  }, [plantings, seedsById, cropTypesById, currentWeek, tasks]);

  /* ===== conflicts ===== */
  const conflictsMap = useMemo(() => buildConflictsMap(plantings || [], seeds || []), [plantings, seeds]);
  const conflictCount = useMemo(() => countUniqueConflicts(conflictsMap), [conflictsMap]);
  const { hasConflicts } = useConflictFlags(conflictCount);

  const bedHasConflict = (bedId: UUID) => {
    // Toon alleen een icoon op bedniveau
    return (plantings || []).some((p) => p.garden_bed_id === bedId && (conflictsMap.get(p.id)?.length ?? 0) > 0);
  };

  /* ===== current week helpers ===== */
  const isActiveInWeek = (p: Planting, week: Date) => {
    const s = parseISO(p.planned_date);
    const e = parseISO(p.planned_harvest_end);
    if (!s || !e) return false;
    const mon = new Date(week);
    const sun = addDays(mon, 6);
    return s <= sun && e >= mon;
  };
  const isFutureRelativeToWeek = (p: Planting, week: Date) => {
    const s = parseISO(p.planned_date);
    if (!s) return false;
    const mon = new Date(week);
    const sun = addDays(mon, 6);
    return s > sun;
  };

  /* ===== filters for seeds sidebar (met maand + categorie) ===== */
  const seedHasPlanned = (seedId: string) => plantings.some((p) => p.seed_id === seedId && p.planned_date);

  const filteredSeeds = useMemo(() => {
    let arr = seeds.slice();

    // tekst-zoek
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      arr = arr.filter((s) => s.name.toLowerCase().includes(t));
    }

    // voorraad
    if (inStockOnly) arr = arr.filter((s: any) => (s as any).in_stock !== false);

    // kas
    if (greenhouseOnly) arr = arr.filter((s) => !!s.greenhouse_compatible);

    // in planner / niet in planner
    if (inPlanner !== "all") {
      arr = arr.filter((s) => (inPlanner === "planned" ? seedHasPlanned(s.id) : !seedHasPlanned(s.id)));
    }

    // categorie (multi-select)
    if (cropTypeFilters.length > 0) {
      arr = arr.filter((s) => {
        if (cropTypeFilters.includes("__none__") && !s.crop_type_id) return true;
        return cropTypeFilters.includes(s.crop_type_id ?? "");
      });
    }

    // maand (multi-select) - filtert op zowel kas-maanden als direct/plant maanden
    if (selectedMonths.length > 0) {
      arr = arr.filter((s: any) => {
        const directPlantMonths: number[] =
          (s as any).direct_plant_months ??
          (s as any).direct_sow_months ??
          [];
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
  function handleDragEnd(ev: any) {
    const over = ev.over;
    const active = String(ev.active?.id ?? "");
    setActiveDragId(null);
    if (!over || !active.startsWith("seed-")) return;
    const seedId = active.replace("seed-", "");
    const seed = seeds.find((s) => s.id === seedId);
    if (!seed) return;
    const [prefix, bedId, , segStr] = String(over.id).split("__");
    // Support both "bed" and "timeline" prefixes
    if (!prefix.startsWith("bed") && !prefix.startsWith("timeline")) return;
    const bed = beds.find((b) => b.id === bedId);
    if (!bed) return;
    setPopup({ mode: "create", seed, bed, segmentIndex: parseInt(segStr, 10) });
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

    if (!seed.grow_duration_weeks || !seed.harvest_duration_weeks) {
      notify("Vul groei-/oogstduur bij het zaad.", "err");
      return;
    }
    if (method === "presow" && !seed.presow_duration_weeks) {
      notify("Voorzaaien vereist voorzaai-weken bij het zaad.", "err");
      return;
    }

    const plantDate = new Date(dateISO);
    const hs = addWeeks(plantDate, seed.grow_duration_weeks!);
    const he = addDays(addWeeks(hs, seed.harvest_duration_weeks!), -1);
    const segUsed = Math.max(1, segmentsUsed);

    if (wouldOverlapWith(plantings, bedToUse.id, startSegment, segUsed, plantDate, he, planting?.id)) {
      notify("Deze planning botst in tijd/segment.", "err");
      return;
    }

    if (mode === "create") {
      await createPlanting({
        seed_id: seed.id,
        garden_bed_id: bedToUse.id,
        garden_id: bedToUse.garden_id,
        planned_date: toISO(plantDate),
        planned_harvest_start: toISO(hs),
        planned_harvest_end: toISO(he),
        planned_presow_date:
          method === "presow" && seed.presow_duration_weeks ? toISO(addWeeks(plantDate, -(seed.presow_duration_weeks ?? 0))) : null,
        method,
        segments_used: segUsed,
        start_segment: startSegment,
        color: color || seed.default_color || "#22c55e",
        status: "planned",
      } as any);
      await reload();
      setPopup(null);
      notify("Planting toegevoegd.", "ok");
    } else {
      await updatePlanting(planting!.id, {
        garden_bed_id: bedToUse.id,
        planned_date: toISO(plantDate),
        planned_harvest_start: toISO(hs),
        planned_harvest_end: toISO(he),
        planned_presow_date:
          method === "presow" && seed.presow_duration_weeks ? toISO(addWeeks(plantDate, -(seed.presow_duration_weeks ?? 0))) : null,
        method,
        segments_used: segUsed,
        start_segment: startSegment,
        color: color || planting?.color || seed.default_color || "#22c55e",
      } as any);
      await reload();
      setPopup(null);
      notify("Planting bijgewerkt.", "ok");
    }
  }

  /* ===== Sidebar zaden ===== */
  const SeedsSidebar = () => (
    <aside className="w-60 flex-shrink-0 bg-card/50 backdrop-blur-sm border-r border-border/50 ml-3 rounded-l-xl overflow-hidden">
      <div className="sticky top-0 h-screen overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border/30 bg-gradient-to-r from-primary/5 to-transparent">
          <h3 className="text-sm font-semibold text-foreground tracking-tight">Zaden</h3>
        </div>
        
        {/* Filters */}
        <div className="px-3 py-3 border-b border-border/30 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
            <input 
              className="w-full pl-8 pr-3 py-2 text-xs bg-muted/30 border-0 rounded-lg focus:ring-2 focus:ring-primary/20 focus:bg-background transition-all placeholder:text-muted-foreground/50" 
              value={q} 
              onChange={(e) => setQ(e.target.value)} 
              placeholder="Zoek op naam…" 
            />
          </div>
          
          {/* Toggle Pills */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setInStockOnly(!inStockOnly)}
              className={cn(
                "px-2.5 py-1 text-[10px] font-medium rounded-full transition-all",
                inStockOnly 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              )}
            >
              Voorraad
            </button>
            <button
              onClick={() => setGreenhouseOnly(!greenhouseOnly)}
              className={cn(
                "px-2.5 py-1 text-[10px] font-medium rounded-full transition-all",
                greenhouseOnly 
                  ? "bg-emerald-500 text-white shadow-sm" 
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              )}
            >
              Kas
            </button>
          </div>
          
          {/* Segmented Control - In Planner */}
          <div className="flex p-0.5 bg-muted/40 rounded-lg">
            {(["all", "planned", "unplanned"] as InPlanner[]).map((k) => (
              <button
                key={k}
                className={cn(
                  "flex-1 px-2 py-1.5 text-[10px] font-medium rounded-md transition-all",
                  inPlanner === k 
                    ? "bg-background text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setInPlanner(k)}
              >
                {k === "all" ? "Alle" : k === "planned" ? "Gepland" : "Ongepland"}
              </button>
            ))}
          </div>

          {/* Categorie filter */}
          <Popover>
            <PopoverTrigger asChild>
              <button className="w-full px-3 py-2 text-xs text-left rounded-lg flex justify-between items-center bg-muted/30 hover:bg-muted/50 transition-all group">
                <span className={cn(
                  "truncate",
                  cropTypeFilters.length === 0 ? "text-muted-foreground" : "text-foreground font-medium"
                )}>
                  {cropTypeFilters.length === 0
                    ? "Alle gewastypen"
                    : cropTypeFilters.length === 1
                    ? cropTypes.find((ct) => ct.id === cropTypeFilters[0])?.name || "Overig"
                    : `${cropTypeFilters.length} geselecteerd`}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-2 max-h-56 overflow-y-auto bg-popover/95 backdrop-blur-sm border-border/50 z-50">
              <div className="space-y-0.5">
                {cropTypeFilters.length > 0 && (
                  <button onClick={() => setCropTypeFilters([])} className="w-full text-left text-[11px] text-primary hover:underline px-2 py-1 mb-1">
                    Wis selectie
                  </button>
                )}
                {cropTypes.map((ct) => (
                  <label key={ct.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted/50 transition-colors">
                    <Checkbox
                      checked={cropTypeFilters.includes(ct.id)}
                      onCheckedChange={(checked) => {
                        if (checked) setCropTypeFilters([...cropTypeFilters, ct.id]);
                        else setCropTypeFilters(cropTypeFilters.filter((id) => id !== ct.id));
                      }}
                      className="h-3.5 w-3.5 rounded"
                    />
                    <span className="text-xs">{ct.name}</span>
                  </label>
                ))}
                <label className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted/50 transition-colors">
                  <Checkbox
                    checked={cropTypeFilters.includes("__none__")}
                    onCheckedChange={(checked) => {
                      if (checked) setCropTypeFilters([...cropTypeFilters, "__none__"]);
                      else setCropTypeFilters(cropTypeFilters.filter((id) => id !== "__none__"));
                    }}
                    className="h-3.5 w-3.5 rounded"
                  />
                  <span className="text-xs text-muted-foreground">Overig</span>
                </label>
              </div>
            </PopoverContent>
          </Popover>

          {/* Maand filter */}
          <Popover>
            <PopoverTrigger asChild>
              <button className="w-full px-3 py-2 text-xs text-left rounded-lg flex justify-between items-center bg-muted/30 hover:bg-muted/50 transition-all group">
                <span className={cn(
                  "truncate",
                  selectedMonths.length === 0 ? "text-muted-foreground" : "text-foreground font-medium"
                )}>
                  {selectedMonths.length === 0
                    ? "Alle maanden"
                    : selectedMonths.length === 1
                    ? new Date(2000, selectedMonths[0] - 1, 1).toLocaleString("nl-NL", { month: "long" })
                    : `${selectedMonths.length} maanden`}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-2 max-h-56 overflow-y-auto bg-popover/95 backdrop-blur-sm border-border/50 z-50">
              <div className="space-y-0.5">
                {selectedMonths.length > 0 && (
                  <button onClick={() => setSelectedMonths([])} className="w-full text-left text-[11px] text-primary hover:underline px-2 py-1 mb-1">
                    Wis selectie
                  </button>
                )}
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <label key={m} className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted/50 transition-colors">
                    <Checkbox
                      checked={selectedMonths.includes(m)}
                      onCheckedChange={(checked) => {
                        if (checked) setSelectedMonths([...selectedMonths, m].sort((a, b) => a - b));
                        else setSelectedMonths(selectedMonths.filter((month) => month !== m));
                      }}
                      className="h-3.5 w-3.5 rounded"
                    />
                    <span className="text-xs capitalize">
                      {new Date(2000, m - 1, 1).toLocaleString("nl-NL", { month: "long" })}
                    </span>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        
        {/* Scrollable seed list */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {filteredSeeds.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-xs text-muted-foreground">Geen zaden gevonden</p>
            </div>
          ) : (
            filteredSeeds.map((seed) => (
              <DraggableSeed 
                key={seed.id} 
                seed={seed} 
                isDragging={activeDragId === `seed-${seed.id}`}
                onInfoClick={() => setSeedDetailsModal(seed)}
              />
            ))
          )}
        </div>
        
        {/* Footer count */}
        <div className="px-3 py-2 border-t border-border/30 bg-muted/20">
          <p className="text-[10px] text-muted-foreground text-center">
            <span className="font-medium text-foreground">{filteredSeeds.length}</span> / {seeds.length} zaden
          </p>
        </div>
      </div>
    </aside>
  );

  /* ===== LIST view ===== */
  const listViewContent = (
    <div className="p-4 pb-8">
      <div className="space-y-6">
        {([["Buiten", outdoorBeds], ["Kas", greenhouseBeds]] as const).map(
          ([label, bedList]) =>
            bedList.length > 0 && (
              <section key={label} className="space-y-2">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{label}</h4>
                <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
                  {bedList.map((bed) => {
                    const activePlantings = plantings.filter((p) => p.garden_bed_id === bed.id && isActiveInWeek(p, currentWeek));
                    const futurePlantings = showGhosts
                      ? plantings.filter((p) => p.garden_bed_id === bed.id && !isActiveInWeek(p, currentWeek) && isFutureRelativeToWeek(p, currentWeek))
                      : [];
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

                        {/* Exact bed.segments rijen */}
                        <div className="grid gap-0.5" style={{ gridTemplateRows: `repeat(${bed.segments}, minmax(20px, auto))` }}>
                          {segs.map((i) => {
                            const here = activePlantings.filter((p) => {
                              const s = p.start_segment ?? 0,
                                u = p.segments_used ?? 1;
                              return i >= s && i < s + u;
                            });
                            const ghosts = futurePlantings.filter((p) => {
                              const s = p.start_segment ?? 0,
                                u = p.segments_used ?? 1;
                              return i >= s && i < s + u;
                            });

                            return (
                              <DroppableSegment key={i} id={`bed__${bed.id}__segment__${i}`} occupied={here.length > 0}>
                                <div className="flex flex-col gap-0.5 w-full px-0.5">
                                  {here.map((p) => {
                                    const seed = seedsById[p.seed_id];
                                    const color = p.color?.startsWith("#") ? p.color : "#22c55e";
                                    const hasConflict = (conflictsMap.get(p.id)?.length ?? 0) > 0;
                                    const iconUrl = getEffectiveIconUrl(seed, cropTypesById);
                                    const textColor = getContrastTextColor(color);

                                    return (
                                      <div
                                        key={`${p.id}-${i}`}
                                        className="relative rounded px-1.5 py-0.5 text-[10px] flex items-center justify-between overflow-hidden"
                                        style={{ background: color, color: textColor }}
                                        title={`${seed?.name ?? "—"} • ${fmtDMY(p.planned_date)} → ${fmtDMY(p.planned_harvest_end)}`}
                                      >
                                        {/* icon overlay */}
                                        {iconUrl && (
                                          <IconTilingOverlay iconUrl={iconUrl} segmentsUsed={1} densityPerSegment={10} opacity={0.85} />
                                        )}

                                        {/* label/content boven overlay */}
                                        <div className="relative z-20 flex items-center gap-0.5 min-w-0">
                                          <span className="truncate">{seed?.name ?? "—"}</span>
                                          {hasConflict && (
                                            <button
                                              className="text-[9px] underline decoration-white/70 underline-offset-1 opacity-90"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setView("conflicts");
                                                localStorage.setItem("plannerOpenTab", "conflicts");
                                              }}
                                              title="Bekijk in Conflicten"
                                            >
                                              ⚠️
                                            </button>
                                          )}
                                        </div>

                                        <div className="absolute top-0.5 right-0.5 flex items-center gap-0.5 ml-0.5 z-20">
                                          <button
                                            className="p-0.5 hover:bg-white/20 rounded"
                                            title="Bewerken"
                                            onClick={() =>
                                              setPopup({
                                                mode: "edit",
                                                planting: p,
                                                seed: seed!,
                                                bed,
                                                segmentIndex: p.start_segment ?? 0,
                                              })
                                            }
                                          >
                                            <Edit3 className="w-2.5 h-2.5" />
                                          </button>
                                          <button
                                            className="p-0.5 hover:bg-white/20 rounded"
                                            title="Verwijderen"
                                            onClick={() => {
                                              if (confirm("Verwijderen?")) deletePlanting(p.id).then(reload);
                                            }}
                                          >
                                            <Trash2 className="w-2.5 h-2.5" />
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}

                                  {ghosts.length > 0 && (
                                    <div
                                      className="text-white text-[9px] rounded px-1.5 py-0.5"
                                      style={{ background: "rgba(34,197,94,.35)", border: "1px dashed rgba(0,0,0,.35)" }}
                                    >
                                      {ghosts
                                        .map((g) => seedsById[g.seed_id]?.name)
                                        .filter(Boolean)
                                        .join(", ")}
                                    </div>
                                  )}
                                </div>
                              </DroppableSegment>
                            );
                          })}
                        </div>

                        {/* Hint naar Conflicten-tab */}
                        {bedHasConflict(bed.id) && (
                          <div className="mt-1.5 text-[10px] text-red-700">
                            ⚠️ Conflicten — <button
                              className="underline"
                              onClick={() => {
                                setView("conflicts");
                                localStorage.setItem("plannerOpenTab", "conflicts");
                              }}
                            >
                              Bekijk
                            </button>
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

  /* ===== MAP view — visual match met BedsPage, gedrag identiek ===== */
  function PlannerMap() {
    const viewportRef = useRef<HTMLDivElement | null>(null);

    // Zelfde globale canvas verhoudingen als BedsPage
    const CANVAS_W = 3000;
    const CANVAS_H = 1200;

    const [zoom, setZoom] = useState(() => {
      const saved = localStorage.getItem("plannerMapZoomV2");
      return saved ? parseFloat(saved) : 0.8;
    });
    const minZoom = 0.15;
    const maxZoom = 2;

    const clampZoom = (z: number) => Math.max(minZoom, Math.min(maxZoom, z));
    const handleManualZoom = (z: number) => {
      const v = clampZoom(z);
      setZoom(v);
      localStorage.setItem("plannerMapZoomV2", v.toString());
    };
    const fit = () => {
      const vp = viewportRef.current;
      if (!vp) return;
      const vw = vp.clientWidth - 24;
      const vh = vp.clientHeight - 24;
      const zx = vw / CANVAS_W;
      const zy = vh / CANVAS_H;
      handleManualZoom(Math.min(zx, zy));
    };

    useEffect(() => {
      // Auto-fit bij eerste render als niets opgeslagen is
      if (!localStorage.getItem("plannerMapZoomV2")) {
        const t = setTimeout(fit, 50);
        return () => clearTimeout(t);
      }
    }, []);

    const isActive = (p: Planting) => isActiveInWeek(p, currentWeek);
    const isFuture = (p: Planting) => showGhosts && isFutureRelativeToWeek(p, currentWeek);

    const ZoomControls = () => (
      <div className="flex items-center gap-2">
        <button className="inline-flex items-center gap-1 border rounded-md px-2 py-1 bg-secondary hover:bg-secondary/80" onClick={() => handleManualZoom(zoom - 0.1)} title="Uitzoomen">-</button>
        <input type="range" min={minZoom} max={maxZoom} step={0.05} value={zoom} onChange={(e) => handleManualZoom(parseFloat(e.target.value))} className="w-32" />
        <button className="inline-flex items-center gap-1 border rounded-md px-2 py-1 bg-secondary hover:bg-secondary/80" onClick={() => handleManualZoom(zoom + 0.1)} title="Inzoomen">+</button>
        <button className="inline-flex items-center gap-1 border rounded-md px-2 py-1 bg-secondary hover:bg-secondary/80" onClick={() => handleManualZoom(1)} title="100%">100%</button>
        <button className="inline-flex items-center gap-1 border rounded-md px-2 py-1" onClick={fit} title="Passend maken">Fit</button>
        <span className="text-xs text-muted-foreground ml-1">{Math.round(zoom * 100)}%</span>
      </div>
    );

    /* Helpers voor bed visuals */
    const WOOD_BORDER = 8;

    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Plattegrond</h3>
          <ZoomControls />
        </div>

        <div
          ref={viewportRef}
          className="relative w-full h-[70vh] rounded-xl border-2 border-amber-800/30 overflow-auto shadow-xl"
          style={{
            background: "linear-gradient(135deg, #2d5016 0%, #3a6b1e 25%, #2d5016 50%, #3a6b1e 75%, #2d5016 100%)",
          }}
        >
          <div className="relative" style={{ width: CANVAS_W * zoom, height: CANVAS_H * zoom }}>
            <div
              className="absolute left-0 top-0"
              style={{
                width: CANVAS_W,
                height: CANVAS_H,
                transform: `scale(${zoom})`,
                transformOrigin: "0 0",
                borderRadius: 12,
                // Gras textuur effect
                backgroundImage: `
                  radial-gradient(ellipse 3px 5px at 20% 30%, rgba(255,255,255,0.03) 0%, transparent 100%),
                  radial-gradient(ellipse 2px 4px at 60% 70%, rgba(255,255,255,0.02) 0%, transparent 100%),
                  radial-gradient(ellipse 4px 6px at 80% 20%, rgba(255,255,255,0.03) 0%, transparent 100%),
                  radial-gradient(ellipse 3px 5px at 40% 80%, rgba(255,255,255,0.02) 0%, transparent 100%),
                  repeating-linear-gradient(90deg, transparent 0px, transparent 8px, rgba(0,0,0,0.02) 8px, rgba(0,0,0,0.02) 9px),
                  repeating-linear-gradient(0deg, transparent 0px, transparent 12px, rgba(0,0,0,0.015) 12px, rgba(0,0,0,0.015) 13px)
                `,
              }}
            >
              {/* lichte zon lichtvlek */}
              <div 
                className="absolute inset-0 pointer-events-none"
                style={{ background: "radial-gradient(ellipse 80% 60% at 30% 20%, rgba(255,255,200,0.08) 0%, transparent 60%)" }}
              />

              {/* Render alle bedden */}
              {beds.map((bed) => {
                const w = Math.max(60, Math.round(bed.length_cm || 200));
                const h = Math.max(36, Math.round(bed.width_cm || 100));
                const x = bed.location_x ?? 20;
                const y = bed.location_y ?? 20;

                // Binnenruimte (zonder hout/aluminium rand)
                const innerW = Math.max(1, w - WOOD_BORDER * 2);
                const innerH = Math.max(1, h - WOOD_BORDER * 2);

                const segCount = Math.max(1, bed.segments);
                const vertical = innerW >= innerH; // segmentlijnen haaks op lange zijde

                const active = plantings.filter((p) => p.garden_bed_id === bed.id && isActive(p));
                const ghosts = plantings.filter((p) => p.garden_bed_id === bed.id && isFuture(p));

                return (
                  <div
                    key={bed.id}
                    className="absolute select-none"
                    style={{ left: x, top: y, width: w, height: h }}
                  >
                    {/* Schaduw onder de bak */}
                    <div 
                      className="absolute -bottom-4 left-1 right-1 h-5 rounded-full"
                      style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0.3) 0%, transparent 70%)" }}
                    />

                    {/* Frame */}
                    <div
                      className="absolute inset-0 rounded-lg"
                      style={{
                        background: bed.is_greenhouse
                          ? "linear-gradient(135deg, #e8e8e8 0%, #c0c0c0 50%, #e8e8e8 100%)"
                          : `
                            linear-gradient(180deg, 
                              #8B6914 0%, 
                              #7a5a12 15%, 
                              #6d4f0f 30%,
                              #5c4210 50%,
                              #6d4f0f 70%,
                              #7a5a12 85%,
                              #8B6914 100%
                            )
                          `,
                        boxShadow: bed.is_greenhouse
                          ? "0 4px 8px rgba(0,0,0,0.25), inset 1px 1px 0 rgba(255,255,255,0.4)"
                          : "inset 2px 2px 4px rgba(255,255,255,0.15), inset -2px -2px 4px rgba(0,0,0,0.2), 0 4px 8px rgba(0,0,0,0.3)",
                        padding: WOOD_BORDER,
                      }}
                    >
                      {/* Hout textuur overlay (alleen buiten) */}
                      {!bed.is_greenhouse && (
                        <div 
                          className="absolute inset-0 rounded-lg pointer-events-none opacity-30"
                          style={{
                            backgroundImage: `
                              repeating-linear-gradient(90deg, transparent 0px, transparent 20px, rgba(0,0,0,0.1) 20px, rgba(0,0,0,0.1) 21px),
                              repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(255,255,255,0.05) 3px, rgba(255,255,255,0.05) 4px)
                            `,
                          }}
                        />
                      )}

                      {/* Binnenruimte: aarde */}
                      <div
                        className="relative w-full h-full rounded-md overflow-hidden"
                        style={{
                          background: `
                            radial-gradient(ellipse at 30% 40%, rgba(101,67,33,1) 0%, transparent 50%),
                            radial-gradient(ellipse at 70% 60%, rgba(89,60,31,1) 0%, transparent 50%),
                            radial-gradient(ellipse at 50% 30%, rgba(110,75,38,1) 0%, transparent 40%),
                            linear-gradient(180deg, #5c4033 0%, #4a3328 50%, #3e2723 100%)
                          `,
                          boxShadow: "inset 0 2px 8px rgba(0,0,0,0.4)",
                        }}
                      >
                        {/* Glas reflectie (licht) voor kassen */}
                        {bed.is_greenhouse && (
                          <div 
                            className="absolute inset-0 pointer-events-none"
                            style={{
                              background: "linear-gradient(135deg, rgba(255,255,255,0.35) 0%, transparent 30%, transparent 70%, rgba(255,255,255,0.15) 100%)",
                            }}
                          />
                        )}

                        {/* Segment lijnen haaks op lange zijde (subtiel) */}
                        {segCount > 1 && (
                          <div
                            className="absolute inset-0 pointer-events-none"
                            style={{
                              backgroundImage: vertical
                                ? `repeating-linear-gradient(
                                    90deg,
                                    transparent 0px,
                                    transparent calc(${100 / segCount}% - 1px),
                                    rgba(255,255,255,0.08) calc(${100 / segCount}% - 1px),
                                    rgba(255,255,255,0.08) calc(${100 / segCount}%)
                                  )`
                                : `repeating-linear-gradient(
                                    0deg,
                                    transparent 0px,
                                    transparent calc(${100 / segCount}% - 1px),
                                    rgba(255,255,255,0.08) calc(${100 / segCount}% - 1px),
                                    rgba(255,255,255,0.08) calc(${100 / segCount}%)
                                  )`,
                            }}
                          />
                        )}

                        {/* Naam label (zwevend) */}
                        <div className="absolute inset-0 flex items-start justify-between p-1">
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
                            style={{
                              background: "rgba(255,255,255,0.85)",
                              color: bed.is_greenhouse ? "#2d5016" : "#3e2723",
                              boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
                              maxWidth: "70%",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={bed.name}
                          >
                            {bed.name}
                          </span>

                          <div className="flex items-center gap-1">
                            {bedHasConflict(bed.id) && (
                              <button
                                className="text-[11px] px-1.5 py-0.5 rounded bg-red-600/90 text-white"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setView("conflicts");
                                  localStorage.setItem("plannerOpenTab", "conflicts");
                                }}
                                title="Conflicten bekijken"
                              >
                                ⚠️
                              </button>
                            )}
                            {bed.is_greenhouse && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-600 text-white">Kas</span>
                            )}
                          </div>
                        </div>

                        {/* DnD droppable segmenten grid (onzichtbare targets) */}
                        <div
                          className="absolute inset-0 grid"
                          style={{
                            gridTemplateColumns: vertical ? `repeat(${segCount}, 1fr)` : "1fr",
                            gridTemplateRows: vertical ? "1fr" : `repeat(${segCount}, 1fr)`,
                          }}
                        >
                          {Array.from({ length: segCount }, (_, i) => (
                            <div key={i} className="relative">
                              <MapDroppable id={`bed__${bed.id}__segment__${i}`} />
                            </div>
                          ))}
                        </div>

                        {/* Actieve blokken */}
                        <div className="absolute inset-0">
                          {active.map((p) => {
                            const seed = seedsById[p.seed_id];
                            const start = p.start_segment ?? 0;
                            const used = Math.max(1, p.segments_used ?? 1);
                            const inset = 1;
                            const segW = vertical ? innerW / segCount : innerW;
                            const segH = vertical ? innerH : innerH / segCount;

                            const rect = vertical
                              ? { top: inset, height: Math.max(1, innerH - inset * 2), left: inset + start * segW, width: Math.max(1, used * segW - inset * 2) }
                              : { left: inset, width: Math.max(1, innerW - inset * 2), top: inset + start * segH, height: Math.max(1, used * segH - inset * 2) };
                            const color = p.color?.startsWith("#") ? p.color : "#22c55e";
                            const hasConflict = (conflictsMap.get(p.id)?.length ?? 0) > 0;
                            const iconUrl = getEffectiveIconUrl(seed, cropTypesById);

                            const textColor = getContrastTextColor(color);
                            return (
                              <div
                                key={p.id}
                                className={`absolute rounded text-[10px] px-1 flex items-center ${hasConflict ? "ring-2 ring-red-500 ring-offset-1" : ""} overflow-hidden`}
                                style={{ ...rect, backgroundColor: color, color: textColor }}
                                title={`${seed?.name ?? "—"} • ${fmtDMY(p.planned_date)} → ${fmtDMY(p.planned_harvest_end)}`}
                              >
                                {/* icon overlay */}
                                {iconUrl && (
                                  <IconTilingOverlay
                                    iconUrl={iconUrl}
                                    segmentsUsed={used}
                                    densityPerSegment={10}
                                    opacity={0.88}
                                  />
                                )}

                                {/* content boven overlay */}
                                <div className="relative z-20 truncate">
                                  <span className="truncate">{seed?.name ?? "—"}</span>
                                </div>

                                <div className="absolute top-0.5 right-0.5 flex gap-0.5 z-20">
                                  <button
                                    className="p-0.5 rounded hover:bg-white/20"
                                    title="Bewerken"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPopup({ mode: "edit", planting: p, seed: seed!, bed, segmentIndex: p.start_segment ?? 0 });
                                    }}
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                  <button
                                    className="p-0.5 rounded hover:bg-white/20"
                                    title="Verwijderen"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (confirm("Verwijderen?")) deletePlanting(p.id).then(reload);
                                    }}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Toekomstige 'ghosts' */}
                        {showGhosts && (
                          <div className="absolute inset-0 pointer-events-none">
                            {ghosts.map((p) => {
                              const seed = seedsById[p.seed_id];
                              if (!seed) return null;
                              const start = p.start_segment ?? 0;
                              const used = Math.max(1, p.segments_used ?? 1);
                              const inset = 1;
                              const segW = vertical ? innerW / segCount : innerW;
                              const segH = vertical ? innerH : innerH / segCount;
                              const bg = p.color?.startsWith("#") ? p.color : "rgba(34,197,94,.35)";
                              const ghostTextColor = getContrastTextColor(p.color);

                              const rect = vertical
                                ? { top: inset, height: Math.max(1, innerH - inset * 2), left: inset + start * segW, width: Math.max(1, used * segW - inset * 2) }
                                : { left: inset, width: Math.max(1, innerW - inset * 2), top: inset + start * segH, height: Math.max(1, used * segH - inset * 2) };

                              return (
                                <div
                                  key={`ghost-${p.id}`}
                                  className="absolute rounded text-[10px] px-1 flex items-center"
                                  style={{ ...rect, backgroundColor: bg, opacity: 0.35, border: "1px dashed rgba(0,0,0,.45)", color: ghostTextColor }}
                                >
                                  <span className="truncate">{seed.name}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
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
      <p className="text-sm text-muted-foreground">
        Ga door met je bestaande Conflicten-weergave. Deze Planner toont geen details in list/map, alleen hier.
      </p>
    </div>
  );

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col overflow-hidden -mx-6 -mb-6">
      {/* Header - fixed at top */}
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
            <button className="px-3 py-2 text-sm font-medium rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-all" onClick={gotoToday}>
              Vandaag
            </button>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="pb-3 flex items-center gap-2">
          {(
            [
              { key: "list", label: "Lijstweergave" },
              { key: "map", label: "Plattegrond" },
              { key: "timeline", label: "Timeline" },
              // ★ Nieuw tabje
              { key: "harvest", label: "Oogstagenda" },
              { key: "conflicts", label: "Conflicten" },
            ] as const
          ).map(({ key, label }) => {
            const active = view === key;
            const danger = key === "conflicts" && conflictCount > 0;
            return (
              <button
                key={key}
                onClick={() => setView(key as any)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  active 
                    ? (danger ? "bg-red-600 text-white shadow-sm" : "bg-primary text-primary-foreground shadow-sm") 
                    : danger 
                      ? "bg-red-50 text-red-700 hover:bg-red-100" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {label}
                {key === "conflicts" && conflictCount > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-white/20">{conflictCount}</span>
                )}
              </button>
            );
          })}
          
          {/* Toekomstige plantingen */}
          <button
            onClick={() => setShowGhosts(!showGhosts)}
            className={cn(
              "ml-auto px-3 py-2 text-sm font-medium rounded-lg transition-all",
              showGhosts 
                ? "bg-primary/10 text-primary" 
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            Toekomstige plantingen
          </button>
        </div>
      </header>

      {/* Conflict Warning */}
      {hasConflicts && (
        <div className="px-6 py-2 flex-shrink-0">
          <ConflictWarning conflictCount={conflictCount} />
        </div>
      )}

      <DndContext onDragStart={(e)=>setActiveDragId(String(e.active?.id ?? ""))} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 min-h-0">
          {(view === "list" || view === "map" || view === "timeline") && <SeedsSidebar />}
          
          <div className="flex-1 overflow-auto">
            {view === "list" && listViewContent}
            {view === "map" && (
              <div className="p-6 h-full flex flex-col gap-4">
                {/* Info showing current week from timeline filter */}
                <div className="flex items-center justify-between bg-card rounded-lg border px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">Plantingen voor:</span>
                    <span className="font-medium">
                      Week {weekOf(currentWeek)} • {format(currentWeek, "d MMM", { locale: nl })} - {format(addDays(currentWeek, 6), "d MMM yyyy", { locale: nl })}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {plantingsForMap.length} planting{plantingsForMap.length !== 1 ? "en" : ""}
                  </span>
                </div>
                
                <div className="flex-1 min-h-0">
                  <GardenPlotCanvas
                    beds={beds}
                    readOnly={true}
                    plantings={plantingsForMap}
                    onBedMove={async (id, x, y) => {
                      try {
                        await updateBed(id, { location_x: Math.round(x), location_y: Math.round(y) });
                        await reload();
                      } catch (e: any) {
                        console.error("Kon positie niet opslaan:", e);
                      }
                    }}
                  />
                </div>
              </div>
            )}
            {view === "timeline" && (
              <div className="p-6">
                <TimelineView beds={beds || []} plantings={plantings || []} seeds={seeds || []} conflictsMap={conflictsMap} currentWeek={currentWeek} onReload={reload} />
              </div>
            )}

            {/* ★ Nieuw: Oogstagenda (aparte component) */}
            {view === "harvest" && (
              <div className="p-6">
                <HarvestAgendaView
                  beds={beds || []}
                  seeds={seeds || []}
                  plantings={plantings || []}
                  cropTypes={cropTypes || []}
                  greenhouseOnly={greenhouseOnly}
                  cropTypeFilters={cropTypeFilters}
                />
              </div>
            )}

            {view === "conflicts" && <div className="p-6">{conflictsView}</div>}
          </div>
        </div>

        <DragOverlay dropAnimation={{ duration: 200, easing: "ease-out" }}>
          {activeSeed ? (
            <div className="px-3 py-2 rounded-lg border-2 border-primary bg-card text-sm flex items-center gap-3 pointer-events-none shadow-xl">
              <div
                className="w-4 h-4 rounded-full shadow-inner ring-2 ring-white"
                style={{ background: activeSeed.default_color?.startsWith("#") ? activeSeed.default_color : "#22c55e" }}
              />
              <span className="font-medium">{activeSeed.name}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Planting popup */}
      {popup && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" 
          onClick={() => setPopup(null)}
        >
          <div 
            className="bg-card/95 backdrop-blur-md rounded-2xl shadow-2xl w-full max-w-lg border border-border/50 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200" 
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/30 bg-gradient-to-r from-primary/5 to-transparent">
              <div className="flex items-center gap-3">
                <div 
                  className="w-4 h-4 rounded-full ring-2 ring-white shadow-md"
                  style={{ background: popup.seed.default_color?.startsWith("#") ? popup.seed.default_color : "#22c55e" }}
                />
                <div>
                  <h3 className="text-lg font-semibold">{popup.mode === "create" ? "Nieuwe planting" : "Planting bewerken"}</h3>
                  <p className="text-xs text-muted-foreground">{popup.seed.name}</p>
                </div>
              </div>
              <button 
                onClick={() => setPopup(null)}
                className="p-2 rounded-full hover:bg-muted/50 transition-colors"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            
            {/* Form */}
            <div className="p-5">
              <PlantingForm
                mode={popup.mode}
                seed={popup.seed}
                bed={popup.bed}
                beds={beds}
                defaultSegment={popup.segmentIndex}
                defaultDateISO={popup.mode === "edit" ? popup.planting.planned_date ?? toISO(addDays(currentWeek, 4)) : toISO(addDays(currentWeek, 4))}
                existing={popup.mode === "edit" ? popup.planting : undefined}
                allPlantings={plantings}
                onCancel={() => setPopup(null)}
                onConfirm={(startSegment, segmentsUsed, method, date, color, bedId) =>
                  handleConfirmPlanting({
                    mode: popup.mode,
                    target:
                      popup.mode === "create"
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
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-2 rounded shadow text-sm ${
            toast.tone === "ok" ? "bg-green-600 text-white" : toast.tone === "err" ? "bg-red-600 text-white" : "bg-gray-800 text-white"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Seed Details Modal */}
      {seedDetailsModal && (
        <SeedModal
          gardenId={garden.id}
          seed={seedDetailsModal}
          onClose={() => setSeedDetailsModal(null)}
          onSaved={async () => {
            await onDataChange();
            setSeedDetailsModal(null);
          }}
        />
      )}
    </div>
  );
}

/* ===== PlantingForm (ongewijzigd gedrag) ===== */
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
  defaultDateISO: string;
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
  const [date, setDate] = useState<string>(existing?.planned_date ?? defaultDateISO);
  const [color, setColor] = useState<string>(() =>
    existing?.color?.startsWith("#") ? (existing.color as string) : seed.default_color?.startsWith("#") ? seed.default_color! : "#22c55e"
  );
  const [bedId, setBedId] = useState<string>(existing?.garden_bed_id ?? bed.id);
  const [startSegment, setStartSegment] = useState<number>(existing?.start_segment ?? defaultSegment);
  const [monthDialogOpen, setMonthDialogOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const selectedBed = useMemo(() => beds.find((x) => x.id === bedId) ?? bed, [beds, bedId, bed]);
  const plantDate = useMemo(() => new Date(date), [date]);
  const hs = useMemo(() => addWeeks(plantDate, seed.grow_duration_weeks ?? 0), [plantDate, seed.grow_duration_weeks]);
  const he = useMemo(() => addDays(addWeeks(hs, seed.harvest_duration_weeks ?? 0), -1), [hs, seed.harvest_duration_weeks]);

  const validBeds = useMemo(() => {
    return (beds || []).filter((b) => {
      if (b.is_greenhouse && !seed.greenhouse_compatible) return false;
      const canSomewhere = findAllStartSegments(allPlantings, b, segmentsUsed, plantDate, he, existing?.id).length > 0;
      return canSomewhere;
    });
  }, [beds, seed.greenhouse_compatible, allPlantings, segmentsUsed, plantDate, he, existing?.id]);

  const startSegmentOptions = useMemo(() => {
    return findAllStartSegments(allPlantings, selectedBed, segmentsUsed, plantDate, he, existing?.id);
  }, [allPlantings, selectedBed, segmentsUsed, plantDate, he, existing?.id]);

  useEffect(() => {
    if (!startSegmentOptions.includes(startSegment)) {
      setStartSegment(startSegmentOptions.length > 0 ? startSegmentOptions[0] : 0);
    }
  }, [startSegmentOptions]); // eslint-disable-line

  const monthWarning = useMemo(() => {
    if (!date) return null;
    const dt = new Date(date);
    if (Number.isNaN(dt.getTime())) return null;

    const month = dt.getMonth() + 1; // 1-12
    const monthNames = ["","januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];

    const isGreenhouse = !!selectedBed.is_greenhouse;
    const allowedMonths = isGreenhouse ? (seed.greenhouse_months ?? []) : (seed.direct_plant_months ?? []);

    if (allowedMonths.length === 0) return null;
    if (allowedMonths.includes(month)) return null;

    const allowedNames = allowedMonths.map((m) => monthNames[m]).join(", ");
    return {
      title: "Maand niet geschikt",
      description: `"${seed.name}" mag niet in ${monthNames[month]} in ${isGreenhouse ? "de kas" : "de volle grond"} (${selectedBed.name}) worden geplant. Toegestane maanden: ${allowedNames}.`,
    };
  }, [date, seed, selectedBed]);

  const maxSegSpinner = Math.max(1, selectedBed.segments);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (monthWarning) {
          setMonthDialogOpen(true);
          return;
        }
        onConfirm(startSegment, segmentsUsed, method, date, color, bedId);
      }}
      className="space-y-5"
    >
      <AlertDialog open={monthDialogOpen} onOpenChange={setMonthDialogOpen}>
        <AlertDialogContent className="bg-card/95 backdrop-blur-md border-border/50">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              {monthWarning?.title ?? "Maand niet geschikt"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {monthWarning?.description ?? "Deze maand lijkt niet te kloppen voor dit gewas."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Terug</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700 rounded-lg"
              onClick={() => {
                setMonthDialogOpen(false);
                onConfirm(startSegment, segmentsUsed, method, date, color, bedId);
              }}
            >
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
            <SelectValue placeholder="Selecteer bak" />
          </SelectTrigger>
          <SelectContent className="bg-popover/95 backdrop-blur-md border-border/50">
            {validBeds.length === 0 && (
              <SelectItem value={bed.id}>{bed.name}</SelectItem>
            )}
            {validBeds.map((b) => (
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
        {validBeds.length === 0 && (
          <p className="text-[11px] text-red-500">Geen alternatieve bakken beschikbaar op deze datum.</p>
        )}
      </div>

      {/* Grid: Segment + Aantal */}
      <div className="grid grid-cols-2 gap-4">
        {/* Startsegment */}
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
          {startSegmentOptions.length === 0 && (
            <p className="text-[11px] text-red-500">Geen vrij segment beschikbaar.</p>
          )}
        </div>

        {/* Aantal segmenten */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Segmenten</label>
          <div className="relative">
            <input
              type="number"
              min={1}
              max={maxSegSpinner}
              value={segmentsUsed}
              onChange={(e) => setSegmentsUsed(clamp(parseInt(e.target.value || "1", 10), 1, maxSegSpinner))}
              className="w-full bg-muted/30 border-0 rounded-lg h-10 px-3 pr-12 text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">stuks</span>
          </div>
        </div>
      </div>

      {/* Zaaimethode */}
      {seed.sowing_type === "both" ? (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Zaaimethode</label>
          <div className="flex p-1 bg-muted/30 rounded-lg">
            <button
              type="button"
              onClick={() => setMethod("direct")}
              className={cn(
                "flex-1 px-3 py-2 text-xs font-medium rounded-md transition-all",
                method === "direct"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Direct zaaien
            </button>
            <button
              type="button"
              onClick={() => setMethod("presow")}
              className={cn(
                "flex-1 px-3 py-2 text-xs font-medium rounded-md transition-all",
                method === "presow"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Voorzaaien
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Zaaimethode</label>
          <p className="text-sm px-3 py-2 bg-muted/20 rounded-lg">
            {seed.sowing_type === "presow" ? "Voorzaaien" : "Direct zaaien"}
          </p>
        </div>
      )}

      {/* Datum + Kleur */}
      <div className="grid grid-cols-2 gap-4">
        {/* Datum */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Zaai/Plantdatum</label>
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "w-full bg-muted/30 border-0 rounded-lg h-10 px-3 text-left text-sm flex items-center gap-2 focus:ring-2 focus:ring-primary/20 transition-all hover:bg-muted/50",
                  !date && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                {date ? format(new Date(date), "d MMM yyyy", { locale: nl }) : "Kies datum"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-popover/95 backdrop-blur-md border-border/50" align="start">
              <Calendar
                mode="single"
                selected={date ? new Date(date) : undefined}
                onSelect={(d) => {
                  if (d) {
                    setDate(toISO(d));
                    setDatePickerOpen(false);
                  }
                }}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          <p className="text-[10px] text-muted-foreground">Bezet t/m {fmtDMY(toISO(he))}</p>
        </div>

        {/* Kleur */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Kleur</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-10 h-10 rounded-full cursor-pointer border-2 border-white shadow-md overflow-hidden [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-full appearance-none bg-transparent"
            />
            <input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="flex-1 bg-muted/30 border-0 rounded-lg h-10 px-3 text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none font-mono"
              placeholder="#22c55e"
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 pt-2 border-t border-border/30">
        <button 
          type="button" 
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-muted/50 hover:bg-muted transition-colors"
        >
          Annuleren
        </button>
        <button
          type="submit"
          disabled={startSegmentOptions.length === 0}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {mode === "create" ? "Planting toevoegen" : "Wijzigingen opslaan"}
        </button>
      </div>
    </form>
  );
}

export default PlannerPage;
