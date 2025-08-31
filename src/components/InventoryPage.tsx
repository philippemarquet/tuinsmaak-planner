import { useEffect, useState } from "react";
import type { Garden, Seed } from "../lib/types";
import { listSeeds, saveSeed, deleteSeed } from "../lib/api/seeds";

export function InventoryPage({ garden }: { garden: Garden }) {
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [editing, setEditing] = useState<Seed | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSeeds(garden.id).then(setSeeds).catch(console.error);
  }, [garden.id]);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const fields: Partial<Seed> = {
      garden_id: garden.id,
      name: formData.get("name") as string,
      purchase_date: formData.get("purchase_date") as string,
    };

    try {
      const saved = await saveSeed(editing?.id, fields);
      if (editing && editing.id) {
        setSeeds(seeds.map((s) => (s.id === editing.id ? saved : s)));
      } else {
        setSeeds([...seeds, saved]);
      }
      setEditing(null);
      setError(null);
    } catch (err) {
      setError("Opslaan mislukt: " + (err as any).message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Weet je zeker dat je dit zaad wilt verwijderen?")) return;
    try {
      await deleteSeed(id);
      setSeeds(seeds.filter((s) => s.id !== id));
    } catch {
      alert("Verwijderen mislukt");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold">Voorraad</h2>
        <button
          onClick={() =>
            setEditing({
              id: "" as any,
              garden_id: garden.id,
              name: "",
              purchase_date: null,
            } as Seed)
          }
          className="px-3 py-1 rounded bg-primary text-primary-foreground"
        >
          Nieuw zaad
        </button>
      </div>

      {/* Cards overzicht */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {seeds.map((seed) => (
          <div key={seed.id} className="border rounded-lg p-4 shadow-sm bg-card">
            <h3 className="font-semibold">{seed.name}</h3>
            <p className="text-sm text-muted-foreground">
              Aangekocht: {seed.purchase_date ?? "-"}
            </p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => setEditing(seed)}
                className="px-2 py-1 text-xs rounded bg-secondary"
              >
                Bewerken
              </button>
              <button
                onClick={() => handleDelete(seed.id)}
                className="px-2 py-1 text-xs rounded bg-red-500 text-white"
              >
                Verwijderen
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Popup editor */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg shadow-lg w-full max-w-md space-y-4">
            <h3 className="text-lg font-semibold">
              Zaad {editing.id ? "bewerken" : "toevoegen"}
            </h3>
            {error && <div className="text-red-600">{error}</div>}
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm">Naam</label>
                <input
                  type="text"
                  name="name"
                  defaultValue={editing.name ?? ""}
                  required
                  className="border rounded px-2 py-1 w-full"
                />
              </div>
              <div>
                <label className="block text-sm">Aankoopdatum</label>
                <input
                  type="date"
                  name="purchase_date"
                  defaultValue={editing.purchase_date ?? ""}
                  className="border rounded px-2 py-1 w-full"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-3 py-1 border rounded bg-muted"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 rounded bg-primary text-primary-foreground"
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
