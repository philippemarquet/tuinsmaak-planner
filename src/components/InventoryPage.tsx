import { useEffect, useState } from "react";
import type { Seed, Garden, CropType } from "../lib/types";
import { listSeeds, deleteSeed } from "../lib/api/seeds";
import { listCropTypes } from "../lib/api/cropTypes";
import { SeedModal } from "./SeedModal";

function SeedCard({
  seed,
  onEdit,
  onDelete,
}: {
  seed: Seed;
  onEdit: (s: Seed) => void;
  onDelete: (s: Seed) => void;
}) {
  return (
    <div className="bg-card border rounded-lg shadow-sm p-4 flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <span
            className={`inline-block w-4 h-4 rounded ${seed.default_color ?? "bg-green-500"}`}
            title="Standaardkleur"
          />
          {seed.name}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => onEdit(seed)}
            className="text-sm px-2 py-1 rounded bg-blue-500 text-white hover:bg-blue-600"
          >
            Bewerken
          </button>
          <button
            onClick={() => onDelete(seed)}
            className="text-sm px-2 py-1 rounded bg-red-500 text-white hover:bg-red-600"
          >
            Verwijderen
          </button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Aangekocht: {seed.purchase_date ?? "?"} | Type: {seed.sowing_type}
      </p>
      <p className="text-sm">
        Voorraad:{" "}
        <span
          className={
            seed.stock_status === "adequate"
              ? "text-green-600"
              : seed.stock_status === "low"
              ? "text-yellow-600"
              : "text-red-600"
          }
        >
          {seed.stock_status}
        </span>
      </p>
    </div>
  );
}

export function InventoryPage({ garden }: { garden: Garden }) {
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [editing, setEditing] = useState<Seed | null>(null);
  const [cropTypes, setCropTypes] = useState<CropType[]>([]);
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => {
    listSeeds(garden.id).then(setSeeds).catch(console.error);
    listCropTypes().then(setCropTypes).catch(console.error);
  }, [garden.id]);

  async function handleDelete(seed: Seed) {
    if (!confirm("Weet je zeker dat je dit zaad wilt verwijderen?")) return;
    try {
      await deleteSeed(seed.id);
      setSeeds(seeds.filter((s) => s.id !== seed.id));
    } catch (err: any) {
      alert("Kon zaad niet verwijderen: " + err.message);
    }
  }

  function upsertLocal(updated: Seed) {
    setSeeds((prev) => {
      const idx = prev.findIndex((s) => s.id === updated.id);
      if (idx === -1) return [...prev, updated];
      const copy = prev.slice();
      copy[idx] = updated;
      return copy;
    });
  }

  return (
    <div className="space-y-6">
      {/* Titel + knoppen */}
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold">Voorraad</h2>
        <button
          onClick={() => setNewOpen(true)}
          className="px-3 py-1 rounded bg-primary text-primary-foreground"
        >
          Nieuw zaad
        </button>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {seeds.map((seed) => (
          <SeedCard
            key={seed.id}
            seed={seed}
            onEdit={setEditing}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {/* Nieuw */}
      {newOpen && (
        <SeedModal
          gardenId={garden.id}
          seed={{}} // leeg = nieuw
          onClose={() => setNewOpen(false)}
          onSaved={(s) => {
            upsertLocal(s);
            setNewOpen(false);
          }}
        />
      )}

      {/* Bewerken */}
      {editing && (
        <SeedModal
          gardenId={garden.id}
          seed={editing}
          onClose={() => setEditing(null)}
          onSaved={(s) => {
            upsertLocal(s);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
