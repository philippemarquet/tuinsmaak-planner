// src/components/PlannerPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { Garden, GardenBed, Planting, Seed, CropType, UUID } from "../lib/types";
import { listBeds } from "../lib/api/beds";
import { listSeeds } from "../lib/api/seeds";
import { listPlantings, createPlanting, updatePlanting, deletePlanting } from "../lib/api/plantings";
import { listCropTypes } from "../lib/api/cropTypes";
import { DndContext, useDraggable, useDroppable, DragOverlay } from "@dnd-kit/core";
import { supabase } from "../lib/supabaseClient";
import { TimelineView } from "./TimelineView";
import { buildConflictsMap, countUniqueConflicts } from "../lib/conflicts";
import { ConflictWarning } from "./ConflictWarning";
import { Edit3, Trash2, ChevronDown, Info } from "lucide-react";
import { useConflictFlags } from "../hooks/useConflictFlags";
import { SeedDetailsModal } from "./SeedDetailsModal";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Checkbox } from "./ui/checkbox";

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
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] ${map[tone]}`}>{children}</span>;
}
function DraggableSeed({ seed, isDragging = false, onInfoClick }: { seed: Seed; isDragging?: boolean; onInfoClick?: () => void }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: `seed-${seed.id}` });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const color = seed.default_color?.startsWith("#") ? seed.default_color : "#22c55e";
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`px-2 py-1 border rounded-md bg-secondary text-sm flex items-center gap-2 ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <div {...listeners} {...attributes} className="flex items-center gap-2 flex-1 cursor-move min-w-0">
        <span className="inline-block w-3 h-3 rounded flex-shrink-0" style={{ background: color }} />
        <span className="truncate">{seed.name}</span>
      </div>
      {onInfoClick && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onInfoClick();
          }}
          className="p-1 hover:bg-muted rounded flex-shrink-0"
          title="Bekijk zaadgegevens"
        >
          <Info className="h-3.5 w-3.5" />
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
      className={`border border-dashed rounded-sm min-h-[28px] flex items-center justify-center transition ${
        isOver ? "bg-green-200" : occupied ? "bg-emerald-50" : "bg-muted"
      }`}
    >
      {children}
    </div>
  );
}
function MapDroppable({ id }: { id: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef} className={`w-full h-full ${isOver ? "bg-green-200/40" : "bg-transparent"}`} />;
}

/* ===== main ===== */
type InPlanner = "all" | "planned" | "unplanned";

export function PlannerPage({ garden }: { garden: Garden }) {
  const [beds, setBeds] = useState<GardenBed[]>([]);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [plantings, setPlantings] = useState<Planting[]>([]);
  const [cropTypes, setCropTypes] = useState<CropType[]>([]);

  const [view, setView] = useState<"list" | "map" | "conflicts" | "timeline">(
    () => (localStorage.getItem("plannerOpenTab") as any) || (localStorage.getItem("plannerView") as any) || "list"
  );
  const [q, setQ] = useState(localStorage.getItem("plannerQ") ?? "");
  const [inStockOnly, setInStockOnly] = useState(localStorage.getItem("plannerInStock") === "1");
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

  const [showGhosts, setShowGhosts] = useState(localStorage.getItem("plannerShowGhosts") === "0" ? false : true);
  const [currentWeek, setCurrentWeek] = useState<Date>(() => {
    const saved = localStorage.getItem("plannerWeekISO");
    if (saved) return new Date(saved);
    const n = new Date();
    const d = new Date(n);
    d.setDate(n.getDate() - ((n.getDay() || 7) - 1));
    return d; // maandag
  });

  // toast
  const [toast, setToast] = useState<{ msg: string; tone: "info" | "ok" | "err" } | null>(null);
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

  // effects
  const reload = async () => {
    const [b, s, p, ct] = await Promise.all([listBeds(garden.id), listSeeds(garden.id), listPlantings(garden.id), listCropTypes()]);
    setBeds(b);
    setSeeds(s);
    setPlantings(p);
    setCropTypes(ct);
  };
  useEffect(() => {
    reload().catch(console.error);
  }, [garden.id]);
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
  const outdoorBeds = useMemo(() => beds.filter((b) => !b.is_greenhouse).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)), [beds]);
  const greenhouseBeds = useMemo(() => beds.filter((b) => b.is_greenhouse).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)), [beds]);

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

    // maand (multi-select)
    if (selectedMonths.length > 0) {
      arr = arr.filter((s: any) => {
        const months: number[] =
          (s as any).direct_plant_months ??
          (s as any).direct_sow_months ??
          [];
        return Array.isArray(months) && months.some((m) => selectedMonths.includes(m));
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
  function handleDragStart(ev: any) {
    setActiveDragId(String(ev.active?.id ?? ""));
  }
  function handleDragEnd(ev: any) {
    const over = ev.over;
    const active = String(ev.active?.id ?? "");
    setActiveDragId(null);
    if (!over || !active.startsWith("seed-")) return;
    const seedId = active.replace("seed-", "");
    const seed = seeds.find((s) => s.id === seedId);
    if (!seed) return;
    const [prefix, bedId, , segStr] = String(over.id).split("__");
    if (!prefix.startsWith("bed")) return;
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

  /* ===== LIST view ===== */
  const seedsList = (
    <div className="sticky top-24">
      <div className="space-y-3 max-h-[calc(100vh-7rem)] overflow-auto pr-1 pb-3">
        <h3 className="text-base font-semibold">Zoek/filters</h3>
        <input className="w-full border rounded px-2 py-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek op naam…" />
        <div className="text-sm space-y-1">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} />
            In voorraad
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={greenhouseOnly} onChange={(e) => setGreenhouseOnly(e.target.checked)} />
            Alleen kas-geschikt
          </label>
          <div className="flex gap-2">
            {(["all", "planned", "unplanned"] as InPlanner[]).map((k) => (
              <button
                key={k}
                className={`px-2 py-0.5 rounded border text-xs ${
                  inPlanner === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
                onClick={() => setInPlanner(k)}
              >
                {k === "all" ? "Alle" : k === "planned" ? "Gepland" : "Niet gepland"}
              </button>
            ))}
          </div>

          {/* Categorie (multi-select met popover) */}
          <div>
            <label className="block text-xs mb-1">Categorie</label>
            <Popover>
              <PopoverTrigger asChild>
                <button className="w-full border rounded px-2 py-1 text-left text-sm flex justify-between items-center bg-card hover:bg-muted/50">
                  <span className="truncate">
                    {cropTypeFilters.length === 0
                      ? "Alle gewastypen"
                      : cropTypeFilters.length === 1
                      ? cropTypes.find((ct) => ct.id === cropTypeFilters[0])?.name || "Overig"
                      : `${cropTypeFilters.length} geselecteerd`}
                  </span>
                  <ChevronDown className="h-4 w-4 ml-2 flex-shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3 max-h-64 overflow-y-auto bg-popover z-50">
                <div className="space-y-2">
                  {cropTypeFilters.length > 0 && (
                    <button
                      onClick={() => setCropTypeFilters([])}
                      className="text-xs text-primary hover:underline mb-2"
                    >
                      Wis selectie
                    </button>
                  )}
                  {cropTypes.map((ct) => (
                    <label key={ct.id} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={cropTypeFilters.includes(ct.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setCropTypeFilters([...cropTypeFilters, ct.id]);
                          } else {
                            setCropTypeFilters(cropTypeFilters.filter((id) => id !== ct.id));
                          }
                        }}
                      />
                      <span className="text-sm">{ct.name}</span>
                    </label>
                  ))}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={cropTypeFilters.includes("__none__")}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setCropTypeFilters([...cropTypeFilters, "__none__"]);
                        } else {
                          setCropTypeFilters(cropTypeFilters.filter((id) => id !== "__none__"));
                        }
                      }}
                    />
                    <span className="text-sm">Overig (geen soort)</span>
                  </label>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Direct/Plant-maand (multi-select met popover) */}
          <div>
            <label className="block text-xs mb-1">Direct/Plant maand</label>
            <Popover>
              <PopoverTrigger asChild>
                <button className="w-full border rounded px-2 py-1 text-left text-sm flex justify-between items-center bg-card hover:bg-muted/50">
                  <span className="truncate">
                    {selectedMonths.length === 0
                      ? "Alle maanden"
                      : selectedMonths.length === 1
                      ? new Date(2000, selectedMonths[0] - 1, 1).toLocaleString("nl-NL", { month: "long" })
                      : `${selectedMonths.length} geselecteerd`}
                  </span>
                  <ChevronDown className="h-4 w-4 ml-2 flex-shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3 max-h-64 overflow-y-auto bg-popover z-50">
                <div className="space-y-2">
                  {selectedMonths.length > 0 && (
                    <button
                      onClick={() => setSelectedMonths([])}
                      className="text-xs text-primary hover:underline mb-2"
                    >
                      Wis selectie
                    </button>
                  )}
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <label key={m} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={selectedMonths.includes(m)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedMonths([...selectedMonths, m].sort((a, b) => a - b));
                          } else {
                            setSelectedMonths(selectedMonths.filter((month) => month !== m));
                          }
                        }}
                      />
                      <span className="text-sm">
                        {new Date(2000, m - 1, 1).toLocaleString("nl-NL", { month: "long" })}
                      </span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <h3 className="text-base font-semibold mt-2">Zaden</h3>
        <div className="space-y-1.5">
          {filteredSeeds.map((seed) => (
            <DraggableSeed 
              key={seed.id} 
              seed={seed} 
              isDragging={activeDragId === `seed-${seed.id}`}
              onInfoClick={() => setSeedDetailsModal(seed)}
            />
          ))}
          {filteredSeeds.length === 0 && <p className="text-xs text-muted-foreground">Geen zaden gevonden.</p>}
        </div>
      </div>
    </div>
  );

  const listView = (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
      <div>{seedsList}</div>
      <div className="md:col-span-3 space-y-6">
        {([["Buiten", outdoorBeds], ["Kas", greenhouseBeds]] as const).map(
          ([label, bedList]) =>
            bedList.length > 0 && (
              <section key={label} className="space-y-2">
                <h4 className="text-lg font-semibold">{label}</h4>
                <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
                  {bedList.map((bed) => {
                    const activePlantings = plantings.filter((p) => p.garden_bed_id === bed.id && isActiveInWeek(p, currentWeek));
                    const futurePlantings = showGhosts
                      ? plantings.filter((p) => p.garden_bed_id === bed.id && !isActiveInWeek(p, currentWeek) && isFutureRelativeToWeek(p, currentWeek))
                      : [];
                    const segs = Array.from({ length: bed.segments }, (_, i) => i);

                    return (
                      <div key={bed.id} className="p-2.5 border rounded-xl bg-card shadow-sm">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <h5 className="font-semibold text-sm">{bed.name}</h5>
                            {bedHasConflict(bed.id) && <Chip tone="danger">⚠️</Chip>}
                          </div>
                          {bed.is_greenhouse && <Chip>Kas</Chip>}
                        </div>

                        {/* Let op: we tonen exact bed.segments rijen, nooit meer */}
                        <div className="grid gap-1" style={{ gridTemplateRows: `repeat(${bed.segments}, minmax(26px, auto))` }}>
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
                                <div className="flex flex-col gap-0.5 w-full px-1">
                                  {here.map((p) => {
                                    const seed = seedsById[p.seed_id];
                                    const color = p.color?.startsWith("#") ? p.color : "#22c55e";
                                    const hasConflict = (conflictsMap.get(p.id)?.length ?? 0) > 0;

                                    return (
                                      <div
                                        key={`${p.id}-${i}`}
                                        className="rounded px-2 py-1 text-white text-[11px] flex items-center justify-between"
                                        style={{ background: color }}
                                        title={`${seed?.name ?? "—"} • ${fmtDMY(p.planned_date)} → ${fmtDMY(p.planned_harvest_end)}`}
                                      >
                                        <div className="flex items-center gap-1 min-w-0">
                                          <span className="truncate">{seed?.name ?? "—"}</span>
                                          {hasConflict && (
                                            <button
                                              className="text-[10px] underline decoration-white/70 underline-offset-2 opacity-90"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setView("conflicts");
                                                localStorage.setItem("plannerOpenTab", "conflicts");
                                              }}
                                              title="Bekijk in Conflicten"
                                            >
                                              ⚠️ Conflicten
                                            </button>
                                          )}
                                        </div>

                                        <div className="flex items-center gap-1 ml-1">
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
                                            <Edit3 className="w-3 h-3" />
                                          </button>
                                          <button
                                            className="p-0.5 hover:bg-white/20 rounded"
                                            title="Verwijderen"
                                            onClick={() => {
                                              if (confirm("Verwijderen?")) deletePlanting(p.id).then(reload);
                                            }}
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}

                                  {ghosts.length > 0 && (
                                    <div
                                      className="text-white text-[11px] rounded px-2 py-1"
                                      style={{ background: "rgba(34,197,94,.35)", border: "1px dashed rgba(0,0,0,.45)" }}
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

                        {/* Footer: eenvoudige hint naar Conflicten-tab als dit bed issues heeft */}
                        {bedHasConflict(bed.id) && (
                          <div className="mt-2 text-[11px] text-red-700">
                            ⚠️ Er zijn conflicten in deze bak. Ga naar het tabblad <button
                              className="underline"
                              onClick={() => {
                                setView("conflicts");
                                localStorage.setItem("plannerOpenTab", "conflicts");
                              }}
                            >
                              Conflicten
                            </button>{" "}
                            om op te lossen.
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

  /* ===== MAP view (ongewijzigd t.o.v. gedrag; alleen geen conflict-details) ===== */
  function PlannerMap() {
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const BASE_W = 2400,
      BASE_H = 1400;

    const [zoom, setZoom] = useState(() => {
      const saved = localStorage.getItem("plannerMapZoom");
      return saved ? parseFloat(saved) : 1;
    });
    const [isInitialized, setIsInitialized] = useState(false);
    const [isManualZoom, setIsManualZoom] = useState(() => localStorage.getItem("plannerMapManualZoom") === "1");

    const clampZoom = (z: number) => Math.max(0.25, Math.min(3, z));

    const fit = () => {
      const vp = viewportRef.current;
      if (!vp) return;
      const zx = (vp.clientWidth - 24) / BASE_W;
      const zy = (vp.clientHeight - 24) / BASE_H;
      const fitZoom = clampZoom(Math.min(zx, zy));
      setZoom(fitZoom);
      localStorage.setItem("plannerMapZoom", fitZoom.toString());
    };

    const handleManualZoom = (newZoom: number) => {
      const clampedZoom = clampZoom(newZoom);
      setZoom(clampedZoom);
      setIsManualZoom(true);
      localStorage.setItem("plannerMapZoom", clampedZoom.toString());
      localStorage.setItem("plannerMapManualZoom", "1");
    };
    const handleFitClick = () => {
      fit();
      setIsManualZoom(false);
      localStorage.setItem("plannerMapManualZoom", "0");
    };

    useEffect(() => {
      const timer = setTimeout(() => {
        if (!isManualZoom) fit();
        setIsInitialized(true);
      }, 50);
      return () => clearTimeout(timer);
    }, [isManualZoom]);

    const active = (p: Planting) => isActiveInWeek(p, currentWeek);
    const future = (p: Planting) => showGhosts && isFutureRelativeToWeek(p, currentWeek);

    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Plattegrond</h3>
          <div className="flex items-center gap-2">
            <button className="border rounded px-2 py-1" onClick={() => handleManualZoom(zoom - 0.1)}>
              -
            </button>
            <input className="w-40" type="range" min={0.25} max={3} step={0.05} value={zoom} onChange={(e) => handleManualZoom(parseFloat(e.target.value))} />
            <button className="border rounded px-2 py-1" onClick={() => handleManualZoom(zoom + 0.1)}>
              +
            </button>
            <button className="border rounded px-2 py-1" onClick={() => handleManualZoom(1)}>
              100%
            </button>
            <button className="border rounded px-2 py-1" onClick={handleFitClick}>
              Fit
            </button>
          </div>
        </div>

        <div ref={viewportRef} className="relative w-full h-[70vh] rounded-xl border overflow-auto bg-background" style={{ minWidth: "100%", minHeight: "70vh" }}>
          <div className="relative" style={{ width: BASE_W * zoom, height: BASE_H * zoom, transition: isInitialized ? "none" : "opacity 0.1s ease-out", opacity: isInitialized ? 1 : 0 }}>
            <div
              className="absolute left-0 top-0"
              style={{
                width: BASE_W,
                height: BASE_H,
                transform: `scale(${zoom})`,
                transformOrigin: "0 0",
                willChange: "transform",
                backgroundImage:
                  "linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(180deg, rgba(0,0,0,0.04) 1px, transparent 1px)",
                backgroundSize: "24px 24px",
                borderRadius: 12,
                contain: "layout style paint",
              }}
            >
              {beds.map((bed) => {
                const w = Math.max(60, Math.round(bed.length_cm || 200));
                const h = Math.max(36, Math.round(bed.width_cm || 100));
                const x = bed.location_x ?? 20;
                const y = bed.location_y ?? 20;

                const HEADER = 28;
                const innerW = w,
                  innerH = Math.max(1, h - HEADER);
                const segCount = Math.max(1, bed.segments);
                const vertical = innerW >= innerH;
                const segW = vertical ? innerW / segCount : innerW;
                const segH = vertical ? innerH : innerH / segCount;

                const act = plantings.filter((p) => p.garden_bed_id === bed.id && active(p));
                const fut = plantings.filter((p) => p.garden_bed_id === bed.id && future(p));

                return (
                  <div key={bed.id} className={`absolute rounded-lg shadow-sm border select-none ${bed.is_greenhouse ? "border-green-600/60 bg-green-50" : "bg-white"}`} style={{ left: x, top: y, width: w, height: h }}>
                    <div className="flex items-center justify-between px-2 py-1 border-b bg-muted/50 rounded-t-lg" style={{ height: HEADER }}>
                      <span className="text-xs font-medium truncate">{bed.name}</span>
                      <div className="flex items-center gap-2">
                        {bedHasConflict(bed.id) && <span className="text-[11px] text-red-700">⚠️</span>}
                        {bed.is_greenhouse && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-600 text-white">Kas</span>}
                      </div>
                    </div>

                    <div className="relative w-full" style={{ height: innerH }}>
                      {/* grid for droppables */}
                      <div className="absolute inset-0 grid" style={{ gridTemplateColumns: vertical ? `repeat(${segCount}, 1fr)` : "1fr", gridTemplateRows: vertical ? "1fr" : `repeat(${segCount}, 1fr)` }}>
                        {Array.from({ length: segCount }, (_, i) => (
                          <div key={i} className="relative">
                            <MapDroppable id={`bed__${bed.id}__segment__${i}`} />
                            <div className="absolute inset-0 pointer-events-none border border-dashed border-black/10" />
                          </div>
                        ))}
                      </div>

                      {/* active blocks */}
                      <div className="absolute inset-0">
                        {act.map((p) => {
                          const seed = seedsById[p.seed_id];
                          const start = p.start_segment ?? 0;
                          const used = Math.max(1, p.segments_used ?? 1);
                          const inset = 1;
                          const rect = vertical
                            ? { top: inset, height: Math.max(1, innerH - inset * 2), left: inset + start * segW, width: Math.max(1, used * segW - inset * 2) }
                            : { left: inset, width: Math.max(1, innerW - inset * 2), top: inset + start * segH, height: Math.max(1, used * segH - inset * 2) };
                          const color = p.color?.startsWith("#") ? p.color : "#22c55e";
                          const hasConflict = (conflictsMap.get(p.id)?.length ?? 0) > 0;

                          return (
                            <div key={p.id} className={`absolute rounded text-white text-[10px] px-1 flex items-center ${hasConflict ? "ring-2 ring-red-500 ring-offset-1" : ""}`} style={{ ...rect, backgroundColor: color }}>
                              <span className="truncate">{seed?.name ?? "—"}</span>
                              {hasConflict && (
                                <button
                                  className="ml-1 underline"
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

                              <div className="absolute top-0.5 right-0.5 flex gap-0.5">
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

                      {/* future ghosts */}
                      {showGhosts && (
                        <div className="absolute inset-0 pointer-events-none">
                          {fut.map((p) => {
                            const seed = seedsById[p.seed_id];
                            if (!seed) return null;
                            const start = p.start_segment ?? 0;
                            const used = Math.max(1, p.segments_used ?? 1);
                            const inset = 1;
                            const rect = vertical
                              ? { top: inset, height: Math.max(1, innerH - inset * 2), left: inset + start * segW, width: Math.max(1, used * segW - inset * 2) }
                              : { left: inset, width: Math.max(1, innerW - inset * 2), top: inset + start * segH, height: Math.max(1, used * segH - inset * 2) };
                            const bg = p.color?.startsWith("#") ? p.color : "rgba(34,197,94,.35)";
                            return (
                              <div key={`ghost-${p.id}`} className="absolute rounded text-white text-[10px] px-1 flex items-center" style={{ ...rect, backgroundColor: bg, opacity: 0.35, border: "1px dashed rgba(0,0,0,.45)" }}>
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

  /* ===== CONFLICTS view (ongewijzigde logica; resolutie via dit tab) ===== */
  // We hergebruiken je bestaande conflictsView component uit je project;
  // PlannerPage pusht alleen de gebruiker hierheen. (Geen auto-fix knoppen.)

  const conflictsView = (
    <div className="space-y-2">
      {/* Het eigenlijke conflictdetail-scherm zit in jouw bestaande Conflicts-tab componenten.
          Als je die in dit bestand renderde, kun je ze hier aanroepen; zo niet, laat dit als placeholder. */}
      <p className="text-sm text-muted-foreground">
        Ga door met je bestaande Conflicten-weergave. Deze Planner toont geen details in list/map, alleen hier.
      </p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b">
        <div className="py-2.5 flex items-center justify-between">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            Planner
            {hasConflicts && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-red-100 text-red-800 border border-red-200">
                ⚠️ {conflictCount} conflict{conflictCount !== 1 ? "en" : ""}
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2 text-sm">
            <button className="px-2 py-1 border rounded" onClick={() => setCurrentWeek(addDays(currentWeek, -7))}>
              ← Vorige week
            </button>
            <span className="font-medium px-2 py-1 rounded">WK {weekOf(currentWeek)}</span>
            <button className="px-2 py-1 border rounded" onClick={() => setCurrentWeek(addDays(currentWeek, 7))}>
              Volgende week →
            </button>
            <button className="px-2 py-1 border rounded" onClick={gotoToday}>
              Vandaag
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3 pb-2">
          {(["list", "map", "timeline", "conflicts"] as const).map((k) => {
            const active = view === k;
            const danger = k === "conflicts" && conflictCount > 0;
            return (
              <button
                key={k}
                onClick={() => setView(k)}
                className={`px-3 py-1.5 text-sm rounded-md border ${
                  active ? (danger ? "bg-red-600 text-white border-red-600" : "bg-primary text-primary-foreground") : danger ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100" : "bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {k === "list" ? "Lijstweergave" : k === "map" ? "Plattegrond" : k === "timeline" ? "Timeline" : "Conflicten"}
                {k === "conflicts" && conflictCount > 0 && (
                  <span className="ml-1.5 px-1 py-0.5 text-xs rounded-full bg-white/20">{conflictCount}</span>
                )}
              </button>
            );
          })}
          <label className="ml-auto mr-1 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showGhosts} onChange={(e) => setShowGhosts(e.target.checked)} />
            Toon toekomstige plantingen
          </label>
        </div>
      </div>

      {/* Conflict Warning (zonder auto-resolve-knop) */}
      {hasConflicts && <ConflictWarning conflictCount={conflictCount} />}

      <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {view === "list" && listView}
        {view === "map" && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <div>{seedsList}</div>
            <div className="md:col-span-3">
              <PlannerMap />
            </div>
          </div>
        )}
        {view === "timeline" && (
          <div className="space-y-4">
            <TimelineView beds={beds || []} plantings={plantings || []} seeds={seeds || []} conflictsMap={conflictsMap} currentWeek={currentWeek} onReload={reload} />
          </div>
        )}
        {view === "conflicts" && conflictsView}

        <DragOverlay dropAnimation={null}>
          {activeSeed ? (
            <div className="px-2 py-1 border rounded-md bg-secondary text-sm flex items-center gap-2 pointer-events-none shadow-lg">
              <span
                className="inline-block w-3 h-3 rounded"
                style={{ background: activeSeed.default_color?.startsWith("#") ? activeSeed.default_color : "#22c55e" }}
              />
              <span className="truncate">{activeSeed.name}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Planting popup */}
      {popup && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center z-50" onClick={() => setPopup(null)}>
          <div className="bg-card p-5 rounded-lg shadow-lg w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">{popup.mode === "create" ? "Nieuwe planting" : "Planting bewerken"}</h3>
            <PlantingForm
              mode={popup.mode}
              seed={popup.seed}
              bed={popup.bed}
              beds={beds}
              defaultSegment={popup.segmentIndex}
              defaultDateISO={popup.mode === "edit" ? popup.planting.planned_date ?? toISO(currentWeek) : toISO(currentWeek)}
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
        <SeedDetailsModal
          seed={seedDetailsModal}
          cropTypes={cropTypes}
          onClose={() => setSeedDetailsModal(null)}
        />
      )}
    </div>
  );
}

/* ===== PlantingForm (met bed-wissel + startsegment-dropdown) ===== */
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

  // bereken einddatum o.b.v. seed-waarden
  const plantDate = useMemo(() => new Date(date), [date]);
  const hs = useMemo(() => addWeeks(plantDate, seed.grow_duration_weeks ?? 0), [plantDate, seed.grow_duration_weeks]);
  const he = useMemo(() => addDays(addWeeks(hs, seed.harvest_duration_weeks ?? 0), -1), [hs, seed.harvest_duration_weeks]);

  // geldige bedden en startsegmenten
  const validBeds = useMemo(() => {
    return (beds || []).filter((b) => {
      // kas-compatibiliteit: als bed kas is, zaad moet het kunnen
      if (b.is_greenhouse && !seed.greenhouse_compatible) return false;
      const canSomewhere = findAllStartSegments(allPlantings, b, segmentsUsed, plantDate, he, existing?.id).length > 0;
      return canSomewhere;
    });
  }, [beds, seed.greenhouse_compatible, allPlantings, segmentsUsed, plantDate, he, existing?.id]);

  const startSegmentOptions = useMemo(() => {
    const b = beds.find((x) => x.id === bedId) ?? bed;
    return findAllStartSegments(allPlantings, b, segmentsUsed, plantDate, he, existing?.id);
  }, [beds, bedId, bed, allPlantings, segmentsUsed, plantDate, he, existing?.id]);

  useEffect(() => {
    // Als huidige startSegment ongeldig wordt (door bed/segmentsUsed/date), pak eerste geldige
    if (!startSegmentOptions.includes(startSegment)) {
      setStartSegment(startSegmentOptions.length > 0 ? startSegmentOptions[0] : 0);
    }
  }, [startSegmentOptions]); // eslint-disable-line

  const selectedBed = beds.find((x) => x.id === bedId) ?? bed;
  const maxSegSpinner = Math.max(1, selectedBed.segments);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm(startSegment, segmentsUsed, method, date, color, bedId);
      }}
      className="space-y-4"
    >
      {/* Bed wisselen */}
      <div>
        <label className="block text-sm font-medium mb-1">Bak</label>
        <select className="border rounded px-2 py-1 w-full" value={bedId} onChange={(e) => setBedId(e.target.value)}>
          {validBeds.length === 0 && <option value={bed.id}>{bed.name}</option>}
          {validBeds.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} {b.is_greenhouse ? "(kas)" : ""}
            </option>
          ))}
        </select>
        {validBeds.length === 0 && <p className="text-xs text-red-700 mt-1">Geen alternatieve bakken beschikbaar op deze datum.</p>}
      </div>

      {/* Startsegment keuze */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Startsegment</label>
          <select
            className="border rounded px-2 py-1 w-full"
            value={startSegment}
            onChange={(e) => setStartSegment(parseInt(e.target.value, 10))}
          >
            {startSegmentOptions.map((s) => (
              <option key={s} value={s}>
                Segment {s + 1}
              </option>
            ))}
          </select>
          {startSegmentOptions.length === 0 && (
            <p className="text-xs text-red-700 mt-1">Geen vrij startsegment in deze bak voor deze datums.</p>
          )}
        </div>

        {/* Aantal segmenten (spinner) */}
        <div>
          <label className="block text-sm font-medium mb-1">Aantal segmenten</label>
          <input
            type="number"
            min={1}
            max={maxSegSpinner}
            value={segmentsUsed}
            onChange={(e) => setSegmentsUsed(clamp(parseInt(e.target.value || "1", 10), 1, maxSegSpinner))}
            className="border rounded px-2 py-1 w-full"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Beslaat {segmentsUsed} segment(en) vanaf segment {startSegment + 1}.
          </p>
        </div>
      </div>

      {/* Methode */}
      <div>
        <label className="block text-sm font-medium mb-1">Zaaimethode</label>
        {seed.sowing_type === "both" ? (
          <select className="border rounded px-2 py-1 w-full" value={method} onChange={(e) => setMethod(e.target.value as any)}>
            <option value="direct">Direct</option>
            <option value="presow">Voorzaaien</option>
          </select>
        ) : (
          <div className="text-sm">{seed.sowing_type === "presow" ? "Voorzaaien" : "Direct"}</div>
        )}
      </div>

      {/* Datum + kleur */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Zaai/Plantdatum</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border rounded px-2 py-1 w-full" />
          <p className="text-xs text-muted-foreground mt-1">
            Bezetting telt vanaf deze datum t/m {fmtDMY(toISO(he))}.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Kleur in planner</label>
          <div className="flex items-center gap-2">
            <input value={color} onChange={(e) => setColor(e.target.value)} className="border rounded px-2 py-1 w-full" placeholder="#22c55e" />
            <span className="inline-block w-6 h-6 rounded border" style={{ background: color }} />
          </div>
        </div>
      </div>

      {/* Acties */}
      <div className="flex justify-end gap-2">
        <button type="button" className="px-3 py-1 border rounded bg-muted" onClick={onCancel}>
          Annuleren
        </button>
        <button
          type="submit"
          className="px-3 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50"
          disabled={startSegmentOptions.length === 0}
        >
          {mode === "create" ? "Opslaan" : "Bijwerken"}
        </button>
      </div>
    </form>
  );
}

export default PlannerPage;
