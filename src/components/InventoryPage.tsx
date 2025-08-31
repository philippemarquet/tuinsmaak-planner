import { useEffect, useState } from "react";
import type { Garden, Seed, CropType } from "../lib/types";
import {
  listSeeds,
  createSeed,
  deleteSeed,
} from "../lib/api/seeds";
import { listCropTypes } from "../lib/api/cropTypes";
import { SeedModal } from "./SeedModal";

export function InventoryPage({ garden }: { garden: Garden }) {
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [cropTypes, setCropTypes] = useState<CropType[]>([]);
  const [newName, setNewName] = useState("");
  const [editingSeed, setEditingSeed] = useState<Seed | null>(null);

  useEffect(() => {
    Promise.all([listSeeds(garden.id), listCropTypes()]).then(([s, ct]) => {
      setSeeds(s);
      setCropTypes(ct);
    });
  }, [garden.id]);

  async function handleAdd() {
    if (!newName.trim()) return;
    try {
      const seed = await createSeed({
        garden_id: garden.id,
        name: newName.trim(),
        stock_status: "adequate",
      });
      setSeeds([...seeds, seed]);
      setNewName("");
    } catch (e: any) {
      alert("Kon zaad niet toevoegen: " + e.message);
    }
  }

  async function handleDelete(seedId: string) {
    if (!confirm("Weet je zeker dat je dit zaad wilt verwijderen?")) return;
    try {
      await deleteSeed(seedId);
      setSeeds(seeds.filter((s) => s.id !== seedId));
    } catch (e: any) {
      alert("Kon zaad niet verwijderen: " + e.message);
    }
  }

  function handleUpdated(seed: Seed) {
    setSeeds(seeds.map((s) => (s.id === seed.id ? seed : s)));
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Voorraad</h2>

      {/* Add new */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Naam nieuw zaad"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="border rounded-md px-2 py-1 flex-1"
        />
        <button
          onClick={handleAdd}
          className="bg-primary text-primary-foreground rounded-md px-3 py-1"
        >
          Toevoegen
        </button>
      </div>

      {/* Seeds list */}
      <div className="bg-card border border-border rounded-lg shadow-sm divide-y">
        {seeds.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">
            Nog geen zaden toegevoegd.
          </p>
        )}
        {seeds.map((s) => (
          <div key={s.id} className="flex items-center justify-between p-3">
            <span>{s.name}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setEditingSeed(s)}
                className="text-primary hover:underline"
              >
                Bewerken
              </button>
              <button
                onClick={() => handleDelete(s.id)}
                className="text-destructive hover:underline"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {editingSeed && (
        <SeedModal
          seed={editingSeed}
          cropTypes={cropTypes}
          onClose={() => setEditingSeed(null)}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  );
}
