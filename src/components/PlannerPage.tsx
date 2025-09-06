import { useEffect, useState } from "react";
import type { Garden, GardenBed, Planting, Seed } from "../lib/types";
import { listBeds } from "../lib/api/beds";
import { listSeeds } from "../lib/api/seeds";
import { createPlanting, listPlantings, deletePlanting } from "../lib/api/plantings";
import { DndContext, useDraggable, useDroppable } from "@dnd-kit/core";

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
    color: string
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
        color: color || seed.default_color || "bg-green-500",
        status: "planned",
      });

      // Na insert opnieuw inladen -> geplande oogstvelden van trigger zitten nu in de data
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
                              return (
                                <div key={`${p.id}-${i}`} className={`${p.color ?? "bg-primary"} text-white text-xs rounded px-2 py-1 flex flex-col`}>
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
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const segmentsUsed = Number(formData.get("segmentsUsed"));
                const method = formData.get("method") as "direct" | "presow";
                const date = formData.get("date") as string;
                const color = formData.get("color") as string;
                handleConfirmPlanting(popup.seed, popup.bed, popup.segmentIndex, segmentsUsed, method, date, color);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium mb-1">Aantal segmenten</label>
                <input type="number" name="segmentsUsed" min={1} max={popup.bed.segments} defaultValue={1}
                  className="border rounded-md px-2 py-1 w-full" />
              </div>
              {popup.seed.sowing_type === "both" ? (
                <div>
                  <label className="block text-sm font-medium mb-1">Zaaimethode</label>
                  <select name="method" defaultValue="direct" className="border rounded-md px-2 py-1 w-full">
                    <option value="direct">Direct</option>
                    <option value="presow">Voorzaaien</option>
                  </select>
                </div>
              ) : (
                <input type="hidden" name="method" value={popup.seed.sowing_type} />
              )}
              <div>
                <label className="block text-sm font-medium mb-1">Plantdatum</label>
                <input type="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)}
                  className="border rounded-md px-2 py-1 w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Kleur</label>
                <select name="color" defaultValue={popup.seed.default_color ?? "bg-green-500"}
                  className="border rounded-md px-2 py-1 w-full">
                  <option value="bg-green-500">Groen</option>
                  <option value="bg-blue-500">Blauw</option>
                  <option value="bg-yellow-500">Geel</option>
                  <option value="bg-red-500">Rood</option>
                  <option value="bg-purple-500">Paars</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setPopup(null)}
                  className="px-3 py-1 border border-border rounded-md bg-muted">Annuleren</button>
                <button type="submit" className="px-3 py-1 rounded-md bg-primary text-primary-foreground">Opslaan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
