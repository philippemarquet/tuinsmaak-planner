import { useEffect, useState } from "react";
import type { Garden, GardenBed } from "../lib/types";
import {
  listBeds,
  createBed,
  updateBed,
  deleteBed,
} from "../lib/api/beds";

export function BedsPage({ garden }: { garden: Garden }) {
  const [beds, setBeds] = useState<GardenBed[]>([]);
  const [newName, setNewName] = useState("");
  const [newWidth, setNewWidth] = useState(100);
  const [newLength, setNewLength] = useState(100);

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
      });
      setBeds([...beds, bed]);
      setNewName("");
      setNewWidth(100);
      setNewLength(100);
    } catch (e: any) {
      alert("Kon bak niet toevoegen: " + e.message);
    }
  }

  async function handleUpdate(bed: GardenBed, field: keyof GardenBed, value: any) {
    try {
      const updated = await updateBed(bed.id, { [field]: value });
      setBeds(beds.map((b) => (b.id === bed.id ? updated : b)));
    } catch (e: any) {
      alert("Kon bak niet bijwerken: " + e.message);
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
            className="flex flex-wrap items-center justify-between p-3 gap-2"
          >
            <input
              className="flex-1 bg-transparent"
              value={b.name}
              onChange={(e) => handleUpdate(b, "name", e.target.value)}
            />
            <input
              type="number"
              value={b.width_cm}
              onChange={(e) =>
                handleUpdate(b, "width_cm", Number(e.target.value))
              }
              className="border rounded-md px-2 py-1 w-24"
            />
            <input
              type="number"
              value={b.length_cm}
              onChange={(e) =>
                handleUpdate(b, "length_cm", Number(e.target.value))
              }
              className="border rounded-md px-2 py-1 w-24"
            />
            <button
              onClick={() => handleDelete(b.id)}
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
