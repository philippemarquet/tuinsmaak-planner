import { useEffect, useState } from "react";
import { DndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import type { Garden, Seed, GardenBed, Planting } from "../lib/types";
import { listSeeds } from "../lib/api/seeds";
import { listBeds } from "../lib/api/beds";
import {
  listPlantings,
  createPlanting,
  deletePlanting,
} from "../lib/api/plantings";

export function PlannerPage({ garden }: { garden: Garden }) {
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [beds, setBeds] = useState<GardenBed[]>([]);
  const [plantings, setPlantings] = useState<Planting[]>([]);

  // laad alle data bij openen
  useEffect(() => {
    Promise.all([
      listSeeds(garden.id),
      listBeds(garden.id),
      listPlantings(garden.id),
    ]).then(([s, b, p]) => {
      setSeeds(s);
      setBeds(b);
      setPlantings(p);
    });
  }, [garden.id]);

  // nieuwe planting opslaan
  async function handleDrop(seedId: string, bedId: string) {
    try {
      const planting = await createPlanting({
        garden_id: garden.id,
        seed_id: seedId,
        garden_bed_id: bedId,
        method: "direct",
        planned_sow_date: new Date().toISOString().slice(0, 10),
        status: "planned",
      });
      setPlantings([...plantings, planting]);
    } catch (e: any) {
      console.error("createPlanting error:", e.message);
      alert("Kon planting niet opslaan: " + e.message);
    }
  }

  // planting verwijderen
  async function handleDelete(plantingId: string) {
    if (!confirm("Weet je zeker dat je deze planting wilt verwijderen?")) return;
    try {
      await deletePlanting(plantingId);
      setPlantings(plantings.filter((p) => p.id !== plantingId));
    } catch (e: any) {
      console.error("deletePlanting error:", e.message);
      alert("Kon planting niet verwijderen: " + e.message);
    }
  }

  return (
    <DndContext
      onDragEnd={(event) => {
        const { over, active } = event;
        if (over && active) {
          const seedId = active.id as string;
          const bedId = over.id as string;
          handleDrop(seedId, bedId);
        }
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Seeds list */}
        <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
          <h3 className="font-semibold mb-3">Voorraad</h3>
          <div className="space-y-2">
            {seeds.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nog geen zaden in voorraad.
              </p>
            )}
            {seeds.map((s) => (
              <DraggableSeed key={s.id} seed={s} />
            ))}
          </div>
        </div>

        {/* Beds grid */}
        <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {beds.length === 0 && (
            <p className="text-sm text-muted-foreground col-span-2">
              Nog geen bakken aangemaakt.
            </p>
          )}
          {beds.map((b) => (
            <DroppableBed
              key={b.id}
              bed={b}
              plantings={plantings.filter((p) => p.garden_bed_id === b.id)}
              seeds={seeds}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </div>
    </DndContext>
  );
}

function DraggableSeed({ seed }: { seed: Seed }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: seed.id,
    });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`px-3 py-2 rounded-md border cursor-grab select-none transition
        ${
          isDragging
            ? "opacity-50 bg-muted"
            : "bg-secondary hover:bg-secondary/80"
        }
      `}
      style={{
        transform: transform
          ? `translate(${transform.x}px, ${transform.y}px)`
          : undefined,
      }}
    >
      {seed.name}
    </div>
  );
}

function DroppableBed({
  bed,
  plantings,
  seeds,
  onDelete,
}: {
  bed: GardenBed;
  plantings: Planting[];
  seeds: Seed[];
  onDelete: (id: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: bed.id,
  });

  return (
    <div
      ref={setNodeRef}
      className={`p-4 rounded-lg border-2 transition
        ${isOver ? "border-primary bg-accent" : "border-border bg-card"}
      `}
      style={{ minHeight: "150px" }}
    >
      <h4 className="font-medium mb-2">{bed.name}</h4>
      {plantings.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Sleep hier gewassen naartoe
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {plantings.map((p) => {
            const seed = seeds.find((s) => s.id === p.seed_id);
            return (
              <button
                key={p.id}
                onClick={() => onDelete(p.id)}
                className="inline-flex items-center rounded-md bg-primary text-primary-foreground px-2 py-1 text-xs hover:bg-destructive hover:text-destructive-foreground"
                title="Klik om te verwijderen"
              >
                {seed?.name ?? "Onbekend"} ✕
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
