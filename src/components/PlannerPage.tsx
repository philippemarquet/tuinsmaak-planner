import { useEffect, useState } from "react";
import type { Garden, GardenBed, Planting, Seed } from "../lib/types";
import { listBeds } from "../lib/api/beds";
import { listSeeds } from "../lib/api/seeds";
import { createPlanting, listPlantings, deletePlanting } from "../lib/api/plantings";
import { DndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import { ColorField } from "./ColorField";

function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) {
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
        <button onClick={onClose} className="ml-2 text-white hover:text-gray-200">✕</button>
      </div>
    </div>
  );
}

function DraggableSeed({ seed }: { seed: Seed }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: `seed-${seed.id}` });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="p-2 border rounded-md bg-secondary cursor-move text-sm"
    >
      {seed.name}
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
  return <div ref={setNodeRef} className={`${base} ${color}`}>{children}</div>;
}

export function PlannerPage({ garden }: { garden: Garden }) {
  const [beds, setBeds] = useState<GardenBed[]>([]);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [plantings, setPlantings] = useState<Planting[]>([]);
  const [popup, setPopup] = useState<{ seed: Seed; bed: GardenBed; segmentIndex: number } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const [currentWeek, setCurrentWeek] = useState<Date>(() => {
    const now = new Date();
    const d = new Date(now);
    d.setDate(now.getDate() - now.getDay() + 1); // maandag
    return d;
  });

  async function reload() {
    const [b, s, p] = await Promise.all([listBeds(garden.id), listSeeds(garden.id), listPlantings(garden.id)]);
    setBeds(b); setSeeds(s); setPlantings(p);
  }

  useEffect(() => { reload().catch(console.error); }, [garden.id]);

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
      await createPlanting({
        seed_id: seed.id,
        garden_bed_id: bed.id,
        garden_id: bed.garden_id,
        planned_plant_date: date,       // ALTIJD plantdatum
        method,
        segments_used: segmentsUsed,
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
      setPlantings(plantings.filter((p) => p.id !== id));
      setToast({ message: "Planting verwijderd.", type: "success" });
    } catch {
      setToast({ message: "Kon planting niet verwijderen.", type: "error" });
    }
  }

  function isActiveInWeek(p: Planting, week: Date) {
    const start = p.planned_plant_date ? new Date(p.planned_plant_date) : (p.planned_sow_date ? new Date(p.planned_sow_date) : null);
    const end = p.planned_harvest_end ? new Date(p.planned_harvest_end) : null;
    if (!start || !end) return false;
    return start <= week && end >= week;
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

  function nextWeek() { const d = new Date(currentWeek); d.setDate(d.getDate() + 7); setCurrentWeek(d); }
  function prevWeek() { const d = new Date(currentWeek); d.setDate(d.getDate() - 7); setCurrentWeek(d); }
  function goToToday() { const now = new Date(); const d = new Date(now); d.setDate(now.getDate() - now.getDay() + 1); setCurrentWeek(d); }
  function formatWeek(d: Date) { const end = new Date(d); end.setDate(d.getDate() + 6); return `${d.getDate()}/${d.getMonth() + 1} – ${end.getDate()}/${end.getMonth() + 1}`; }

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

      <DndContext
        onDragEnd={(event) => {
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
          if (bed && seed) setPopup({ seed, bed, segmentIndex: segIdx });
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="col-span-1 space-y-4">
            <h3 className="text-lg font-semibold">Beschikbare zaden</h3>
            {seeds.map((seed) => <DraggableSeed key={seed.id} seed={seed} />)}
          </div>

          {/* Beds */}
          <div className="col-span-3 space-y-8">
            {beds.map((bed) => {
              const activePlantings = plantings.filter((p) => p.garden_bed_id === bed.id && isActiveInWeek(p, currentWeek));
              const historyPlantings = plantings.filter((p) => p.garden_bed_id === bed.id && getPhase(p, currentWeek) === "afgelopen");

              return (
                <div key={bed.id} className="space-y-4">
                  <h4 className="font-semibold">{bed.name} ({bed.segments} segmenten)</h4>
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
                                    <span>{seed?.name ?? "Onbekend"}</span>
                                    {i === p.start_segment && (
                                      <button onClick={() => handleDeletePlanting(p.id)} className="ml-2 text-red-200 hover:text-red-500">✕</button>
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
            })}
          </div>
        </div>
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
    (seed.sowing_type === "direct" || seed.sowing_type === "presow") ? seed.sowing_type : "direct"
  );
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [color, setColor] = useState<string>(() => {
    // init uit seed.default_color (kan tailwind of hex zijn)
    if (!seed.default_color) return "#22c55e";
    return seed.default_color.startsWith("#") || seed.default_color.startsWith("rgb") ? seed.default_color : "#22c55e";
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm(segmentsUsed, method, date, color);
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
        <label className="block text-sm font-medium mb-1">Plantdatum</label>
        <input
          type="date"
          name="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border rounded-md px-2 py-1 w-full"
        />
      </div>

      <ColorField
        label="Kleur in planner"
        value={color}
        onChange={setColor}
        helperText="Je kunt #RRGGBB of rgb(r,g,b) invoeren. We slaan #hex op."
      />

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel}
          className="px-3 py-1 border border-border rounded-md bg-muted">Annuleren</button>
        <button type="submit" className="px-3 py-1 rounded-md bg-primary text-primary-foreground">Opslaan</button>
      </div>
    </form>
  );
}
