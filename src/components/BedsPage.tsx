import { useEffect, useState } from "react";
import type { Garden, GardenBed } from "../lib/types";
import {
  listBeds,
  createBed,
  deleteBed,
} from "../lib/api/beds";
import { BedModal } from "./BedModal";

export function BedsPage({ garden }: { garden: Garden }) {
  const [beds, setBeds] = useState<GardenBed[]>([]);
  const [newName, setNewName] = useState("");
  const [newWidth, setNewWidth] = useState(100);
  const [newLength, setNewLength] = useState(100);
  const [editingBed, setEditingBed] = useState<GardenBed | null>(null);

  useEffect(() => {
    listBeds(garden.id).then(setBeds).catch(console.error);
  }, [garden.id]);

  async function handleAdd() {
    if (!newName.trim()) return;
    try {
      const bed = await createBed({
        garden_id: garden.id,
        name: newName.trim(),
        width_cm: newWidth,
        length_cm: newLength,
        is_greenhouse: false,
      });
      setBeds([...beds, bed]);
      setNewName("");
      setNewWidth(100);
      setNewLength(100);
    } catch (e: any) {
      alert("Kon bak niet toevoegen: " + e.message);
    }
  }

  async function handleDelete(bedId: string) {
    if (!confirm("Weet je zeker dat je deze bak wilt verwijderen?")) return;
    try {
      await deleteBed(bedId);
      setBeds(beds.filter((b) => b.id !== bedId));
    } catch (e: any) {
      alert("Kon bak niet verwijderen: " + e.message);
    }
  }

  function handleUpdated(bed: GardenBed) {
    setBeds(beds.map((b) => (b.id === bed.id ? bed : b)));
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Bakken</h2>

      {/* Add new */}
      <div className="flex flex-wrap gap-2 items-end">
        <input
          type="text"
          placeholder="Naam nieuwe bak"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="border rounded-md px-2 py-1 flex-1"
        />
        <input
          type="number"
          placeholder="Breedte (cm)"
          value={newWidth}
          onChange={(e) => setNewWidth(Number(e.target.value))}
          className="border rounded-md px-2 py-1 w-28"
        />
        <input
          type="number"
          placeholder="Lengte (cm)"
          value={newLength}
          onChange={(e) => setNewLength(Number(e.target.value))}
          className="border rounded-md px-2 py-1 w-28"
        />
        <button
          onClick={handleAdd}
          className="bg-primary text-primary-foreground rounded-md px-3 py-1"
        >
          Toevoegen
        </button>
      </div>

      {/* Beds list */}
      <div className="bg-card border border-border rounded-lg shadow-sm divide-y">
        {beds.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">
            Nog geen bakken toegevoegd.
          </p>
        )}
        {beds.map((b) => (
          <div
            key={b.id}
            className="flex items-center justify-between p-3"
          >
            <span>
              {b.name} ({b.width_cm}×{b.length_cm} cm)
              {b.is_greenhouse ? " 🌱 [Kas]" : ""}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setEditingBed(b)}
                className="text-primary hover:underline"
              >
                Bewerken
              </button>
              <button
                onClick={() => handleDelete(b.id)}
                className="text-destructive hover:underline"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {editingBed && (
        <BedModal
          bed={editingBed}
          onClose={() => setEditingBed(null)}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  );
}
