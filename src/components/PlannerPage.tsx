import { useEffect, useMemo, useState } from "react";
import type { Garden, GardenBed, Planting, Seed } from "../lib/types";
import { listBeds } from "../lib/api/beds";
import { listSeeds } from "../lib/api/seeds";
import { createPlanting, listPlantings, deletePlanting } from "../lib/api/plantings";
import { DndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import { ColorField } from "./ColorField";

/* ---------------- UI helpers ---------------- */

function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: "success" | "error";
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div
      className={`fixed top-4 right-4 z-50 px-4 py-2 rounded shadow-lg text-sm ${
        type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
      }`}
    >
      <div className="flex items-center gap-2">
        <span>{message}</span>
        <button onClick={onClose} className="ml-2 text-white hover:text-gray-200">
          ✕
        </button>
      </div>
    </div>
  );
}

function DraggableSeed({ seed }: { seed: Seed }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: `seed-${seed.id}` });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const dot =
    seed.default_color && (seed.default_color.startsWith("#") || seed.default_color.startsWith("rgb")) ? (
      <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: seed.default_color }} />
    ) : (
      <span className={`inline-block w-2.5 h-2.5 rounded ${seed.default_color ?? "bg-green-500"}`} />
    );
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="p-2 border rounded-md bg-secondary cursor-move text-sm flex items-center gap-2"
      title={seed.name}
    >
      {dot}
      <span className="truncate">{seed.name}</span>
    </div>
  );
}

function DroppableSegment({
  bed,
  segmentIndex,
  occupied,
  children,
}: {
  bed: GardenBed;
  segmentIndex: number;
  occupied: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `bed__${bed.id}__segment__${segmentIndex}` });
  const base = "flex items-center justify-center border border-dashed rounded-sm min-h-[60px] transition";
  const color = isOver ? "bg-green-200" : occupied ? "bg-emerald-50" : "bg-muted";
  return (
    <div ref={setNodeRef} className={`${base} ${color}`}>
      {children}
    </div>
  );
}

/* ---------------- Date helpers ---------------- */

function mondayOf(d: Date) {
  const x = new Date(d);
  const day = x.getDay(); // 0=zo .. 6=za
  const diff = (day === 0 ? -6 : 1) - day; // naar maandag
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfWeek(startMonday: Date) {
  const end = new Date(startMonday);
  end.setDate(startMonday.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}
function formatWeekRange(monday: Date) {
  const end = endOfWeek(monday);
  return `${monday.getDate()}/${monday.getMonth() + 1} – ${end.getDate()}/${end.getMonth() + 1}`;
}
function isoWeekNumber(date: Date) {
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // donderdag in dezelfde week bepaalt weeknummer
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return weekNo;
}

/* ---------------- Voorzaaien sectie ---------------- */

function PresowSection({
  plantings,
  seeds,
  weekStart,
}: {
  plantings: Planting[];
  seeds: Seed[];
  weekStart: Date;
}) {
  const weekEnd = endOfWeek(weekStart);

  const items = useMemo(() => {
    return plantings
      .filter((p) => (p.method as any) === "presow")
      .filter((p) => {
        const sow = p.actual_sow_date ? new Date(p.actual_sow_date) : p.planned_sow_date ? new Date(p.planned_sow_date) : null;
        const plant = p.actual_plant_date ? new Date(p.actual_plant_date) : p.planned_plant_date ? new Date(p.planned_plant_date) : null;
        if (!sow || !plant) return false;
        // overlap van [sow .. plant) met [weekStart .. weekEnd]
        return sow <= weekEnd && plant > weekStart;
      })
      .map((p) => {
        const seed = seeds.find((s) => s.id === p.seed_id) || null;
        return { p, seed };
      });
  }, [plantings, seeds, weekStart]);

  if (items.length === 0) return null;

  const wk = isoWeekNumber(weekStart);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold">
          Voorzaaien — WK {wk} • {formatWeekRange(weekStart)}
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map(({ p, seed }) => {
          const sow = p.actual_sow_date ? new Date(p.actual_sow_date) : p.planned_sow_date ? new Date(p.planned_sow_date) : null;
          const plant = p.actual_plant_date ? new Date(p.actual_plant_date) : p.planned_plant_date ? new Date(p.planned_plant_date) : null;
          const color =
            p.color && (p.color.startsWith("#") || p.color.startsWith("rgb"))
              ? p.color
              : seed?.default_color && (seed.default_color.startsWith("#") || seed.default_color.startsWith("rgb"))
              ? seed.default_color
              : "#22c55e";

          // simpele progress-indicatie binnen de voorzaaiperiode
          let progressPct = 0;
          if (sow && plant && plant > sow) {
            const nowPos = Math.min(Math.max(weekStart.getTime(), sow.getTime()), plant.getTime());
            progressPct = ((nowPos - sow.getTime()) / (plant.getTime() - sow.getTime())) * 100;
          }

          return (
            <div key={p.id} className="p-4 border rounded-xl bg-card shadow-sm space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: color }} />
                    <h4 className="font-semibold text-base truncate">{seed?.name ?? "Onbekend gewas"}</h4>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Voorzaaien van <strong>{sow ? sow.toLocaleDateString() : "?"}</strong> tot{" "}
                    <strong>{plant ? plant.toLocaleDateString() : "?"}</strong>
                  </p>
                </div>
              </div>

              <div className="h-2 w-full bg-muted rounded">
                <div className="h-2 rounded" style={{ width: `${Math.max(0, Math.min(100, progressPct))}%`, backgroundColor: color }} />
              </div>

              <div className="text-[11px] text-muted-foreground">
                Plant-uit: <span className="font-medium">{plant ? plant.toLocaleDateString() : "?"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------- Main Page ---------------- */

type PlannerView = "list" | "map";

export function PlannerPage({ garden }: { garden: Garden }) {
  const [beds, setBeds] = useState<GardenBed[]>([]);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [plantings, setPlantings] = useState<Planting[]>([]);
  const [popup, setPopup] = useState<{ seed: Seed; bed: GardenBed; segmentIndex: number } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const [currentWeek, setCurrentWeek] = useState<Date>(() => mondayOf(new Date()));
  const [view, setView] = useState<PlannerView>(() => (localStorage.getItem("plannerView") as PlannerView) || "list");

  async function reload() {
    const [b, s, p] = await Promise.all([listBeds(garden.id), listSeeds(garden.id), listPlantings(garden.id)]);
    setBeds(b);
    setSeeds(s);
    setPlantings(p);
  }
  useEffect(() => {
    reload().catch(console.error);
  }, [garden.id]);

  useEffect(() => {
    localStorage.setItem("plannerView", view);
  }, [view]);

  /* ---- Save / delete ---- */

  async function handleConfirmPlanting(
    seed: Seed,
    bed: GardenBed,
    segmentIndex: number,
    segmentsUsed: number,
    method: "direct" | "presow",
    date: string,
    hexColor: string
  ) {
    try {
      // Belangrijk: datum = plant/zaai-MOMENT (bij presow is dit UITPLANTDATUM!)
      await createPlanting({
        seed_id: seed.id,
        garden_bed_id: bed.id,
        garden_id: bed.garden_id,
        planned_plant_date: date, // ALTIJD plantmoment
        method,
        segments_used: Math.max(1, Math.min(segmentsUsed, Math.max(1, bed.segments - segmentIndex))),
        start_segment: segmentIndex,
        color: hexColor || seed.default_color || "#22c55e",
        status: "planned",
      });

      await reload();
      setPopup(null);
      setToast({ message: "Planting succesvol toegevoegd!", type: "success" });
    } catch (e: any) {
      setToast({ message: "Kon planting niet opslaan: " + e.message, type: "error" });
    }
  }

  async function handleDeletePlanting(id: string) {
    if (!confirm("Weet je zeker dat je deze planting wilt verwijderen?")) return;
    try {
      await deletePlanting(id);
      setPlantings((prev) => prev.filter((p) => p.id !== id));
      setToast({ message: "Planting verwijderd.", type: "success" });
    } catch {
      setToast({ message: "Kon planting niet verwijderen.", type: "error" });
    }
  }

  /* ---- Week helpers ---- */

  function nextWeek() {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() + 7);
    setCurrentWeek(mondayOf(d));
  }
  function prevWeek() {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() - 7);
    setCurrentWeek(mondayOf(d));
  }
  function goToToday() {
    setCurrentWeek(mondayOf(new Date()));
  }

  /* ---- Filters per week ---- */

  function isActiveInWeek(p: Planting, week: Date) {
    // bezetting in bed: start = plantdatum (of sow als plant ontbreekt), eind = harvest_end
    const start = p.planned_plant_date
      ? new Date(p.planned_plant_date)
      : p.planned_sow_date
      ? new Date(p.planned_sow_date)
      : null;
    const end = p.planned_harvest_end ? new Date(p.planned_harvest_end) : null;
    if (!start || !end) return false;
    const ws = mondayOf(week);
    const we = endOfWeek(ws);
    return start <= we && end >= ws;
  }

  function getPhase(p: Planting, week: Date): string {
    const start = p.planned_plant_date ? new Date(p.planned_plant_date) : null;
    const harvestStart = p.planned_harvest_start ? new Date(p.planned_harvest_start) : null;
    const harvestEnd = p.planned_harvest_end ? new Date(p.planned_harvest_end) : null;
    const ws = mondayOf(week);
    const we = endOfWeek(ws);
    if (!start) return "onbekend";
    if (harvestEnd && harvestEnd < ws) return "afgelopen";
    if (harvestStart && harvestStart <= we && (!harvestEnd || harvestEnd >= ws)) return "oogsten";
    if (start <= we && (!harvestStart || harvestStart > we)) return "groeit";
    return "gepland";
  }

  /* ---- Sorted groups (consistent met Bakken) ---- */

  const outdoorBeds = useMemo(
    () =>
      beds
        .filter((b) => !b.is_greenhouse)
        .sort(
          (a, b) =>
            (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
            a.created_at.localeCompare(b.created_at)
        ),
    [beds]
  );
  const greenhouseBeds = useMemo(
    () =>
      beds
        .filter((b) => b.is_greenhouse)
        .sort(
          (a, b) =>
            (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
            a.created_at.localeCompare(b.created_at)
        ),
    [beds]
  );

  /* ---------------- Render ---------------- */

  const wk = isoWeekNumber(currentWeek);

  return (
    <div className="space-y-10">
      {/* Sticky header (week switcher + view tabs) */}
      <div className="sticky top-[64px] z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75 border-b border-border">
        <div className="py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold">Planner</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setView("list")}
                className={`px-2 py-1 rounded-md border ${view === "list" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"}`}
              >
                Lijstweergave
              </button>
              <button
                onClick={() => setView("map")}
                className={`px-2 py-1 rounded-md border ${view === "map" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"}`}
              >
                Plattegrond
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={prevWeek} className="px-2 py-1 border rounded">
              ← Vorige
            </button>
            <span className="font-medium">
              WK {wk} • {formatWeekRange(currentWeek)}
            </span>
            <button onClick={nextWeek} className="px-2 py-1 border rounded">
              Volgende →
            </button>
            <button onClick={goToToday} className="px-2 py-1 border rounded">
              Vandaag
            </button>
          </div>
        </div>
      </div>

      {/* Drag & Drop context staat alleen in lijstweergave nodig */}
      <DndContext
        onDragEnd={(event) => {
          if (view !== "list") return;
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

          // Greenhouse hard rule
          if (bed.is_greenhouse && !seed.greenhouse_compatible) {
            setToast({
              message: `“${seed.name}” is niet geschikt voor de kas.`,
              type: "error",
            });
            return;
          }

          setPopup({ seed, bed, segmentIndex: segIdx });
        }}
      >
        {view === "list" ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Sidebar: sticky seeds */}
            <div className="col-span-1">
              <div className="sticky top-[128px] space-y-3">
                <h3 className="text-lg font-semibold">Beschikbare zaden</h3>
                <div className="space-y-2 max-h-[70vh] overflow-auto pr-1">
                  {seeds.map((seed) => (
                    <DraggableSeed key={seed.id} seed={seed} />
                  ))}
                </div>
              </div>
            </div>

            {/* Content: presow + beds */}
            <div className="col-span-3 space-y-10">
              {/* Voorzaaien-sectie */}
              <PresowSection plantings={plantings} seeds={seeds} weekStart={currentWeek} />

              {/* Buiten */}
              <section className="space-y-4">
                <h3 className="text-xl font-semibold">Buiten</h3>
                {outdoorBeds.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Geen buitenbakken.</p>
                ) : (
                  outdoorBeds.map((bed) => {
                    const activePlantings = plantings.filter(
                      (p) => p.garden_bed_id === bed.id && isActiveInWeek(p, currentWeek)
                    );
                    const historyPlantings = plantings.filter(
                      (p) => p.garden_bed_id === bed.id && getPhase(p, currentWeek) === "afgelopen"
                    );
                    return (
                      <BedRow
                        key={bed.id}
                        bed={bed}
                        seeds={seeds}
                        activePlantings={activePlantings}
                        historyPlantings={historyPlantings}
                        currentWeek={currentWeek}
                        onDelete={handleDeletePlanting}
                      />
                    );
                  })
                )}
              </section>

              {/* Kas */}
              <section className="space-y-4">
                <h3 className="text-xl font-semibold">Kas</h3>
                {greenhouseBeds.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Geen kasbakken.</p>
                ) : (
                  greenhouseBeds.map((bed) => {
                    const activePlantings = plantings.filter(
                      (p) => p.garden_bed_id === bed.id && isActiveInWeek(p, currentWeek)
                    );
                    const historyPlantings = plantings.filter(
                      (p) => p.garden_bed_id === bed.id && getPhase(p, currentWeek) === "afgelopen"
                    );
                    return (
                      <BedRow
                        key={bed.id}
                        bed={bed}
                        seeds={seeds}
                        activePlantings={activePlantings}
                        historyPlantings={historyPlantings}
                        currentWeek={currentWeek}
                        onDelete={handleDeletePlanting}
                      />
                    );
                  })
                )}
              </section>
            </div>
          </div>
        ) : (
          /* Plattegrond weergave (read-only visueel; zelfde weekfilter) */
          <div className="border rounded-xl p-4">
            <p className="text-sm text-muted-foreground">
              Plattegrond-weergave komt hier (zoals bij Bakken). Voorzaaien wordt hier niet getoond, want dat staat niet in bakken.
            </p>
          </div>
        )}
      </DndContext>

      {/* Popup */}
      {popup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg shadow-lg w-full max-w-md space-y-4">
            <h3 className="text-lg font-semibold">Nieuwe planting</h3>
            <PlantingForm
              seed={popup.seed}
              bed={popup.bed}
              defaultSegment={popup.segmentIndex}
              onCancel={() => setPopup(null)}
              onConfirm={(segmentsUsed, method, date, hex) =>
                handleConfirmPlanting(popup.seed, popup.bed, popup.segmentIndex, segmentsUsed, method, date, hex)
              }
            />
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

/* ---------------- BedRow (horizontale segmenten) ---------------- */

function BedRow({
  bed,
  seeds,
  activePlantings,
  historyPlantings,
  currentWeek,
  onDelete,
}: {
  bed: GardenBed;
  seeds: Seed[];
  activePlantings: Planting[];
  historyPlantings: Planting[];
  currentWeek: Date;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <h4 className="font-semibold">
        {bed.name} ({bed.segments} segmenten)
      </h4>
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
                  const seed = seeds.find((s) => s.id === p.seed_id);
                  const isHex = p.color?.startsWith("#") || p.color?.startsWith("rgb");
                  return (
                    <div
                      key={`${p.id}-${i}`}
                      className={`${isHex ? "" : (p.color ?? "bg-primary")} text-white text-xs rounded px-2 py-1 flex flex-col`}
                      style={isHex ? { backgroundColor: p.color ?? "#22c55e" } : undefined}
                    >
                      <div className="flex justify-between items-center">
                        <span className="truncate">{seed?.name ?? "Onbekend"}</span>
                        {i === p.start_segment && (
                          <button
                            onClick={() => onDelete(p.id)}
                            className="ml-2 text-red-200 hover:text-red-500"
                            title="Verwijderen"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <span className="italic text-[10px]">
                        {/* Phase tekst per huidige week */}
                        {/* (we houden het compact hier) */}
                      </span>
                    </div>
                  );
                })}
              </div>
            </DroppableSegment>
          );
        })}
      </div>

      {/* Historie */}
      {historyPlantings.length > 0 && (
        <div>
          <h5 className="text-sm font-semibold mt-2">Historie</h5>
          <ul className="text-xs space-y-1">
            {historyPlantings.map((p) => {
              const seed = seeds.find((s) => s.id === p.seed_id);
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
}

/* ---------------- PlantingForm (ongewijzigde layout) ---------------- */

function PlantingForm({
  seed,
  bed,
  defaultSegment,
  onCancel,
  onConfirm,
}: {
  seed: Seed;
  bed: GardenBed;
  defaultSegment: number;
  onCancel: () => void;
  onConfirm: (segmentsUsed: number, method: "direct" | "presow", date: string, hexColor: string) => void;
}) {
  const [segmentsUsed, setSegmentsUsed] = useState<number>(1);
  const [method, setMethod] = useState<"direct" | "presow">(
    seed.sowing_type === "direct" || seed.sowing_type === "presow" ? seed.sowing_type : "direct"
  );
  // default datum = maandag van gekozen week
  const [date, setDate] = useState<string>(() => {
    const monday = mondayOf(new Date());
    return monday.toISOString().slice(0, 10);
  });
  const [color, setColor] = useState<string>(() => {
    if (!seed.default_color) return "#22c55e";
    return seed.default_color.startsWith("#") || seed.default_color.startsWith("rgb")
      ? seed.default_color
      : "#22c55e";
  });

  // UI validaties (blokkeren bouwen gebeurt in backend ook)
  function validate(): string | null {
    // presow vereist presow_duration_weeks
    if (method === "presow" && (seed.presow_duration_weeks == null || seed.presow_duration_weeks <= 0)) {
      return "Voorzaaien gekozen, maar 'Voorzaaien (weken)' ontbreekt bij dit zaad.";
    }
    // groei & oogstduur verplicht voor planning (we berekenen harvest)
    if (seed.grow_duration_weeks == null || seed.grow_duration_weeks <= 0) {
      return "Vul de waarde 'Groei → oogst (weken)' in bij het zaad.";
    }
    if (seed.harvest_duration_weeks == null || seed.harvest_duration_weeks <= 0) {
      return "Vul de waarde 'Oogstduur (weken)' in bij het zaad.";
    }
    return null;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        // clamp segments naar einde van de bak
        const clamp = Math.max(1, Math.min(segmentsUsed, Math.max(1, bed.segments - defaultSegment)));
        const err = validate();
        if (err) {
          alert(err);
          return;
        }
        onConfirm(clamp, method, date, color);
      }}
      className="space-y-4"
    >
      <div>
        <label className="block text-sm font-medium mb-1">Aantal segmenten</label>
        <input
          type="number"
          name="segmentsUsed"
          min={1}
          max={bed.segments}
          value={segmentsUsed}
          onChange={(e) => setSegmentsUsed(Number(e.target.value))}
          className="border rounded-md px-2 py-1 w-full"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Deze planting start in segment {defaultSegment + 1} en beslaat {segmentsUsed} segment(en).
        </p>
      </div>

      {seed.sowing_type === "both" ? (
        <div>
          <label className="block text-sm font-medium mb-1">Zaaimethode</label>
          <select
            name="method"
            value={method}
            onChange={(e) => setMethod(e.target.value as "direct" | "presow")}
            className="border rounded-md px-2 py-1 w-full"
          >
            <option value="direct">Direct</option>
            <option value="presow">Voorzaaien</option>
          </select>
        </div>
      ) : (
        <input type="hidden" name="method" value={seed.sowing_type} />
      )}

      <div>
        <label className="block text-sm font-medium mb-1">
          {method === "presow" ? "Uitplantdatum" : "Zaai/plantdatum"}
        </label>
        <input
          type="date"
          name="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border rounded-md px-2 py-1 w-full"
        />
        {method === "presow" && seed.presow_duration_weeks ? (
          <p className="text-xs text-muted-foreground mt-1">
            Voorzaaien start automatisch {seed.presow_duration_weeks} week/ weken vóór deze datum.
          </p>
        ) : null}
      </div>

      <ColorField
        label="Kleur in planner"
        value={color}
        onChange={setColor}
        helperText="Je kunt #RRGGBB of rgb(r,g,b) invoeren. We slaan #hex op."
      />

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1 border border-border rounded-md bg-muted"
        >
          Annuleren
        </button>
        <button
          type="submit"
          className="px-3 py-1 rounded-md bg-primary text-primary-foreground"
        >
          Opslaan
        </button>
      </div>
    </form>
  );
}
