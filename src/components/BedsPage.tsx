import { useEffect, useState } from "react";
import type { Garden, GardenBed } from "../lib/types";
import { listBeds, createBed, deleteBed } from "../lib/api/beds";
import { BedModal } from "./BedModal";
import { PlusCircle, Pencil, Trash2 } from "lucide-react";

export function BedsPage({ garden }: { garden: Garden }) {
  const [beds, setBeds] = useState<GardenBed[]>([]);
  const [newName, setNewName] = useState("");
  const [newWidth, setNewWidth] = useState(100);
  const [newLength, setNewLength] = useState(100);
  const [newSegments, setNewSegments] = useState(1);
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
        segments: newSegments,
        is_greenhouse: false,
      });
      setBeds([...beds, bed]);
      setNewName("");
      setNewWidth(100);
      setNewLength(100);
      setNewSegments(1);
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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">Bakken</h2>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Naam nieuwe bak"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="border rounded-md px-2 py-1"
          />
          <input
            type="number"
            placeholder="Breedte (cm)"
            value={newWidth}
            onChange={(e) => setNewWidth(Number(e.target.value))}
            className="border rounded-md px-2 py-1 w-24"
          />
          <input
            type="number"
            placeholder="Lengte (cm)"
            value={newLength}
            onChange={(e) => setNewLength(Number(e.target.value))}
            className="border rounded-md px-2 py-1 w-24"
          />
          <input
            type="number"
            min={1}
            max={12}
            placeholder="Segmenten"
            value={newSegments}
            onChange={(e) => setNewSegments(Number(e.target.value))}
            className="border rounded-md px-2 py-1 w-24"
          />
          <button
            onClick={handleAdd}
            className="flex items-center gap-1 bg-primary text-primary-foreground px-3 py-1 rounded-md"
          >
            <PlusCircle className="h-4 w-4" />
            Toevoegen
          </button>
        </div>
      </div>

      {/* Beds list */}
      {beds.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nog geen bakken toegevoegd.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {beds.map((b) => (
            <div
              key={b.id}
              className="p-5 border rounded-xl bg-card shadow-md hover:shadow-lg transition space-y-3"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-semibold text-lg">{b.name}</h4>
                  <p className="text-xs text-muted-foreground">
                    {b.width_cm} × {b.length_cm} cm — {b.segments} segment(en)
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingBed(b)}
                    className="p-1 text-muted-foreground hover:text-primary"
                    title="Bewerken"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(b.id)}
                    className="p-1 text-muted-foreground hover:text-destructive"
                    title="Verwijderen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {b.is_greenhouse && (
                <span className="inline-block text-xs bg-green-600 text-white px-2 py-0.5 rounded">
                  Kas
                </span>
              )}
            </div>
          ))}
        </div>
      )}

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
