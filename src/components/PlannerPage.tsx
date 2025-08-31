import { useEffect, useState } from "react";
import type { Garden, GardenBed, Planting, Seed } from "../lib/types";
import { listBeds } from "../lib/api/beds";
import { listSeeds } from "../lib/api/seeds";
import { createPlanting, listPlantings } from "../lib/api/plantings";
import { DndContext, useDraggable, useDroppable } from "@dnd-kit/core";

interface DraggableSeedProps {
  seed: Seed;
}

function DraggableSeed({ seed }: DraggableSeedProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `seed-${seed.id}`,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
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

interface DroppableSegmentProps {
  bed: GardenBed;
  segmentIndex: number;
  children: React.ReactNode;
}

function DroppableSegment({ bed, segmentIndex, children }: DroppableSegmentProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `bed-${bed.id}-segment-${segmentIndex}`,
  });
  return (
    <div
      ref={setNodeRef}
      className={`flex items-center justify-center border border-dashed rounded-sm min-h-[60px] ${
        isOver ? "bg-green-100" : "bg-muted"
      }`}
    >
      {children}
    </div>
  );
}

export function PlannerPage({ garden }: { garden: Garden }) {
  const [beds, setBeds] = useState<GardenBed[]>([]);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [plantings, setPlantings] = useState<Planting[]>([]);
  const [popup, setPopup] = useState<{
    seed: Seed;
    bed: GardenBed;
    segmentIndex: number;
  } | null>(null);

  useEffect(() => {
    Promise.all([listBeds(garden.id), listSeeds(garden.id), listPlantings(garden.id)])
      .then(([b, s, p]) => {
        setBeds(b);
        setSeeds(s);
        setPlantings(p);
      })
      .catch(console.error);
  }, [garden.id]);

  async function handleConfirmPlanting(
    seed: Seed,
    bed: GardenBed,
    segmentIndex: number,
    segmentsUsed: number,
    method: "direct" | "presow",
    date: string
  ) {
    try {
      const planting = await createPlanting({
        seed_id: seed.id,
        garden_bed_id: bed.id,
        planned_sow_date: date,
        method,
        segments_used: segmentsUsed,
        status: "planned",
      });
      setPlantings([...plantings, planting]);
      setPopup(null);
    } catch (e: any) {
      alert("Kon planting niet opslaan: " + e.message);
    }
  }

  return (
    <div className="space-y-10">
      <h2 className="text-3xl font-bold">Planner</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Sidebar met seeds */}
        <div className="col-span-1 space-y-4">
          <h3 className="text-lg font-semibold">Beschikbare zaden</h3>
          {seeds.length === 0 && (
            <p className="text-sm text-muted-foreground">Geen zaden</p>
          )}
          {seeds.map((seed) => (
            <DraggableSeed key={seed.id} seed={seed} />
          ))}
        </div>

        {/* Beds visual */}
        <div className="col-span-3 space-y-8">
          <DndContext
            onDragEnd={(event) => {
              if (!event.over) return;
              const [_, bedId, __, segIdx] = event.over.id.split("-");
              const bed = beds.find((b) => b.id === bedId);
              const seedId = event.active.id.replace("seed-", "");
              const seed = seeds.find((s) => s.id === seedId);
              if (bed && seed) {
                setPopup({
                  seed,
                  bed,
                  segmentIndex: parseInt(segIdx),
                });
              }
            }}
          >
            {beds.map((bed) => (
              <div key={bed.id} className="space-y-2">
                <h4 className="font-semibold">
                  {bed.name} ({bed.segments} segmenten)
                </h4>
                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: `repeat(${bed.segments}, 1fr)` }}
                >
                  {Array.from({ length: bed.segments }, (_, i) => (
                    <DroppableSegment
                      key={i}
                      bed={bed}
                      segmentIndex={i}
                    >
                      {plantings
                        .filter(
                          (p) =>
                            p.garden_bed_id === bed.id &&
                            p.segments_used > i // heel simplistische check
                        )
                        .map((p) => {
                          const seed = seeds.find((s) => s.id === p.seed_id);
                          return (
                            <div
                              key={p.id}
                              className="bg-primary text-primary-foreground text-xs rounded px-2 py-1"
                            >
                              {seed?.name ?? "Onbekend"}
                            </div>
                          );
                        })}
                    </DroppableSegment>
                  ))}
                </div>
              </div>
            ))}
          </DndContext>
        </div>
      </div>

      {/* Popup */}
      {popup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg shadow-lg w-full max-w-md space-y-4">
            <h3 className="text-lg font-semibold">Nieuwe planting</h3>
            <p>
              <strong>{popup.seed.name}</strong> in{" "}
              <em>{popup.bed.name}</em>, segment {popup.segmentIndex + 1}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const segmentsUsed = Number(formData.get("segmentsUsed"));
                const method = formData.get("method") as "direct" | "presow";
                const date = formData.get("date") as string;
                handleConfirmPlanting(
                  popup.seed,
                  popup.bed,
                  popup.segmentIndex,
                  segmentsUsed,
                  method,
                  date
                );
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium mb-1">
                  Aantal segmenten gebruiken
                </label>
                <input
                  type="number"
                  name="segmentsUsed"
                  min={1}
                  max={popup.bed.segments}
                  defaultValue={1}
                  className="border rounded-md px-2 py-1 w-full"
                />
              </div>
              {popup.seed.sowing_type === "both" && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Zaaimethode
                  </label>
                  <select
                    name="method"
                    className="border rounded-md px-2 py-1 w-full"
                    defaultValue="direct"
                  >
                    <option value="direct">Direct</option>
                    <option value="presow">Voorzaaien</option>
                  </select>
                </div>
              )}
              {popup.seed.sowing_type !== "both" && (
                <input
                  type="hidden"
                  name="method"
                  value={popup.seed.sowing_type}
                />
              )}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Plantdatum
                </label>
                <input
                  type="date"
                  name="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className="border rounded-md px-2 py-1 w-full"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPopup(null)}
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
          </div>
        </div>
      )}
    </div>
  );
}
