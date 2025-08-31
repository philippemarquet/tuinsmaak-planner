import { useEffect, useState } from "react";
import type { Garden, Seed } from "../lib/types";
import {
  listSeeds,
  createSeed,
  updateSeed,
  deleteSeed,
} from "../lib/api/seeds";

export function InventoryPage({ garden }: { garden: Garden }) {
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    listSeeds(garden.id).then(setSeeds).catch(console.error);
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

  async function handleUpdate(seed: Seed, field: keyof Seed, value: any) {
    try {
      const updated = await updateSeed(seed.id, { [field]: value });
      setSeeds(seeds.map((s) => (s.id === seed.id ? updated : s)));
    } catch (e: any) {
      alert("Kon zaad niet bijwerken: " + e.message);
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
            <input
              className="flex-1 bg-transparent"
              value={s.name}
              onChange={(e) => handleUpdate(s, "name", e.target.value)}
            />
            <select
              value={s.stock_status}
              onChange={(e) => handleUpdate(s, "stock_status", e.target.value)}
              className="border rounded-md px-2 py-1 ml-2"
            >
              <option value="adequate">Op voorraad</option>
              <option value="low">Bijna op</option>
              <option value="out">Op</option>
            </select>
            <button
              onClick={() => handleDelete(s.id)}
              className="ml-2 text-destructive hover:underline"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
