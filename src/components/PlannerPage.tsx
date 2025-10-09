// src/components/PlannerPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { Garden, GardenBed, Planting, Seed } from "../lib/types";
import { listBeds } from "../lib/api/beds";
import { listSeeds } from "../lib/api/seeds";
import {
  createPlanting,
  listPlantings,
  deletePlanting,
  updatePlanting,
} from "../lib/api/plantings";
import { DndContext, useDraggable, useDroppable, DragOverlay } from "@dnd-kit/core";
import { supabase } from "../lib/supabaseClient";
import { TimelineView } from "./TimelineView";
import { buildConflictsMap, countUniqueConflicts } from "../lib/conflicts";
import { ConflictWarning } from "./ConflictWarning";
import { Edit3, Trash2 } from "lucide-react";
import { useConflictFlags } from "../hooks/useConflictFlags";

/* ===== helpers ===== */
const toISO = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const addWeeks = (d: Date, w: number) => addDays(d, w * 7);
const parseISO = (x?: string | null) => (x ? new Date(x) : null);
const fmtDMY = (iso?: string | null) => (!iso ? "—" : new Date(iso).toLocaleDateString());
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const weekOf = (d: Date) => {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil((((dt as any) - (yearStart as any)) / 86400000 + 1) / 7);
};

/* occupancy helpers — bed bezetting = ground→harvest_end (voorzaaien telt niet) */
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

/* ===== tiny UI bits ===== */
function Chip({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "warn" | "danger";
}) {
  const map = {
    muted: "bg-muted text-foreground/80",
    warn: "bg-amber-100 text-amber-900",
    danger: "bg-red-100 text-red-800",
  };
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] ${map[tone]}`}>
      {children}
    </span>
  );
}
function DraggableSeed({ seed, isDragging = false }: { seed: Seed; isDragging?: boolean }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: `seed-${seed.id}` });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const color = seed.default_color?.startsWith("#") ? seed.default_color : "#22c55e";
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`px-2 py-1 border rounded-md bg-secondary cursor-move text-sm flex items-center gap-2 ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <span className="inline-block w-3 h-3 rounded" style={{ background: color }} />
      <span className="truncate">{seed.name}</span>
    </div>
  );
}
function DroppableSegment({
  id,
  occupied,
  children,
}: {
  id: string;
  occupied: boolean;
  children: React.ReactNode;
}) {
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
  const [view, setView] = useState<"list" | "map" | "conflicts" | "timeline">(
    () =>
      (localStorage.getItem("plannerOpenTab") as any) ||
      (localStorage.getItem("plannerView") as any) ||
      "list"
  );
  const [q, setQ] = useState(localStorage.getItem("plannerQ") ?? "");
  const [inStockOnly, setInStockOnly] = useState(localStorage.getItem("plannerInStock") === "1");
  const [inPlanner, setInPlanner] = useState<InPlanner>(
    (localStorage.getItem("plannerInPlanner") as InPlanner) ?? "all"
  );
  const [greenhouseOnly, setGreenhouseOnly] = useState(
    localStorage.getItem("plannerGHOnly") === "1"
  );
  const [showGhosts, setShowGhosts] = useState(
    localStorage.getItem("plannerShowGhosts") === "0" ? false : true
  );
  const [currentWeek, setCurrentWeek] = useState<Date>(() => {
    const saved = localStorage.getItem("plannerWeekISO");
    if (saved) return new Date(saved);
    const n = new Date();
    const d = new Date(n);
    d.setDate(n.getDate() - ((n.getDay() || 7) - 1));
    return d;
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
    | {
        mode: "create";
        seed: Seed;
        bed: GardenBed;
        segmentIndex: number;
      }
    | {
        mode: "edit";
        planting: Planting;
        seed: Seed;
        bed: GardenBed;
        segmentIndex: number;
      }
  >(null);

  // drag
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const activeSeed = useMemo(
    () =>
      activeDragId?.startsWith("seed-")
        ? seeds.find((s) => s.id === activeDragId.replace("seed-", "")) ?? null
        : null,
    [activeDragId, seeds]
  );

  // effects
  const reload = async () => {
    const [b, s, p] = await Promise.all([listBeds(garden.id), listSeeds(garden.id), listPlantings(garden.id)]);
    setBeds(b);
    setSeeds(s);
    setPlantings(p);
  };
  useEffect(() => {
    reload().catch(console.error);
  }, [garden.id]);
  useEffect(() => {
    const ch = supabase
      .channel("rt-plantings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "plantings", filter: `garden_id=eq.${garden.id}` },
        () => reload().catch(() => {})
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

  // focus from dashboard
  const [focusId, setFocusId] = useState<string | null>(
    localStorage.getItem("plannerConflictFocusId")
  );
  useEffect(() => {
    if (localStorage.getItem("plannerNeedsAttention") === "1") {
      setView("conflicts");
    }
    localStorage.removeItem("plannerNeedsAttention");
  }, []);

  const seedsById = useMemo(() => Object.fromEntries(seeds.map((s) => [s.id, s])), [seeds]);
  const outdoorBeds = useMemo(
    () => beds.filter((b) => !b.is_greenhouse).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [beds]
  );
  const greenhouseBeds = useMemo(
    () => beds.filter((b) => b.is_greenhouse).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [beds]
  );

  /* ===== conflicts ===== */
  const conflictsMap = useMemo(() => buildConflictsMap(plantings || [], seeds || []), [plantings, seeds]);
  const conflictCount = useMemo(() => countUniqueConflicts(conflictsMap), [conflictsMap]);

  // Update conflict flags persistently
  useConflictFlags(conflictCount);

  /* ===== current week logic + ghosts ===== */
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

  /* ===== filters for seeds sidebar ===== */
  const seedHasPlanned = (seedId: string) => plantings.some((p) => p.seed_id === seedId && p.planned_date);
  const filteredSeeds = useMemo(() => {
    let arr = seeds.slice();
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      arr = arr.filter((s) => s.name.toLowerCase().includes(t));
    }
    if (inStockOnly) arr = arr.filter((s: any) => (s as any).in_stock ?? true);
    if (greenhouseOnly) arr = arr.filter((s) => !!s.greenhouse_compatible);
    if (inPlanner !== "all")
      arr = arr.filter((s) => (inPlanner === "planned" ? seedHasPlanned(s.id) : !seedHasPlanned(s.id)));
    return arr;
  }, [seeds, q, inStockOnly, inPlanner, greenhouseOnly, plantings]);

  /* ===== UI: header & tabs ===== */
  const pendingBadge =
    conflictCount > 0 ? (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-red-100 text-red-800 border border-red-200">
          ⚠️ {conflictCount} conflict{conflictCount !== 1 ? "en" : ""}
        </span>
      </div>
    ) : null;

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

  /* ===== CREATE/EDIT handler (met bed wisselen + startsegment keuze) ===== */
  async function handleConfirmPlanting(opts: {
    mode: "create" | "edit";
    target: { seed: Seed; bed: GardenBed; segmentIndex: number; planting?: Planting };
    segmentsUsed: number;
    startSegment: number;
    method: "direct" | "presow";
    dateISO: string;
    color: string;
    bedIdOverride?: string;
  }) {
    const {
      mode,
      target,
      segmentsUsed,
      startSegment,
      method,
      dateISO,
      color,
      bedIdOverride,
    } = opts;
    const { seed, bed, planting } = target;

    // 1) doel-bak (kan gewijzigd zijn)
    const bedToUse = bedIdOverride ? beds.find((b) => b.id === bedIdOverride) ?? bed : bed;

    // 2) kas-compatibiliteit
    if (bedToUse.is_greenhouse && !seed.greenhouse_compatible) {
      notify("Dit zaad is niet geschikt voor de kas.", "err");
      return;
    }

    // 3) duur-checks
    if (!seed.grow_duration_weeks || !seed.harvest_duration_weeks) {
      notify("Vul groei-/oogstduur bij het zaad.", "err");
      return;
    }
    if (method === "presow" && !seed.presow_duration_weeks) {
      notify("Voorzaaien vereist voorzaai-weken bij het zaad.", "err");
      return;
    }

    // 4) datumrange berekenen
    const plantDate = new Date(dateISO);
    const hs = addWeeks(plantDate, seed.grow_duration_weeks!);
    const he = addDays(addWeeks(hs, seed.harvest_duration_weeks!), -1);

    // 5) start-segment + lengte veilig clammen voor geselecteerde bak
    const maxStartIndex = Math.max(0, (bedToUse.segments ?? 1) - 1);
    const startSegForBed = clamp(startSegment, 0, maxStartIndex);
    const maxSegUsable = Math.max(1, (bedToUse.segments ?? 1) - startSegForBed);
    const segUsed = clamp(segmentsUsed, 1, maxSegUsable);

    // 6) overlap check met nieuwe bak/segment
    if (
      wouldOverlapWith(
        plantings,
        bedToUse.id,
        startSegForBed,
        segUsed,
        plantDate,
        he,
        planting?.id
      )
    ) {
      notify("Deze planning botst in tijd/segment in de gekozen bak.", "err");
      return;
    }

    // 7) opslaan
    if (mode === "create") {
      await createPlanting({
        seed_id: seed.id,
        garden_bed_id: bedToUse.id,
        garden_id: bedToUse.garden_id,
        planned_date: toISO(plantDate),
        planned_harvest_start: toISO(hs),
        planned_harvest_end: toISO(he),
        planned_presow_date:
          method === "presow" && seed.presow_duration_weeks
            ? toISO(addWeeks(plantDate, -(seed.presow_duration_weeks ?? 0)))
            : null,
        method,
        segments_used: segUsed,
        start_segment: startSegForBed,
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
          method === "presow" && seed.presow_duration_weeks
            ? toISO(addWeeks(plantDate, -(seed.presow_duration_weeks ?? 0)))
            : null,
        method,
        segments_used: segUsed,
        start_segment: startSegForBed,
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
      <div className="space-y-3 max-h?[calc(100vh-7rem)] overflow-auto pr-1 pb-3">
        <h3 className="text-base font-semibold">Zoek/filters</h3>
        <input
          className="w-full border rounded px-2 py-1"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Zoek op naam…"
        />
        <div className="text-sm space-y-1">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => setInStockOnly(e.target.checked)}
            />
            In voorraad
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={greenhouseOnly}
              onChange={(e) => setGreenhouseOnly(e.target.checked)}
            />
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
        </div>
        <h3 className="text-base font-semibold mt-2">Zaden</h3>
        <div className="space-y-1.5">
          {filteredSeeds.map((seed) => (
            <DraggableSeed key={seed.id} seed={seed} isDragging={activeDragId === `seed-${seed.id}`} />
          ))}
          {filteredSeeds.length === 0 && (
            <p className="text-xs text-muted-foreground">Geen zaden gevonden.</p>
          )}
        </div>
      </div>
    </div>
  );

  const listView = (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
      <div>{seedsList}</div>
      <div className="md:col-span-3 space-y-6">
        {(
          [
            ["Buiten", outdoorBeds],
            ["Kas", greenhouseBeds],
          ] as const
        ).map(
          ([label, bedList]) =>
            bedList.length > 0 && (
              <section key={label} className="space-y-2">
                <h4 className="text-lg font-semibold">{label}</h4>
                <div
                  className="grid gap-3"
                  style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}
                >
                  {bedList.map((bed) => {
                    const activePlantings = plantings.filter(
                      (p) => p.garden_bed_id === bed.id && isActiveInWeek(p, currentWeek)
                    );
                    const futurePlantings = showGhosts
                      ? plantings.filter(
                          (p) =>
                            p.garden_bed_id === bed.id &&
                            !isActiveInWeek(p, currentWeek) &&
                            isFutureRelativeToWeek(p, currentWeek)
                        )
                      : [];
                    const segs = Array.from({ length: bed.segments }, (_, i) => i);
                    const bedHasConflict = activePlantings.some(
                      (p) => (conflictsMap.get(p.id)?.length ?? 0) > 0
                    );

                    return (
                      <div key={bed.id} className="p-2.5 border rounded-xl bg-card shadow-sm">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <h5 className="font-semibold text-sm">{bed.name}</h5>
                            {bedHasConflict && <Chip tone="danger">⚠️</Chip>}
                          </div>
                          {bed.is_greenhouse && <Chip>Kas</Chip>}
                        </div>

                        <div
                          className="grid gap-1"
                          style={{ gridTemplateRows: `repeat(${bed.segments}, minmax(26px, auto))` }}
                        >
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
                              <DroppableSegment
                                key={i}
                                id={`bed__${bed.id}__segment__${i}`}
                                occupied={here.length > 0}
                              >
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
                                        title={
                                          hasConflict
                                            ? "⚠️ Er is een conflict. Ga naar het tabblad ‘Conflicten’ voor details."
                                            : seed?.name ?? "—"
                                        }
                                      >
                                        <div className="flex items-center gap-1 min-w-0">
                                          <span className="truncate">{seed?.name ?? "—"}</span>
                                          {hasConflict && <span>⚠️</span>}
                                        </div>
                                        {i === (p.start_segment ?? 0) && (
                                          <div className="flex items-center gap-1">
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
                                        )}
                                      </div>
                                    );
                                  })}
                                  {ghosts.length > 0 && (
                                    <div
                                      className="text-white text-[11px] rounded px-2 py-1"
                                      style={{
                                        background: "rgba(34,197,94,.35)",
                                        border: "1px dashed rgba(0,0,0,.45)",
                                      }}
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

  /* ===== MAP view (ongewijzigd, edit/delete overlay) ===== */
  function PlannerMap() {
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const BASE_W = 2400,
      BASE_H = 1400;

    const [zoom, setZoom] = useState(() => {
      const saved = localStorage.getItem("plannerMapZoom");
      return saved ? parseFloat(saved) : 1;
    });
    const [isInitialized, setIsInitialized] = useState(false);
    const [isManualZoom, setIsManualZoom] = useState(
      () => localStorage.getItem("plannerMapManualZoom") === "1"
    );

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
            <input
              className="w-40"
              type="range"
              min={0.25}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => handleManualZoom(parseFloat(e.target.value))}
            />
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

        <div
          ref={viewportRef}
          className="relative w-full h-[70vh] rounded-xl border overflow-auto bg-background"
          style={{ minWidth: "100%", minHeight: "70vh" }}
        >
          <div
            className="relative"
            style={{
              width: BASE_W * zoom,
              height: BASE_H * zoom,
              transition: isInitialized ? "none" : "opacity 0.1s ease-out",
              opacity: isInitialized ? 1 : 0,
            }}
          >
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

                const segFree = (rs: number, len: number) => {
                  const re = rs + len - 1;
                  return !act.some((p) => {
                    const ps = p.start_segment ?? 0,
                      pe = ps + (p.segments_used ?? 1) - 1;
                    return rs <= pe && ps <= re;
                  });
                };

                return (
                  <div
                    key={bed.id}
                    className={`absolute rounded-lg shadow-sm border select-none ${
                      bed.is_greenhouse ? "border-green-600/60 bg-green-50" : "bg-white"
                    }`}
                    style={{ left: x, top: y, width: w, height: h }}
                  >
                    <div
                      className="flex items-center justify-between px-2 py-1 border-b bg-muted/50 rounded-t-lg"
                      style={{ height: HEADER }}
                    >
                      <span className="text-xs font-medium truncate">{bed.name}</span>
                      {bed.is_greenhouse && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-600 text-white">Kas</span>
                      )}
                    </div>

                    <div className="relative w-full" style={{ height: innerH }}>
                      {/* grid for droppables */}
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
                            ? {
                                top: inset,
                                height: Math.max(1, innerH - inset * 2),
                                left: inset + start * segW,
                                width: Math.max(1, used * segW - inset * 2),
                              }
                            : {
                                left: inset,
                                width: Math.max(1, innerW - inset * 2),
                                top: inset + start * segH,
                                height: Math.max(1, used * segH - inset * 2),
                              };
                          const color = p.color?.startsWith("#") ? p.color : "#22c55e";
                          const hasConflict = (conflictsMap.get(p.id)?.length ?? 0) > 0;
                          const focus = focusId === p.id;

                          return (
                            <div
                              key={p.id}
                              className={`absolute rounded text-white text-[10px] px-1 flex items-center ${
                                hasConflict ? "ring-2 ring-red-500 ring-offset-1" : ""
                              } ${focus ? "ring-2 ring-amber-400" : ""}`}
                              style={{ ...rect, backgroundColor: color }}
                              title={
                                hasConflict
                                  ? "⚠️ Er is een conflict. Ga naar het tabblad ‘Conflicten’ voor details."
                                  : seed?.name ?? "—"
                              }
                            >
                              <span className="truncate">{seed?.name ?? "—"}</span>
                              {hasConflict && <span className="ml-1">⚠️</span>}

                              <div className="absolute top-0.5 right-0.5 flex gap-0.5">
                                <button
                                  className="p-0.5 rounded hover:bg-white/20"
                                  title="Bewerken"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPopup({
                                      mode: "edit",
                                      planting: p,
                                      seed: seed!,
                                      bed,
                                      segmentIndex: p.start_segment ?? 0,
                                    });
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
                            if (!segFree(start, used)) return null;
                            const inset = 1;
                            const rect = vertical
                              ? {
                                  top: inset,
                                  height: Math.max(1, innerH - inset * 2),
                                  left: inset + start * segW,
                                  width: Math.max(1, used * segW - inset * 2),
                                }
                              : {
                                  left: inset,
                                  width: Math.max(1, innerW - inset * 2),
                                  top: inset + start * segH,
                                  height: Math.max(1, used * segH - inset * 2),
                                };
                            const bg = p.color?.startsWith("#")
                              ? p.color
                              : "rgba(34,197,94,.35)";
                            return (
                              <div
                                key={`ghost-${p.id}`}
                                className="absolute rounded text-white text-[10px] px-1 flex items-center"
                                style={{
                                  ...rect,
                                  backgroundColor: bg,
                                  opacity: 0.35,
                                  border: "1px dashed rgba(0,0,0,.45)",
                                }}
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

  /* ===== conflictsView blijft zoals je huidige logic heeft, geen auto-fix knoppen hier ===== */
  const conflictsView = (
    <div className="space-y-3">
      {Array.from(conflictsMap.entries())
        .filter(([_, impacted]) => impacted.length > 0)
        .map(([srcId, impacted]) => {
          const src = plantings.find((p) => p.id === srcId)!;
          const srcSeed = seedsById[src.seed_id];
          const bed = beds.find((b) => b.id === src.garden_bed_id);
          const later = impacted
            .filter((x) => (x.planned_date ?? "") >= (src.planned_date ?? ""))
            .sort((a, b) => (a.planned_date ?? "").localeCompare(b.planned_date ?? ""));

          return (
            <section key={srcId} className="border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-red-50 border-b border-red-200">
                <div className="text-sm">
                  <strong>{srcSeed?.name ?? "—"}</strong> • {bed?.name ?? "—"}{" "}
                  <span className="text-red-700">(vergrendeld via actual / bron)</span>
                </div>
                <div className="text-xs text-red-800">
                  Bezetting: {fmtDMY(src.planned_date)} → {fmtDMY(src.planned_harvest_end)}
                </div>
              </div>
              <div className="p-3 space-y-2 bg-card">
                {later.length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    Geen latere gewassen met conflict in deze groep.
                  </div>
                )}
                {later.map((t) => {
                  const s2 = seedsById[t.seed_id];
                  const b2 = beds.find((b) => b.id === t.garden_bed_id);
                  const hasConflict = true;

                  return (
                    <div key={t.id} className="border rounded-md bg-white p-3">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">
                            {s2?.name ?? "—"}{" "}
                            <span className="text-muted-foreground">• {b2?.name ?? "—"}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Gepland: {fmtDMY(t.planned_date)} → {fmtDMY(t.planned_harvest_end)} • Segmenten{" "}
                            {(t.start_segment ?? 0) + 1}–
                            {(t.start_segment ?? 0) + (t.segments_used ?? 1)}
                          </div>
                        </div>
                        {/* geen knoppen meer; alleen tekstadvies in jouw aparte conflicts-pagina component (buiten scope) */}
                        {hasConflict && <Chip tone="danger">⚠️</Chip>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      {Array.from(conflictsMap.entries()).filter(([_, impacted]) => impacted.length > 0).length === 0 && (
        <p className="text-sm text-muted-foreground">Geen conflicten 🎉</p>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b">
        <div className="py-2.5 flex items-center justify-between">
          <h2 className="text-2xl font-bold flex items-center gap-2">Planner {pendingBadge}</h2>
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
                  active
                    ? danger
                      ? "bg-red-600 text-white border-red-600"
                      : "bg-primary text-primary-foreground"
                    : danger
                    ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                    : "bg-card text-muted-foreground hover:text-foreground"
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
            <input
              type="checkbox"
              checked={showGhosts}
              onChange={(e) => setShowGhosts(e.target.checked)}
            />
            Toon toekomstige plantingen
          </label>
        </div>
      </div>

      {/* Conflict Warning — zonder auto-oplossen */}
      {conflictCount > 0 && <ConflictWarning conflictCount={conflictCount} />}

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
            <TimelineView
              beds={beds || []}
              plantings={plantings || []}
              seeds={seeds || []}
              conflictsMap={conflictsMap}
              currentWeek={currentWeek}
              onReload={reload}
            />
          </div>
        )}
        {view === "conflicts" && conflictsView}

        <DragOverlay dropAnimation={null}>
          {activeSeed ? (
            <div className="px-2 py-1 border rounded-md bg-secondary text-sm flex items-center gap-2 pointer-events-none shadow-lg">
              <span
                className="inline-block w-3 h-3 rounded"
                style={{
                  background: activeSeed.default_color?.startsWith("#")
                    ? activeSeed.default_color
                    : "#22c55e",
                }}
              />
              <span className="truncate">{activeSeed.name}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Planting popup */}
      {popup && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center z-50" onClick={() => setPopup(null)}>
          <div
            className="bg-card p-5 rounded-lg shadow-lg w-full max-w-md space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">
              {popup.mode === "create" ? "Nieuwe planting" : "Planting bewerken"}
            </h3>
            <PlantingForm
              mode={popup.mode}
              seed={popup.seed}
              bed={popup.bed}
              beds={beds}
              defaultSegment={popup.segmentIndex}
              defaultDateISO={popup.mode === "edit" ? popup.planting.planned_date ?? toISO(currentWeek) : toISO(currentWeek)}
              existing={popup.mode === "edit" ? popup.planting : undefined}
              onCancel={() => setPopup(null)}
              onConfirm={(segmentsUsed, startSegment, method, date, color, bedId) =>
                handleConfirmPlanting({
                  mode: popup.mode,
                  target:
                    popup.mode === "create"
                      ? { seed: popup.seed, bed: popup.bed, segmentIndex: popup.segmentIndex }
                      : { seed: popup.seed, bed: popup.bed, segmentIndex: popup.segmentIndex, planting: popup.planting },
                  segmentsUsed,
                  startSegment,
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
            toast.tone === "ok"
              ? "bg-green-600 text-white"
              : toast.tone === "err"
              ? "bg-red-600 text-white"
              : "bg-gray-800 text-white"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ===== PlantingForm (met bak wisselen + startsegment keuze) ===== */
function PlantingForm({
  mode,
  seed,
  bed,
  defaultSegment,
  defaultDateISO,
  existing,
  beds,
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
  onCancel: () => void;
  onConfirm: (
    segmentsUsed: number,
    startSegment: number,
    method: "direct" | "presow",
    dateISO: string,
    color: string,
    bedId: string
  ) => void;
}) {
  const [segmentsUsed, setSegmentsUsed] = useState<number>(existing?.segments_used ?? 1);
  const [method, setMethod] = useState<"direct" | "presow">(
    existing?.method ?? (seed.sowing_type === "direct" || seed.sowing_type === "presow" ? seed.sowing_type : "direct")
  );
  const [date, setDate] = useState<string>(existing?.planned_date ?? defaultDateISO);
  const [color, setColor] = useState<string>(() =>
    existing?.color?.startsWith("#") ? existing.color : seed.default_color?.startsWith("#") ? seed.default_color : "#22c55e"
  );

  // bak-select (wisselbaar)
  const [bedId, setBedId] = useState<string>(existing?.garden_bed_id ?? bed.id);
  const selectedBed = beds.find((b) => b.id === bedId) ?? bed;

  // start-segment keuze (1-based in UI, 0-based in data)
  const initialStart = existing?.start_segment ?? defaultSegment;
  const [startSegment, setStartSegment] = useState<number>(initialStart);

  // helpers: reken actuele max toe te laten start en lengte uit
  const maxStartIndex = Math.max(0, (selectedBed.segments ?? 1) - 1);
  const maxSegUsable = Math.max(1, (selectedBed.segments ?? 1) - startSegment);

  // corrigeer als de bak wijzigt
  useEffect(() => {
    // clamp startSegment op nieuwe bak
    const clampedStart = clamp(startSegment, 0, maxStartIndex);
    if (clampedStart !== startSegment) setStartSegment(clampedStart);

    // clamp segmentsUsed o.b.v. clampedStart
    const newMaxSegUsable = Math.max(1, (selectedBed.segments ?? 1) - clampedStart);
    if (segmentsUsed > newMaxSegUsable) setSegmentsUsed(newMaxSegUsable);
  }, [bedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // herbereken max wanneer start verschuift
  useEffect(() => {
    const newMaxSegUsable = Math.max(1, (selectedBed.segments ?? 1) - startSegment);
    if (segmentsUsed > newMaxSegUsable) setSegmentsUsed(newMaxSegUsable);
  }, [startSegment, selectedBed.segments]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm(segmentsUsed, startSegment, method, date, color, bedId);
      }}
      className="space-y-4"
    >
      {/* Bak */}
      <div>
        <label className="block text-sm font-medium mb-1">Bak</label>
        <select
          value={bedId}
          onChange={(e) => setBedId(e.target.value)}
          className="border rounded px-2 py-1 w-full"
        >
          {beds
            .slice()
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.is_greenhouse ? " (kas)" : ""}
              </option>
            ))}
        </select>
        <p className="text-xs text-muted-foreground mt-1">
          Startsegment en lengte worden automatisch aangepast aan het aantal segmenten van de gekozen bak.
        </p>
      </div>

      {/* Startsegment */}
      <div>
        <label className="block text-sm font-medium mb-1">Startsegment</label>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={maxStartIndex}
            value={startSegment}
            onChange={(e) => setStartSegment(parseInt(e.target.value, 10))}
            className="w-full"
          />
          <span className="text-sm w-10 text-right">{startSegment + 1}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Eerste segment in “{selectedBed.name}” is <strong>{startSegment + 1}</strong> (van {selectedBed.segments}).
        </p>
      </div>

      {/* Aantal segmenten */}
      <div>
        <label className="block text-sm font-medium mb-1">Aantal segmenten</label>
        <input
          type="number"
          min={1}
          max={maxSegUsable}
          value={segmentsUsed}
          onChange={(e) => setSegmentsUsed(Number(e.target.value))}
          className="border rounded px-2 py-1 w-full"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Past maximaal <strong>{maxSegUsable}</strong> segment(en) vanaf startsegment {startSegment + 1}.
        </p>
      </div>

      {/* Methode */}
      {seed.sowing_type === "both" ? (
        <div>
          <label className="block text-sm font-medium mb-1">Zaaimethode</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as any)}
            className="border rounded px-2 py-1 w-full"
          >
            <option value="direct">Direct</option>
            <option value="presow">Voorzaaien</option>
          </select>
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium mb-1">Zaaimethode</label>
          <div className="text-sm">
            {seed.sowing_type === "direct" ? "Direct" : seed.sowing_type === "presow" ? "Voorzaaien" : "—"}
          </div>
        </div>
      )}

      {/* Datum */}
      <div>
        <label className="block text-sm font-medium mb-1">Zaai/Plantdatum (bezetting start hier)</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border rounded px-2 py-1 w-full"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Voorzaaien gebeurt buiten de bedden; bezetting telt vanaf deze datum.
        </p>
      </div>

      {/* Kleur */}
      <div>
        <label className="block text-sm font-medium mb-1">Kleur in planner</label>
        <div className="flex items-center gap-2">
          <input
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="border rounded px-2 py-1 w-full"
            placeholder="#22c55e"
          />
          <span className="inline-block w-6 h-6 rounded border" style={{ background: color }} />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" className="px-3 py-1 border rounded bg-muted" onClick={onCancel}>
          Annuleren
        </button>
        <button type="submit" className="px-3 py-1 rounded bg-primary text-primary-foreground">
          {mode === "create" ? "Opslaan" : "Bijwerken"}
        </button>
      </div>
    </form>
  );
}

export default PlannerPage;
